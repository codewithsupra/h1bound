import "server-only";
import { adminDb } from "@/lib/supabase/admin";
import { decryptJson, encrypt, encryptJson } from "@/lib/crypto";
import { sendGmail } from "@/lib/server/gmail";
import { FOLLOW_UP_AFTER_DAYS, firstEmailThread, threadSubject } from "@/lib/server/followups";

export type SendInput = { outreachId: string; to: string; subject: string; body: string; autoFollowUp?: { body: string } };
export type SendResult =
  | { ok: true; from: string; autoFollowUpAt: string | null }
  | { ok: false; error: "not_found" | "already_sent" | "too_soon" | "not_connected" | "send_failed"; status: number; after?: string | null };

/**
 * Sends one drafted email the student approved, from their own Gmail. The one path for every way
 * of approving (web, Telegram): only their own draft, only once (claimed before sending), and a
 * follow-up only after the first email went out, as a reply in its thread.
 */
export async function sendApprovedEmail(userId: string, userName: string | null, input: SendInput): Promise<SendResult> {
  const { outreachId, to, subject, body, autoFollowUp } = input;
  const db = adminDb();
  const { data } = await db.from("outreach").select("id,job_id,kind,sent_at,body_enc").eq("id", outreachId).eq("user_id", userId).maybeSingle();
  const row = data as { id: string; job_id: string; kind: string; sent_at: string | null; body_enc: string } | null;
  if (!row || (row.kind !== "cold_email" && row.kind !== "follow_up")) return { ok: false, error: "not_found", status: 404 };
  if (row.sent_at) return { ok: false, error: "already_sent", status: 409 };
  // A follow-up only makes sense a few days after the first email actually went out.
  const thread = row.kind === "follow_up" ? await firstEmailThread(userId, row.job_id) : null;
  if (row.kind === "follow_up") {
    const sentAt = thread?.sentAt;
    if (!sentAt || Date.now() - Date.parse(sentAt) < FOLLOW_UP_AFTER_DAYS * 86_400_000) {
      return { ok: false, error: "too_soon", status: 409, after: sentAt ? new Date(Date.parse(sentAt) + FOLLOW_UP_AFTER_DAYS * 86_400_000).toISOString() : null };
    }
  }

  // Claim the draft first, so a double click (or tap) can't send twice.
  const now = new Date().toISOString();
  const { data: claimed } = await db.from("outreach").update({ sent_at: now }).eq("id", outreachId).is("sent_at", null).select("id");
  if (!(claimed as unknown[] | null)?.length) return { ok: false, error: "already_sent", status: 409 };

  let name: string | null = userName;
  try { name = decryptJson<{ senderName?: string }>(row.body_enc).senderName ?? userName; } catch { /* fall back to the account name */ }
  let sent: Awaited<ReturnType<typeof sendGmail>>;
  try {
    sent = await sendGmail(userId, {
      to, body, fromName: name || null,
      subject: thread ? threadSubject(thread.subject ?? subject) : subject,
      threadId: thread?.threadId ?? null, inReplyTo: thread?.messageId ?? null,
    });
  } catch (e) {
    // Nothing went out: release the claim so the student can retry.
    await db.from("outreach").update({ sent_at: null }).eq("id", outreachId);
    const notConnected = (e as Error).message === "not_connected";
    return { ok: false, error: notConnected ? "not_connected" : "send_failed", status: notConnected ? 412 : 502 };
  }

  let autoFollowUpAt: string | null = null;
  // The email is out. From here the claim must never be released, or a retry would send it twice;
  // a failed bookkeeping write only loses the ids and the status change.
  try {
    await db.from("outreach").update({ gmail_message_id: sent.id, gmail_thread_id: sent.threadId, rfc_message_id: sent.messageId, sent_meta_enc: encryptJson({ to, subject }) }).eq("id", outreachId);
    // The follow-up was approved with the first email: schedule it, only if it hasn't gone out already.
    if (row.kind === "cold_email" && autoFollowUp) {
      const at = new Date(Date.parse(now) + FOLLOW_UP_AFTER_DAYS * 86_400_000).toISOString();
      const { data: scheduled } = await db.from("outreach").update({ auto_send_at: at, auto_body_enc: encrypt(autoFollowUp.body), auto_attempts: 0 })
        .eq("user_id", userId).eq("job_id", row.job_id).eq("kind", "follow_up").is("sent_at", null).select("id");
      if ((scheduled as unknown[] | null)?.length) autoFollowUpAt = at;
    }
    await db.from("matches").update({ status: "emailed", status_at: now }).eq("user_id", userId).eq("job_id", row.job_id).in("status", ["shown", "saved", "applied"]);
  } catch (e) {
    console.error(`[outreach] sent ${outreachId} but could not record it: ${(e as Error).message}`);
  }
  return { ok: true, from: sent.from, autoFollowUpAt };
}
