import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { adminDb } from "@/lib/supabase/admin";
import { draftMessage, escapeHtml, parseUpdate, sentMessage, type TgUpdate } from "@/lib/telegram";
import { decryptJson } from "@/lib/crypto";
import { parseDraft } from "@/lib/email-draft";
import { storeForUser } from "@/lib/server/store";
import { draftEmailForJob } from "@/lib/server/draft-email";
import { sendApprovedEmail } from "@/lib/server/outreach-send";
import { cancelAutoFollowUp } from "@/lib/server/followups";
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
        ? `You're connected. I'll send your best new matches here each morning, with the sponsor proof. Tap a button to learn about a company, or have me draft the email and send it from your Gmail once you approve it. Send /stop any time.`
        : `Hi! I'm Maya, ${escapeHtml(SITE_NAME)}'s AI job buddy. To get daily picks here, open ${SITE_URL}/settings and tap "Connect Telegram".`);
    } else if (ev.kind === "stop") {
      await stopChat(ev.chatId);
      await sendText(ev.chatId, "Done, no more daily picks. Send /start from your account page to turn them back on.");
    } else if (ev.kind === "text") {
      await sendText(ev.chatId, `I send picks here; the full chat with me lives at ${SITE_URL}/chat`);
    } else if (ev.kind === "action") {
      const userId = await userForChat(ev.chatId);
      const db = adminDb();
      // Only act on jobs that were actually shown to this account.
      const { data } = userId ? await db.from("matches").select("job_id,jobs(company,country)").eq("user_id", userId).eq("job_id", ev.jobId).maybeSingle() : { data: null };
      const job = (data as { jobs: { company: string; country: string | null } | null } | null)?.jobs;
      if (!userId || !job) {
        await tg("answerCallbackQuery", { callback_query_id: ev.callbackId, text: "That pick isn't linked to your account." });
      } else if (ev.action === "draft") {
        await tg("answerCallbackQuery", { callback_query_id: ev.callbackId, text: `Finding who to write to at ${job.company}…` });
        const r = await draftEmailForJob(await storeForUser(userId, null), userId, ev.jobId);
        if ("proOnly" in r) await sendText(ev.chatId, `Drafting emails to hiring managers is part of Pro (and the 7-day free trial): ${SITE_URL}/upgrade`);
        else if ("error" in r) await sendText(ev.chatId, r.error === "no_resume" ? `Upload your CV first, so the email can be about you: ${SITE_URL}/chat` : "I couldn't find that job any more.");
        else if (r.outreachId) {
          const m = draftMessage({
            jobId: ev.jobId, job: r.job, to: r.contact?.email ?? null, contactName: r.contact?.name ?? null,
            subject: r.draft.subject, body: r.draft.body, followUp: r.draft.followUp ?? null,
            outreachId: r.outreachId, followUpId: r.followUpId, gmail: r.gmail, findContactYourself: r.findContactYourself,
          }, SITE_URL);
          await sendText(ev.chatId, m.text, { reply_markup: m.reply_markup });
        }
      } else if (ev.action === "replied") {
        const now = new Date().toISOString();
        await db.from("matches").update({ status: "replied", status_at: now, asked_reply_at: now }).eq("user_id", userId).eq("job_id", ev.jobId).in("status", ["shown", "saved", "applied", "emailed"]);
        await cancelAutoFollowUp(userId, ev.jobId);
        await tg("answerCallbackQuery", { callback_query_id: ev.callbackId, text: "Brilliant! Marked as replied, and no follow-up will go out." });
        await sendText(ev.chatId, `Nice work. Want help with the reply or interview prep for ${escapeHtml(job.company)}? ${SITE_URL}/pipeline`);
      } else if (ev.action === "cancel_follow_up") {
        await cancelAutoFollowUp(userId, ev.jobId);
        await tg("answerCallbackQuery", { callback_query_id: ev.callbackId, text: "Follow-up cancelled." });
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
    } else if (ev.kind === "send") {
      await handleSend(ev);
    }
  } catch {
    // Swallow: a failed reply must not make Telegram resend the update forever.
  }
  return NextResponse.json({ ok: true });
}

const SEND_ERRORS: Record<string, string> = {
  already_sent: "This one has already been sent.",
  not_connected: "Connect Gmail in Settings first.",
  send_failed: "Gmail didn't accept it. Try again, or send it from the app.",
  not_found: "That draft isn't linked to your account.",
  too_soon: "Give them a few days first.",
};

/** A Send button: the draft as saved, to the address on it, through the same path as the web app. */
async function handleSend(ev: Extract<ReturnType<typeof parseUpdate>, { kind: "send" }>) {
  const answer = (text: string, alert = false) => tg("answerCallbackQuery", { callback_query_id: ev.callbackId, text, show_alert: alert });
  const userId = await userForChat(ev.chatId);
  if (!userId) return answer("This chat isn't linked to an account.", true);
  const db = adminDb();
  const { data } = await db.from("outreach").select("job_id,kind,body_enc,jobs(company)").eq("id", ev.outreachId).eq("user_id", userId).eq("kind", "cold_email").maybeSingle();
  const row = data as { job_id: string; body_enc: string; jobs: { company: string } | null } | null;
  if (!row) return answer(SEND_ERRORS.not_found, true);
  const saved = decryptJson<{ contact?: { email?: string | null } | null; email: string }>(row.body_enc);
  const to = saved.contact?.email;
  if (!to) return answer("There's no address on this draft yet. Open it in the app to add one.", true);
  const draft = parseDraft(saved.email);
  let autoFollowUp: { body: string } | undefined;
  if (ev.autoFollowUp) {
    const { data: fu } = await db.from("outreach").select("body_enc").eq("user_id", userId).eq("job_id", row.job_id).eq("kind", "follow_up").is("sent_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const text = fu ? decryptJson<{ email?: string }>((fu as { body_enc: string }).body_enc).email : null;
    if (text) autoFollowUp = { body: text };
  }
  const r = await sendApprovedEmail(userId, null, { outreachId: ev.outreachId, to, subject: draft.subject, body: draft.body, autoFollowUp });
  if (!r.ok) return answer(SEND_ERRORS[r.error] ?? "Something went wrong.", true);
  await answer("Sent ✉️");
  // The buttons on the draft would only offer a send that can't happen again.
  if (ev.messageId) await tg("editMessageReplyMarkup", { chat_id: ev.chatId, message_id: ev.messageId, reply_markup: { inline_keyboard: [] } });
  const m = sentMessage({ company: row.jobs?.company ?? "them", from: r.from, autoFollowUpAt: r.autoFollowUpAt, jobId: row.job_id });
  await sendText(ev.chatId, m.text, { reply_markup: m.reply_markup });
}
