import "server-only";
import { createHmac, hkdfSync, randomBytes } from "node:crypto";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { decrypt, encrypt } from "@/lib/crypto";

/**
 * Telegram bot plumbing. A chat is linked to an account only through a one-time /start token the
 * signed-in user generated; the chat id is stored encrypted, with a keyed hash for webhook lookups.
 */

const db = () => createAdminInsForge().database;
export const telegramConfigured = () => Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME && process.env.TELEGRAM_WEBHOOK_SECRET);

let key: Buffer | null = null;
const macKey = () => (key ??= Buffer.from(hkdfSync("sha256", Buffer.from(process.env.PROFILE_DATA_KEY ?? "", "base64"), "h1bound", "telegram-chat-v1", 32)));
export const chatHash = (chatId: number) => createHmac("sha256", macKey()).update(String(chatId)).digest("base64url");

export async function tg(method: string, body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
  });
  return res.ok;
}

export const sendText = (chatId: number, text: string, extra: Record<string, unknown> = {}) =>
  tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...extra });

/** Deep link that opens the bot with a one-time token for this user (valid 30 minutes). */
export async function linkUrl(userId: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  const { error } = await db().from("telegram_links").insert({ token, user_id: userId });
  if (error) throw new Error(error.message);
  return `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${token}`;
}

/** Consumes a /start token: links the chat and turns daily picks on. Returns the user id, or null. */
export async function claimLink(token: string, chatId: number): Promise<string | null> {
  const { data } = await db().from("telegram_links").delete().eq("token", token).gt("expires_at", new Date().toISOString()).select("user_id");
  const userId = (data as { user_id: string }[] | null)?.[0]?.user_id;
  if (!userId) return null;
  const hash = chatHash(chatId);
  // A chat can belong to one account: unlink it anywhere else first.
  await db().from("consents").update({ telegram_chat_enc: null, telegram_chat_hash: null, telegram_updates: false }).eq("telegram_chat_hash", hash).neq("user_id", userId);
  const { error } = await db().from("consents").upsert(
    { user_id: userId, telegram_chat_enc: encrypt(String(chatId)), telegram_chat_hash: hash, telegram_updates: true, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
  return userId;
}

export async function userForChat(chatId: number): Promise<string | null> {
  const { data } = await db().from("consents").select("user_id").eq("telegram_chat_hash", chatHash(chatId)).maybeSingle();
  return (data as { user_id: string } | null)?.user_id ?? null;
}

export async function stopChat(chatId: number) {
  await db().from("consents").update({ telegram_updates: false, updated_at: new Date().toISOString() }).eq("telegram_chat_hash", chatHash(chatId));
}

export async function unlinkTelegram(userId: string) {
  await db().from("consents").update({ telegram_chat_enc: null, telegram_chat_hash: null, telegram_updates: false, updated_at: new Date().toISOString() }).eq("user_id", userId);
}

export const chatIdOf = (enc: string | null) => (enc ? Number(decrypt(enc)) : null);
