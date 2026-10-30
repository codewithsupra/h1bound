import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { escapeHtml, parseUpdate, type TgUpdate } from "@/lib/telegram";
import { claimLink, sendText, stopChat, tg, userForChat } from "@/lib/server/telegram";
import { companyInsight } from "@/lib/server/insight";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const maxDuration = 60;

function authorized(req: Request): boolean {
  const want = Buffer.from(process.env.TELEGRAM_WEBHOOK_SECRET ?? "");
  const got = Buffer.from(req.headers.get("x-telegram-bot-api-secret-token") ?? "");
  return want.length > 0 && want.length === got.length && timingSafeEqual(want, got);
}

/** Telegram webhook (setWebhook with secret_token). Always 200 once authorized, so Telegram doesn't retry. */
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ev = parseUpdate((await req.json().catch(() => ({}))) as TgUpdate);
  try {
    if (ev.kind === "start") {
      const linked = ev.token ? await claimLink(ev.token, ev.chatId) : null;
      await sendText(ev.chatId, linked
        ? `You're connected. I'll send your best new matches here each morning, with the sponsor proof. Tap a button to learn about a company or draft your email. Send /stop any time.`
        : `Hi! I'm Maya, ${escapeHtml(SITE_NAME)}'s AI job buddy. To get daily picks here, open your account at ${SITE_URL}/account and tap "Connect Telegram".`);
    } else if (ev.kind === "stop") {
      await stopChat(ev.chatId);
      await sendText(ev.chatId, "Done, no more daily picks. Send /start from your account page to turn them back on.");
    } else if (ev.kind === "text") {
      await sendText(ev.chatId, `I send picks here; the full chat with me lives at ${SITE_URL}/chat`);
    } else if (ev.kind === "action") {
      const userId = await userForChat(ev.chatId);
      const db = createAdminInsForge().database;
      // Only act on jobs that were actually shown to this account.
      const { data } = userId ? await db.from("matches").select("job_id,jobs(company,country)").eq("user_id", userId).eq("job_id", ev.jobId).maybeSingle() : { data: null };
      const job = (data as { jobs: { company: string; country: string | null } | null } | null)?.jobs;
      if (!userId || !job) {
        await tg("answerCallbackQuery", { callback_query_id: ev.callbackId, text: "That pick isn't linked to your account." });
      } else if (ev.action === "skip") {
        await db.from("matches").update({ status: "dismissed", status_at: new Date().toISOString() }).eq("user_id", userId).eq("job_id", ev.jobId);
        await tg("answerCallbackQuery", { callback_query_id: ev.callbackId, text: "Skipped. I'll learn from that." });
      } else {
        await tg("answerCallbackQuery", { callback_query_id: ev.callbackId, text: `Looking into ${job.company}…` });
        const r = await companyInsight(job.company).catch(() => ({ error: "not_found" as const }));
        if ("error" in r) {
          await sendText(ev.chatId, `I couldn't find enough public information about ${escapeHtml(job.company)}.`);
        } else {
          const i = r.insight;
          const parts = [
            `<b>Working at ${escapeHtml(job.company)}</b>`,
            escapeHtml(i.summary),
            ...(i.pros.length ? [`👍 ${i.pros.map(escapeHtml).join("; ")}`] : []),
            ...(i.cons.length ? [`⚠️ ${i.cons.map(escapeHtml).join("; ")}`] : []),
            ...(i.interviews ? [`Interviews: ${escapeHtml(i.interviews)}`] : []),
            `Sources: ${i.sources.map((s) => `<a href="${escapeHtml(s.url)}">${escapeHtml(s.title)}</a>`).join(", ")}`,
          ];
          await sendText(ev.chatId, parts.join("\n\n"));
        }
      }
    }
  } catch {
    // Swallow: a failed reply must not make Telegram resend the update forever.
  }
  return NextResponse.json({ ok: true });
}
