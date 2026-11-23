import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/server";
import { isEmail } from "@/lib/email-draft";
import { sendApprovedEmail } from "@/lib/server/outreach-send";

const Body = z.object({
  outreachId: z.string().uuid(),
  to: z.string().max(254).refine(isEmail, "invalid address"),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  /** First email only: the follow-up text the student approved, to send on its own if nobody replies. */
  autoFollowUp: z.object({ body: z.string().min(1).max(5000) }).optional(),
});

/** Sends one drafted email the user reviewed and approved, from their own Gmail (lib/server/outreach-send.ts). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = await sendApprovedEmail(user.id, user.name ?? null, parsed.data);
  if (!r.ok) return NextResponse.json({ error: r.error, ...(r.error === "too_soon" ? { after: r.after ?? null } : {}) }, { status: r.status });
  return NextResponse.json({ ok: true, from: r.from, autoFollowUpAt: r.autoFollowUpAt });
}
