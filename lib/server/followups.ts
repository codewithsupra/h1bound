import "server-only";
import { adminDb } from "@/lib/supabase/admin";
import { decrypt, decryptJson } from "@/lib/crypto";
import { sendGmail } from "@/lib/server/gmail";

/**
 * Follow-ups that send themselves. When a student approves the first email they can approve its
 * follow-up too; it then goes out FOLLOW_UP_AFTER_DAYS later as a reply in the same Gmail thread,
 * unless the student has marked a reply, moved the job on, or cancelled it.
 *
 * We can't see replies (the Gmail permission is send-only), so the student's own "they replied" is
 * what stops it. Every send is claimed first, so a retry or an overlapping run can't send twice.
 */

export const FOLLOW_UP_AFTER_DAYS = 4;
/** Transient failures are retried hourly this many times, then the follow-up is handed back to the student. */
export const MAX_ATTEMPTS = 3;
/** Once the job is at one of these, a follow-up would be wrong. */
const STOP_STATUSES = new Set(["replied", "interview", "offer", "rejected", "dismissed"]);

const db = () => adminDb();

export const threadSubject = (subject: string) => (/^re:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim()}`);

export type FirstEmail = { threadId: string | null; messageId: string | null; to: string | null; subject: string | null; sentAt: string };

/** The sent first email for a job, with what a reply in its thread needs. Null if it wasn't sent. */
export async function firstEmailThread(userId: string, jobId: string): Promise<FirstEmail | null> {
  const { data } = await db().from("outreach").select("sent_at,gmail_thread_id,rfc_message_id,sent_meta_enc")
    .eq("user_id", userId).eq("job_id", jobId).eq("kind", "cold_email").not("sent_at", "is", null).order("sent_at").limit(1).maybeSingle();
  const r = data as { sent_at: string; gmail_thread_id: string | null; rfc_message_id: string | null; sent_meta_enc: string | null } | null;
  if (!r) return null;
  let meta: { to?: string; subject?: string } = {};
  try { meta = r.sent_meta_enc ? decryptJson(r.sent_meta_enc) : {}; } catch { /* unreadable: fall back to what the caller has */ }
  return { threadId: r.gmail_thread_id, messageId: r.rfc_message_id, to: meta.to ?? null, subject: meta.subject ?? null, sentAt: r.sent_at };
}

/** The student cancels a scheduled follow-up (or marks a reply). Only their own, only if unsent. */
export async function cancelAutoFollowUp(userId: string, jobId: string): Promise<void> {
  await db().from("outreach").update({ auto_send_at: null, auto_body_enc: null })
    .eq("user_id", userId).eq("job_id", jobId).eq("kind", "follow_up").is("sent_at", null);
}

type Due = { id: string; user_id: string; job_id: string; auto_body_enc: string; auto_attempts: number; body_enc: string };
export type FollowUpRun = { due: number; sent: number; stopped: number; retried: number; gaveUp: number };

/** Sends every follow-up that's due. Called hourly by app/api/cron/follow-ups. */
export async function runDueFollowUps(now = Date.now(), limit = 50): Promise<FollowUpRun> {
  const { data, error } = await db().from("outreach").select("id,user_id,job_id,auto_body_enc,auto_attempts,body_enc")
    .eq("kind", "follow_up").is("sent_at", null).not("auto_send_at", "is", null).lte("auto_send_at", new Date(now).toISOString())
    .order("auto_send_at").limit(limit);
  if (error) throw new Error(error.message);
  const out: FollowUpRun = { due: (data ?? []).length, sent: 0, stopped: 0, retried: 0, gaveUp: 0 };

  for (const f of (data ?? []) as Due[]) {
    const stop = () => db().from("outreach").update({ auto_send_at: null }).eq("id", f.id).is("sent_at", null);
    const { data: m } = await db().from("matches").select("status").eq("user_id", f.user_id).eq("job_id", f.job_id).maybeSingle();
    const status = (m as { status: string } | null)?.status;
    const first = await firstEmailThread(f.user_id, f.job_id);
    // Replied, moved on, removed, or the first email has no recipient to reply to: don't send.
    if (!status || STOP_STATUSES.has(status) || !first?.to) { await stop(); out.stopped++; continue; }

    // Claim, then send. A claim that matches nothing means another run already took it.
    const sentAt = new Date(now).toISOString();
    const { data: claimed } = await db().from("outreach").update({ sent_at: sentAt }).eq("id", f.id).is("sent_at", null).select("id");
    if (!(claimed as unknown[] | null)?.length) continue;

    let senderName: string | null = null;
    try { senderName = decryptJson<{ senderName?: string }>(f.body_enc).senderName ?? null; } catch { /* name is optional */ }
    try {
      const sent = await sendGmail(f.user_id, {
        to: first.to, subject: threadSubject(first.subject ?? "Following up"), body: decrypt(f.auto_body_enc),
        fromName: senderName, threadId: first.threadId, inReplyTo: first.messageId,
      });
      out.sent++;
      // Out: never release the claim from here on. Losing the ids only costs threading of nothing.
      await db().from("outreach").update({ auto_send_at: null, gmail_message_id: sent.id, gmail_thread_id: sent.threadId, rfc_message_id: sent.messageId }).eq("id", f.id)
        .then(() => undefined, (e: Error) => console.error(`[followups] sent ${f.id} but could not record it: ${e.message}`));
    } catch (e) {
      const notConnected = (e as Error).message === "not_connected";
      const attempts = f.auto_attempts + 1;
      if (notConnected || attempts >= MAX_ATTEMPTS) {
        // Hand it back: unsent and unscheduled, so the student can send it themselves.
        await db().from("outreach").update({ sent_at: null, auto_send_at: null, auto_attempts: attempts }).eq("id", f.id);
        out.gaveUp++;
      } else {
        await db().from("outreach").update({ sent_at: null, auto_send_at: new Date(now + 3_600_000).toISOString(), auto_attempts: attempts }).eq("id", f.id);
        out.retried++;
      }
    }
  }
  return out;
}
