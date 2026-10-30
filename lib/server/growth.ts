import "server-only";
import { createHmac, hkdfSync } from "node:crypto";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { encrypt } from "@/lib/crypto";
import { REFERRAL, TRIAL } from "@/lib/quota";
import { loadProfile } from "./profile";

/**
 * Growth features that touch the database: invite-a-friend rewards, the no-card Pro trial and the
 * WhatsApp waitlist. Everything here runs with the admin key; clients can only read their own rows.
 */

const db = () => createAdminInsForge().database;

/** Referral codes are public by design (they're in share links), so the cookie only needs a format check. */
export const REF_COOKIE = "h1b_ref";
export const REF_MAX_AGE = 30 * 24 * 3600;
export const isRefCode = (s: string | null | undefined): s is string => typeof s === "string" && /^[0-9a-f]{10}$/.test(s);

/** Makes sure the profile row exists (it holds the referral code and trial window). */
async function ensureProfileRow(userId: string) {
  const { error } = await db().from("profiles").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

export async function referralInfo(userId: string): Promise<{ code: string; activated: number; maxFriends: number; jobsPerFriend: number }> {
  await ensureProfileRow(userId);
  const [p, r] = await Promise.all([
    db().from("profiles").select("referral_code").eq("user_id", userId).single(),
    db().from("referrals").select("referred_id", { count: "exact", head: true }).eq("referrer_id", userId).not("activated_at", "is", null),
  ]);
  if (p.error) throw new Error(p.error.message);
  return { code: (p.data as { referral_code: string }).referral_code, activated: r.count ?? 0, ...REFERRAL };
}

export async function activatedReferrals(userId: string): Promise<number> {
  const { count, error } = await db().from("referrals").select("referred_id", { count: "exact", head: true }).eq("referrer_id", userId).not("activated_at", "is", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Records who invited a brand-new account. Self-referrals and unknown codes are ignored, and an
 * account can only ever be referred once. Activates right away if the account already has a resume
 * (a guest who uploaded one before signing up).
 */
export async function claimReferral(userId: string, code: string | null | undefined): Promise<void> {
  if (!isRefCode(code)) return;
  const { data } = await db().from("profiles").select("user_id").eq("referral_code", code).maybeSingle();
  const referrer = (data as { user_id: string } | null)?.user_id;
  if (!referrer || referrer === userId) return;
  const { error } = await db().from("referrals").upsert({ referred_id: userId, referrer_id: referrer }, { onConflict: "referred_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  if ((await loadProfile(userId))?.details?.resumeText) await activateReferral(userId);
}

/** The friend uploaded a resume: now the invite counts toward the referrer's bonus jobs. */
export async function activateReferral(userId: string): Promise<void> {
  const { error } = await db().from("referrals").update({ activated_at: new Date().toISOString() }).eq("referred_id", userId).is("activated_at", null);
  if (error) throw new Error(error.message);
}

export type TrialState = { endsAt: string | null; active: boolean; used: boolean };

export async function trialState(userId: string): Promise<TrialState> {
  const { data } = await db().from("profiles").select("trial_ends_at").eq("user_id", userId).maybeSingle();
  const endsAt = (data as { trial_ends_at: string | null } | null)?.trial_ends_at ?? null;
  return { endsAt, active: Boolean(endsAt && Date.parse(endsAt) > Date.now()), used: Boolean(endsAt) };
}

/** Starts the 7-day trial once per account. The conditional update makes a double click harmless. */
export async function startTrial(userId: string): Promise<{ ok: true; endsAt: string } | { ok: false; reason: "used" }> {
  await ensureProfileRow(userId);
  const endsAt = new Date(Date.now() + TRIAL.days * 86_400_000).toISOString();
  const { data, error } = await db().from("profiles").update({ trial_ends_at: endsAt }).eq("user_id", userId).is("trial_ends_at", null).select("trial_ends_at");
  if (error) throw new Error(error.message);
  return (data as unknown[] | null)?.length ? { ok: true, endsAt } : { ok: false, reason: "used" };
}

/** A real Stripe/Razorpay subscription, as opposed to the free trial. */
export async function hasPaidPlan(userId: string): Promise<boolean> {
  const { data } = await db().from("billing_entitlements").select("status").eq("user_id", userId).maybeSingle();
  return Boolean(data && ["active", "trialing", "past_due"].includes((data as { status: string }).status));
}

/**
 * Hunter's free plan has 25 lookups a month, so trial users get a few; paying users are unlimited
 * (within the monthly cap enforced in hunter.ts).
 */
export async function contactLookupAllowed(userId: string): Promise<boolean> {
  if (await hasPaidPlan(userId)) return true;
  const t = await trialState(userId);
  if (!t.active || !t.endsAt) return false;
  const since = new Date(Date.parse(t.endsAt) - TRIAL.days * 86_400_000).toISOString();
  const { count } = await db().from("outreach").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("kind", "cold_email").gte("created_at", since);
  return (count ?? 0) < TRIAL.contactLookups;
}

let key: Buffer | null = null;
const emailHash = (email: string) => {
  if (!key) key = Buffer.from(hkdfSync("sha256", Buffer.from(process.env.PROFILE_DATA_KEY ?? "", "base64"), "h1bound", "waitlist-v1", 32));
  return createHmac("sha256", key).update(email).digest("base64url");
};

export async function joinWaitlist(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  const { error } = await db().from("waitlist").upsert(
    { email_hash: emailHash(email), email_enc: encrypt(email), channel: "whatsapp" },
    { onConflict: "email_hash", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}
