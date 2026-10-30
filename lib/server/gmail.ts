import "server-only";
import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { decrypt, encrypt } from "@/lib/crypto";
import { buildMime, type Mime } from "@/lib/email-draft";
import { SITE_URL } from "@/lib/site";

/**
 * Gmail send-on-approval. Scope is gmail.send only: we can send a message the user approved, and
 * never read their inbox. The refresh token is AES-GCM encrypted at rest; disconnecting revokes it.
 */

const SCOPES = ["https://www.googleapis.com/auth/gmail.send", "openid", "email"];
export const GMAIL_STATE_COOKIE = "h1b_gmail_state";
const REDIRECT = () => `${SITE_URL}/api/gmail/callback`;
const db = () => createAdminInsForge().database;

export const gmailConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

let key: Buffer | null = null;
const macKey = () => (key ??= Buffer.from(hkdfSync("sha256", Buffer.from(process.env.PROFILE_DATA_KEY ?? "", "base64"), "h1bound", "gmail-state-v1", 32)));
const mac = (s: string) => createHmac("sha256", macKey()).update(s).digest("base64url");

/** OAuth state = `<userId>.<nonce>.<hmac>`, also set as a cookie, so a callback can't be replayed for another account. */
export function newState(userId: string): string {
  const body = `${userId}.${randomBytes(16).toString("base64url")}`;
  return `${body}.${mac(body)}`;
}

export function checkState(state: string | null, cookie: string | undefined, userId: string): boolean {
  if (!state || !cookie || state !== cookie) return false;
  const i = state.lastIndexOf(".");
  const body = state.slice(0, i);
  const want = Buffer.from(mac(body));
  const got = Buffer.from(state.slice(i + 1));
  return body.startsWith(`${userId}.`) && want.length === got.length && timingSafeEqual(want, got);
}

export function authUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: REDIRECT(), response_type: "code", scope: SCOPES.join(" "),
    access_type: "offline", prompt: "consent", include_granted_scopes: "false", state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; id_token?: string; scope?: string; error?: string };

async function token(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...params }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json()) as TokenResponse;
  if (!res.ok || body.error) throw new Error(`google token: ${body.error ?? res.status}`);
  return body;
}

/** Email from the id_token Google just returned over TLS to our server; no signature check needed for this use. */
function emailFromIdToken(idToken: string | undefined): string | null {
  try {
    const payload = JSON.parse(Buffer.from((idToken ?? "").split(".")[1], "base64url").toString("utf8")) as { email?: string; email_verified?: boolean };
    return payload.email_verified ? payload.email ?? null : null;
  } catch {
    return null;
  }
}

export async function connectGmail(userId: string, code: string): Promise<{ email: string }> {
  const t = await token({ code, grant_type: "authorization_code", redirect_uri: REDIRECT() });
  const email = emailFromIdToken(t.id_token);
  if (!t.refresh_token || !email) throw new Error("Google didn't return a refresh token or a verified email");
  if (!t.scope?.includes("gmail.send")) throw new Error("gmail.send permission was not granted");
  const { error } = await db().from("gmail_accounts").upsert(
    { user_id: userId, email_enc: encrypt(email), refresh_token_enc: encrypt(t.refresh_token), connected_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
  return { email };
}

export async function gmailAccount(userId: string): Promise<{ email: string; refreshToken: string } | null> {
  const { data } = await db().from("gmail_accounts").select("email_enc,refresh_token_enc").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  const r = data as { email_enc: string; refresh_token_enc: string };
  return { email: decrypt(r.email_enc), refreshToken: decrypt(r.refresh_token_enc) };
}

export async function disconnectGmail(userId: string) {
  const acct = await gmailAccount(userId);
  if (acct) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(acct.refreshToken)}`, { method: "POST" }).catch(() => {});
  await db().from("gmail_accounts").delete().eq("user_id", userId);
}

/** Sends one message from the user's own Gmail. Returns Gmail's message id. */
export async function sendGmail(userId: string, m: Omit<Mime, "from">): Promise<{ id: string; from: string }> {
  const acct = await gmailAccount(userId);
  if (!acct) throw new Error("not_connected");
  const raw = buildMime({ ...m, from: acct.email });
  const { access_token } = await token({ refresh_token: acct.refreshToken, grant_type: "refresh_token" });
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { authorization: `Bearer ${access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ raw }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !body.id) throw new Error(`gmail send: ${body.error?.message ?? res.status}`);
  return { id: body.id, from: acct.email };
}
