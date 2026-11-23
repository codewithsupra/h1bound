import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/server";
import { adminDb } from "@/lib/supabase/admin";
import { decryptJson, encrypt, encryptJson } from "@/lib/crypto";
import { isEmail } from "@/lib/email-draft";
import { sendGmail } from "@/lib/server/gmail";

import { FOLLOW_UP_AFTER_DAYS, firstEmailThread, threadSubject } from "@/lib/server/followups";

const Body = z.object({
  outreachId: z.string().uuid(),
  to: z.string().max(254).refine(isEmail, "invalid address"),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  /** First email only: the follow-up text the student approved, to send on its own if nobody replies. */
  autoFollowUp: z.object({ body: z.string().min(1).max(5000) }).optional(),
});

/**
 * Sends one drafted email the user reviewed and approved, from their own Gmail. Only their own
 * draft, only once: a sent draft can't be resent (follow-ups are separate drafts).
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { outreachId, to, subject, body, autoFollowUp } = parsed.data;

  const db = adminDb();
  const { data } = await db.from("outreach").select("id,job_id,kind,sent_at,body_enc").eq("id", outreachId).eq("user_id", user.id).maybeSingle();
  const row = data as { id: string; job_id: string; kind: string; sent_at: string | null; body_enc: string } | null;
  if (!row || (row.kind !== "cold_email" && row.kind !== "follow_up")) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (row.sent_at) return NextResponse.json({ error: "already_sent" }, { status: 409 });
  // A follow-up only makes sense a few days after the first email actually went out.
  if (row.kind === "follow_up") {
    const { data: first } = await db.from("outreach").select("sent_at").eq("user_id", user.id).eq("job_id", row.job_id).eq("kind", "cold_email").not("sent_at", "is", null).order("sent_at").limit(1).maybeSingle();
    const sentAt = (first as { sent_at: string } | null)?.sent_at;
    if (!sentAt || Date.now() - Date.parse(sentAt) < FOLLOW_UP_AFTER_DAYS * 86_400_000) return NextResponse.json({ error: "too_soon", after: sentAt ? new Date(Date.parse(sentAt) + FOLLOW_UP_AFTER_DAYS * 86_400_000).toISOString() : null }, { status: 409 });
  }

  // A follow-up goes into the first email's Gmail thread, as a reply to it.
  const thread = row.kind === "follow_up" ? await firstEmailThread(user.id, row.job_id) : null;

  // Claim the draft first, so a double click can't send twice.
  const now = new Date().toISOString();
  const { data: claimed } = await db.from("outreach").update({ sent_at: now }).eq("id", outreachId).is("sent_at", null).select("id");
  if (!(claimed as unknown[] | null)?.length) return NextResponse.json({ error: "already_sent" }, { status: 409 });

  const name = (decryptJson<{ senderName?: string }>(row.body_enc).senderName ?? user.name ?? null) || null;
  let sent: Awaited<ReturnType<typeof sendGmail>>;
  try {
    sent = await sendGmail(user.id, {
      to, body, fromName: name,
      subject: thread ? threadSubject(thread.subject ?? subject) : subject,
      threadId: thread?.threadId ?? null, inReplyTo: thread?.messageId ?? null,
    });
  } catch (e) {
    // Nothing went out: release the claim so the user can retry.
    await db.from("outreach").update({ sent_at: null }).eq("id", outreachId);
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg === "not_connected" ? "not_connected" : "send_failed" }, { status: msg === "not_connected" ? 412 : 502 });
  }
  let autoFollowUpAt: string | null = null;
  // The email is out. From here the claim must never be released, or a retry would send it twice;
  // a failed bookkeeping write only loses the message id and the status change.
  try {
    await db.from("outreach").update({ gmail_message_id: sent.id, gmail_thread_id: sent.threadId, rfc_message_id: sent.messageId, sent_meta_enc: encryptJson({ to, subject }) }).eq("id", outreachId);
    // The follow-up was approved with the first email: schedule it, only if it hasn't gone out already.
    if (row.kind === "cold_email" && autoFollowUp) {
      const at = new Date(Date.parse(now) + FOLLOW_UP_AFTER_DAYS * 86_400_000).toISOString();
      const { data: scheduled } = await db.from("outreach").update({ auto_send_at: at, auto_body_enc: encrypt(autoFollowUp.body), auto_attempts: 0 })
        .eq("user_id", user.id).eq("job_id", row.job_id).eq("kind", "follow_up").is("sent_at", null).select("id");
      if ((scheduled as unknown[] | null)?.length) autoFollowUpAt = at;
    }
    await db.from("matches").update({ status: "emailed", status_at: now }).eq("user_id", user.id).eq("job_id", row.job_id).in("status", ["shown", "saved", "applied"]);
  } catch (e) {
    console.error(`[outreach] sent ${outreachId} but could not record it: ${(e as Error).message}`);
  }
  return NextResponse.json({ ok: true, from: sent.from, autoFollowUpAt });
}
