/**
 * Telegram bot helpers: parsing webhook updates and formatting daily picks. Pure and testable;
 * API calls live in lib/server/telegram.ts.
 */

export type TgUpdate = {
  update_id: number;
  message?: { chat: { id: number; type: string }; text?: string; from?: { first_name?: string } };
  callback_query?: { id: string; data?: string; message?: { message_id?: number; chat: { id: number } } };
};

export type TgEvent =
  | { kind: "start"; chatId: number; token: string | null }
  | { kind: "stop"; chatId: number }
  | { kind: "text"; chatId: number; text: string }
  | { kind: "action"; chatId: number; callbackId: string; messageId: number | null; action: "insight" | "skip" | "draft" | "replied" | "cancel_follow_up"; jobId: string }
  | { kind: "send"; chatId: number; callbackId: string; messageId: number | null; outreachId: string; autoFollowUp: boolean }
  | { kind: "ignore" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parseUpdate(u: TgUpdate): TgEvent {
  if (u.callback_query) {
    const chatId = u.callback_query.message?.chat.id;
    const parts = (u.callback_query.data ?? "").split(":");
    const [a, id] = parts;
    const messageId = u.callback_query.message?.message_id ?? null;
    if (!chatId || parts.length !== 2 || !UUID.test(id ?? "")) return { kind: "ignore" };
    // x: send with the follow-up scheduled, y: send only. The id is the draft (outreach) id.
    if (a === "x" || a === "y") return { kind: "send", chatId, callbackId: u.callback_query.id, messageId, outreachId: id, autoFollowUp: a === "x" };
    const action = ({ i: "insight", s: "skip", d: "draft", r: "replied", c: "cancel_follow_up" } as const)[a as "i" | "s" | "d" | "r" | "c"];
    if (!action) return { kind: "ignore" };
    return { kind: "action", chatId, callbackId: u.callback_query.id, messageId, action, jobId: id };
  }
  const m = u.message;
  // Private chats only: picks contain personal matches and must never land in a group.
  if (!m || m.chat.type !== "private" || !m.text) return { kind: "ignore" };
  const text = m.text.trim();
  const start = text.match(/^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{24,64}))?$/);
  if (start) return { kind: "start", chatId: m.chat.id, token: start[1] ?? null };
  if (/^\/stop(@\w+)?$/.test(text)) return { kind: "stop", chatId: m.chat.id };
  return { kind: "text", chatId: m.chat.id, text: text.slice(0, 500) };
}

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type Pick = {
  id: string; title: string; company: string; location: string; remote: boolean; url: string;
  badge: { label: string; detail: string }; why?: string | null;
  salary?: { text: string } | null;
};

/** One pick as a Telegram HTML message with its buttons. Callback data stays under Telegram's 64-byte limit. */
export function pickMessage(p: Pick, appUrl: string) {
  const lines = [
    `<b>${escapeHtml(p.title)}</b>`,
    `${escapeHtml(p.company)} · ${escapeHtml(p.remote ? "Remote" : p.location)}`,
    `${escapeHtml(p.badge.label)}: ${escapeHtml(p.badge.detail)}`,
    ...(p.salary ? [`Pay check: ${escapeHtml(p.salary.text)}`] : []),
    ...(p.why ? [`Why it fits: ${escapeHtml(p.why)}`] : []),
  ];
  const ask = (q: string) => `${appUrl}/chat?ask=${encodeURIComponent(q)}`;
  return {
    text: lines.join("\n"),
    reply_markup: {
      inline_keyboard: [
        [{ text: "Open posting", url: p.url }, { text: `About ${p.company}`.slice(0, 40), callback_data: `i:${p.id}` }],
        [{ text: "Draft my email here", callback_data: `d:${p.id}` }, { text: "Skip", callback_data: `s:${p.id}` }],
        [{ text: "Open in chat instead", url: ask(`Draft a cold email for the ${p.title} role at ${p.company} (job ${p.id})`) }],
      ],
    },
  };
}

export type DraftCard = {
  jobId: string; job: { title: string; company: string };
  to: string | null; contactName: string | null; subject: string; body: string; followUp: string | null;
  outreachId: string; followUpId: string | null;
  gmail: "connected" | "not_connected" | "unavailable";
  findContactYourself: string | null;
};

/**
 * A drafted email as a Telegram message: who it goes to, the email, and the follow-up it would
 * schedule. Send buttons appear only when there's an address and Gmail is connected; nothing goes
 * out until a button is tapped.
 */
export function draftMessage(d: DraftCard, appUrl: string) {
  const lines = [
    `<b>Email for ${escapeHtml(d.job.title)} at ${escapeHtml(d.job.company)}</b>`,
    d.to ? `To: ${escapeHtml(d.contactName ? `${d.contactName} <${d.to}>` : d.to)}` : "To: no address found yet",
    `Subject: ${escapeHtml(d.subject)}`,
    "",
    escapeHtml(d.body),
    ...(d.followUp && d.followUpId ? ["", `<i>Follow-up, 4 days later if they haven't replied:</i>`, escapeHtml(d.followUp)] : []),
  ];
  const edit = { text: "Edit in the app", url: `${appUrl}/pipeline` };
  const rows: { text: string; callback_data?: string; url?: string }[][] = [];
  if (d.to && d.gmail === "connected") {
    rows.push(d.followUpId && d.followUp
      ? [{ text: "Send + follow up in 4 days", callback_data: `x:${d.outreachId}` }, { text: "Send only", callback_data: `y:${d.outreachId}` }]
      : [{ text: "Send from my Gmail", callback_data: `y:${d.outreachId}` }]);
    rows.push([edit]);
  } else if (d.to && d.gmail === "not_connected") {
    rows.push([{ text: "Connect Gmail to send", url: `${appUrl}/settings` }, edit]);
  } else {
    rows.push([edit, ...(d.findContactYourself ? [{ text: "Find them on LinkedIn", url: d.findContactYourself }] : [])]);
  }
  return { text: lines.join("\n").slice(0, 4000), reply_markup: { inline_keyboard: rows } };
}

/** After a send: what happened, and the buttons that still make sense. */
export function sentMessage(r: { company: string; from: string; autoFollowUpAt: string | null; jobId: string }) {
  const when = r.autoFollowUpAt ? new Date(r.autoFollowUpAt).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }) : null;
  const text = `Sent to ${escapeHtml(r.company)} from ${escapeHtml(r.from)}.${when ? ` The follow-up goes out ${when} in the same thread, unless they reply first: tap below when they do.` : " Tap below when they reply."}`;
  const buttons = [{ text: "They replied", callback_data: `r:${r.jobId}` }, ...(when ? [{ text: "Cancel follow-up", callback_data: `c:${r.jobId}` }] : [])];
  return { text, reply_markup: { inline_keyboard: [buttons] } };
}
