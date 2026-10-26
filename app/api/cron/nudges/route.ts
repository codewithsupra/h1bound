import { NextResponse, type NextRequest } from "next/server";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { chooseNudge, nudgeCopy, type NudgeKind } from "@/lib/nudge";
import { FREE_LIMITS } from "@/lib/quota";
import { sendEmail } from "@/lib/server/email";

export const maxDuration = 300;

type Candidate = { user_id: string; email: string; first_name: string | null; unsubscribe_token: string; families: string[]; sent_at: string[]; sent_kinds: NudgeKind[]; stale_applications: number; jobs_shown: number; last_nudge: string | null };

/** Daily, via InsForge schedule with `Authorization: Bearer ${CRON_SECRET}`. Opted-in users only. */
export async function POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createAdminInsForge().database;
  const app = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  const { data, error } = await db.rpc("nudge_candidates");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  for (const c of (data ?? []) as Candidate[]) {
    const since = c.last_nudge ?? new Date(Date.now() - 7 * 86_400_000).toISOString();
    let q = db.from("jobs").select("id", { count: "exact", head: true }).eq("active", true).eq("is_us", true).gt("first_seen", since).or("jd_sponsorship.is.null,jd_sponsorship.eq.yes");
    if (c.families.length) q = q.in("family", c.families);
    const [{ count: newJobs }, { data: pro }] = await Promise.all([q, db.rpc("is_pro", { p_user: c.user_id })]);

    const kind = chooseNudge({
      consented: true, pro: pro === true, now: Date.now(), sentAt: c.sent_at.map((t) => Date.parse(t)), sentKinds: c.sent_kinds,
      staleApplications: c.stale_applications, newMatchingJobs: newJobs ?? 0, freeLimitHit: c.jobs_shown >= FREE_LIMITS.jobs,
    });
    if (!kind) continue;
    const unsub = `${app}/u/${c.unsubscribe_token}`;
    const copy = nudgeCopy(kind, c.first_name, { stale: c.stale_applications, jobs: newJobs ?? 0 }, app, unsub);
    if (await sendEmail(c.email, copy.subject, copy.text, unsub, `${app}/api/unsubscribe/${c.unsubscribe_token}`)) {
      await db.from("nudge_log").insert({ user_id: c.user_id, kind, channel: "email" });
      sent++;
    }
  }
  return NextResponse.json({ candidates: (data ?? []).length, sent });
}
