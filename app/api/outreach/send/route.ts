import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/insforge/server";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { decryptJson } from "@/lib/crypto";
import { isEmail } from "@/lib/email-draft";
import { sendGmail } from "@/lib/server/gmail";

const FOLLOW_UP_AFTER_DAYS = 4;

const Body = z.object({
  outreachId: z.string().uuid(),
  to: z.string().max(254).refine(isEmail, "invalid address"),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
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
  const { outreachId, to, subject, body } = parsed.data;

  const db = createAdminInsForge().database;
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

  // Claim the draft first, so a double click can't send twice.
  const now = new Date().toISOString();
  const { data: claimed } = await db.from("outreach").update({ sent_at: now }).eq("id", outreachId).is("sent_at", null).select("id");
  if (!(claimed as unknown[] | null)?.length) return NextResponse.json({ error: "already_sent" }, { status: 409 });

  const name = (decryptJson<{ senderName?: string }>(row.body_enc).senderName ?? user.name ?? null) || null;
  try {
    const sent = await sendGmail(user.id, { to, subject, body, fromName: name });
    await db.from("outreach").update({ gmail_message_id: sent.id }).eq("id", outreachId);
    await db.from("matches").update({ status: "emailed", status_at: now }).eq("user_id", user.id).eq("job_id", row.job_id).in("status", ["shown", "saved", "applied"]);
    return NextResponse.json({ ok: true, from: sent.from });
  } catch (e) {
    await db.from("outreach").update({ sent_at: null }).eq("id", outreachId);
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg === "not_connected" ? "not_connected" : "send_failed" }, { status: msg === "not_connected" ? 412 : 502 });
  }
}
