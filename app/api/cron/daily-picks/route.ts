import { NextResponse, type NextRequest } from "next/server";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { storeForUser } from "@/lib/server/store";
import { findJobs } from "@/lib/server/jobs";
import { picksEmail, picksToday } from "@/lib/picks";
import { pickMessage } from "@/lib/telegram";
import { chatIdOf, sendText, telegramConfigured } from "@/lib/server/telegram";
import { sendEmail } from "@/lib/server/email";
import { SITE_NAME } from "@/lib/site";

export const maxDuration = 300;

type Candidate = { user_id: string; email: string; name: string | null; unsubscribe_token: string; email_updates: boolean; telegram_updates: boolean; telegram_chat_enc: string | null; last_pick: string | null };

/**
 * Morning picks (InsForge schedule, Bearer CRON_SECRET): the best new matches for each opted-in
 * user, sent by Telegram and/or email. Each pick is recorded as shown, so it counts like any match.
 */
export async function POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createAdminInsForge().database;
  const app = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  const { data, error } = await db.rpc("daily_pick_candidates");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const candidates = (data ?? []) as Candidate[];
  const started = Date.now();
  let users = 0, picks = 0, failed = 0;

  for (const c of candidates) {
    if (Date.now() - started > 250_000) break; // leave headroom; the rest get picks tomorrow
    try {
      // Only pick jobs we can actually deliver: picks count as shown the moment they're chosen.
      const chatId = telegramConfigured() && c.telegram_updates ? chatIdOf(c.telegram_chat_enc) : null;
      const canEmail = c.email_updates && Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
      if (!chatId && !canEmail) continue;
      const store = await storeForUser(c.user_id, c.name);
      const [profile, pro, usage] = await Promise.all([store.loadProfile(), store.isPro(), store.usage()]);
      if (!profile?.details?.resumeText) continue;
      const count = picksToday({ pro, jobsShown: usage.jobsShown, jobLimit: store.jobLimit, lastPickAt: c.last_pick ? Date.parse(c.last_pick) : null, now: Date.now() });
      if (!count) continue;
      const { cards } = await findJobs(store, profile.row, pro, usage, { count, resume: profile.details.resumeText });
      if (!cards.length) continue;

      let delivered = false;
      if (chatId) {
        await sendText(chatId, `Morning${store.firstName ? ` ${store.firstName}` : ""}! ${cards.length === 1 ? "Today's pick" : `Your ${cards.length} picks`}:`);
        for (const card of cards) {
          const m = pickMessage(card, app);
          delivered = (await sendText(chatId, m.text, { reply_markup: m.reply_markup })) || delivered;
        }
        if (delivered) await db.from("nudge_log").insert({ user_id: c.user_id, kind: "daily_picks", channel: "telegram" });
      }
      if (canEmail && !delivered) {
        const unsub = `${app}/u/${c.unsubscribe_token}`;
        const mail = picksEmail(store.firstName, cards, app, SITE_NAME, unsub);
        if (await sendEmail(c.email, mail.subject, mail.text, unsub, `${app}/api/unsubscribe/${c.unsubscribe_token}`)) {
          delivered = true;
          await db.from("nudge_log").insert({ user_id: c.user_id, kind: "daily_picks", channel: "email" });
        }
      }
      if (delivered) { users++; picks += cards.length; }
    } catch {
      failed++;
    }
  }
  return NextResponse.json({ candidates: candidates.length, users, picks, failed });
}
