import "server-only";
import type { UIMessage } from "ai";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { decryptJson, encryptJson } from "@/lib/crypto";

/** Chat history, one encrypted row per UI message. Only the last HISTORY messages are replayed to the model. */
export const HISTORY = 40;
export const DAILY_MESSAGE_CAP = 150;

const db = () => createAdminInsForge().database;

export async function loadChat(userId: string, limit = HISTORY): Promise<UIMessage[]> {
  const { data } = await db().from("chat_messages").select("message_enc,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  return ((data ?? []) as { message_enc: string }[]).reverse().map((r) => decryptJson<UIMessage>(r.message_enc));
}

export async function appendMessages(userId: string, messages: UIMessage[]) {
  if (!messages.length) return;
  const base = Date.now();
  const rows = messages.map((m, i) => ({ user_id: userId, message_enc: encryptJson(m), created_at: new Date(base + i).toISOString() }));
  const { error } = await db().from("chat_messages").insert(rows);
  if (error) throw new Error(error.message);
}

export async function messagesToday(userId: string): Promise<number> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await db().from("chat_messages").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  return count ?? 0;
}
