import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import { storeForUser } from "@/lib/server/store";
import { findJobs, type JobCard } from "@/lib/server/jobs";
import { inDeliveryWindow, picksToday } from "@/lib/picks";
import { digestDue, digestEmail, visaCountdown, FREE_DIGEST_JOBS } from "@/lib/digest";
import { newSponsorsFor } from "@/lib/server/new-sponsors";
import { newSponsorLine } from "@/lib/new-sponsors";
import { hasPaidPlan } from "@/lib/server/growth";
import { pickMessage } from "@/lib/telegram";
import { chatIdOf, sendText, telegramConfigured } from "@/lib/server/telegram";
import { sendEmail } from "@/lib/server/email";
import { SITE_NAME } from "@/lib/site";
import { trackRun } from "@/lib/server/ops";

export const maxDuration = 300;

type Candidate = {
  user_id: string; email: string; name: string | null; unsubscribe_token: string; email_updates: boolean; telegram_updates: boolean; telegram_chat_enc: string | null; last_pick: string | null;
  picks_per_day?: number; picks_hour?: number; timezone?: string;
};

/**
 * The visa-clock digest (scheduled workflow, hourly, Bearer CRON_SECRET), at each opted-in user's
 * chosen hour in their timezone, by Telegram and/or email:
 * - Pro and trial: daily, the number of picks they chose, each with a check of its posted pay
 *   against the visa salary floor (jobs known to pay under it are left out).
 * - Free: weekly, up to 3 picks while the free allowance lasts; after that the digest still comes,
 *   with the countdown and how many sponsor jobs matched, so the deadline stays in view.
 * Only jobs first seen since the last digest, and for anyone who needs sponsoring, only employers
 * with a confirmed register link. Picks are recorded as shown, so they count like any match.
 * `?all=1` ignores the hour (manual runs).
 */
export async function POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    // Recorded like the other jobs, so the ops report can tell "ran with nobody to send to" from "never ran".
    const out = await trackRun("daily-picks", {}, () => run(req), (r) => ({ jobs: r.picks, failed: r.failed, boards: r.candidates, stats: r }));
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

const WEEK = 7 * 86_400_000;

async function run(req: NextRequest) {
  const db = adminDb();
  const app = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  const { data, error } = await db.rpc("daily_pick_candidates");
  if (error) throw new Error(error.message);
  const now = Date.now();
  const ignoreHour = req.nextUrl.searchParams.get("all") === "1";
  // How often the scheduled workflow calls this (every 3 hours while there are few users, to keep the
  // free host asleep most of the time); each user is caught in the run that falls in their window.
  const every = Number(process.env.DIGEST_EVERY_HOURS ?? 1) || 1;
  const candidates = ((data ?? []) as Candidate[]).filter((c) => ignoreHour || c.picks_hour === undefined || inDeliveryWindow(now, c.timezone ?? "Europe/London", c.picks_hour, every));
  const started = Date.now();
  let users = 0, picks = 0, countOnly = 0, sponsorsShown = 0, failed = 0;

  for (const c of candidates) {
    if (Date.now() - started > 250_000) break; // leave headroom; the rest get theirs next time
    try {
      // Only pick jobs we can actually deliver: picks count as shown the moment they're chosen.
      const chatId = telegramConfigured() && c.telegram_updates ? chatIdOf(c.telegram_chat_enc) : null;
      const canEmail = c.email_updates && Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
      if (!chatId && !canEmail) continue;
      const store = await storeForUser(c.user_id, c.name);
      const [profile, pro, usage, paid] = await Promise.all([store.loadProfile(), store.isPro(), store.usage(), hasPaidPlan(c.user_id)]);
      if (!profile?.details?.resumeText) continue;
      const lastAt = c.last_pick ? Date.parse(c.last_pick) : null;
      if (!digestDue({ paidOrTrial: pro, lastAt, now })) continue;

      const base = { resume: profile.details.resumeText, since: new Date(lastAt ?? now - WEEK).toISOString(), sponsorOnly: true };
      let cards: JobCard[] = [];
      let hiddenCount = 0;
      if (pro) {
        const count = picksToday({ pro: true, trial: !paid, perDay: c.picks_per_day, jobsShown: usage.jobsShown, jobLimit: store.jobLimit, lastPickAt: null, now });
        ({ cards } = await findJobs(store, profile.row, true, usage, { ...base, count, salary: true }));
      } else {
        const left = Math.max(0, store.jobLimit - usage.jobsShown);
        if (left) ({ cards } = await findJobs(store, profile.row, false, usage, { ...base, count: Math.min(FREE_DIGEST_JOBS, left) }));
        else hiddenCount = (await findJobs(store, profile.row, false, usage, { ...base, count: 0, peek: true })).poolSize;
      }
      // Employers new on the register since the last digest (the registers update weekly, so mostly Mondays).
      const r = profile.row;
      const newSponsors = await newSponsorsFor({
        work: { citizenship: r.citizenship ?? null, visaCountry: r.visa_country ?? null, visaSituation: r.visa_situation ?? null },
        targetCountries: r.target_countries ?? [], families: r.target_families ?? [], cities: r.locations ?? [],
      }, base.since, pro ? 5 : 3).catch(() => []);
      const countdown = visaCountdown(profile.row, now);
      // As the visa runs out, employers that can sponsor go first: only they can keep the student in the country.
      if (countdown?.level === "urgent") cards = [...cards].sort((a, b) => Number(b.sponsored ?? false) - Number(a.sponsored ?? false));

      const unsub = `${app}/u/${c.unsubscribe_token}`;
      const mail = digestEmail({ firstName: store.firstName, paid: pro, countdown, jobs: cards, hiddenCount, newSponsors, appUrl: app, siteName: SITE_NAME, unsubscribeUrl: unsub });
      if (!mail) continue;

      let delivered = false;
      if (chatId) {
        const hello = `${store.firstName ? `Hi ${store.firstName}! ` : ""}${countdown?.line ?? ""}`.trim();
        if (hello) await sendText(chatId, hello);
        for (const card of cards) {
          const m = pickMessage(card, app);
          delivered = (await sendText(chatId, m.text, { reply_markup: m.reply_markup })) || delivered;
        }
        if (newSponsors.length) delivered = (await sendText(chatId, `New on the sponsor register:\n${newSponsors.map(newSponsorLine).join("\n")}`)) || delivered;
        if (hiddenCount) delivered = (await sendText(chatId, `${hiddenCount} new job${hiddenCount === 1 ? "" : "s"} at licensed sponsors matched you this week. Pro shows them all: ${app}/upgrade`)) || delivered;
        if (delivered) await db.from("nudge_log").insert({ user_id: c.user_id, kind: "daily_picks", channel: "telegram" });
      }
      if (canEmail && !delivered) {
        if (await sendEmail(c.email, mail.subject, mail.text, unsub, `${app}/api/unsubscribe/${c.unsubscribe_token}`)) {
          delivered = true;
          await db.from("nudge_log").insert({ user_id: c.user_id, kind: "daily_picks", channel: "email" });
        }
      }
      if (delivered) { users++; picks += cards.length; sponsorsShown += newSponsors.length; if (!cards.length) countOnly++; }
    } catch {
      failed++;
    }
  }
  return { candidates: candidates.length, users, picks, countOnly, sponsorsShown, failed };
}
