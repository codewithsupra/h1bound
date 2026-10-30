/**
 * Telegram bot helpers: parsing webhook updates and formatting daily picks. Pure and testable;
 * API calls live in lib/server/telegram.ts.
 */

export type TgUpdate = {
  update_id: number;
  message?: { chat: { id: number; type: string }; text?: string; from?: { first_name?: string } };
  callback_query?: { id: string; data?: string; message?: { chat: { id: number } } };
};

export type TgEvent =
  | { kind: "start"; chatId: number; token: string | null }
  | { kind: "stop"; chatId: number }
  | { kind: "text"; chatId: number; text: string }
  | { kind: "action"; chatId: number; callbackId: string; action: "insight" | "skip"; jobId: string }
  | { kind: "ignore" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parseUpdate(u: TgUpdate): TgEvent {
  if (u.callback_query) {
    const chatId = u.callback_query.message?.chat.id;
    const [a, jobId] = (u.callback_query.data ?? "").split(":");
    const action = a === "i" ? "insight" : a === "s" ? "skip" : null;
    if (!chatId || !action || !UUID.test(jobId ?? "")) return { kind: "ignore" };
    return { kind: "action", chatId, callbackId: u.callback_query.id, action, jobId };
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
};

/** One pick as a Telegram HTML message with its buttons. Callback data stays under Telegram's 64-byte limit. */
export function pickMessage(p: Pick, appUrl: string) {
  const lines = [
    `<b>${escapeHtml(p.title)}</b>`,
    `${escapeHtml(p.company)} · ${escapeHtml(p.remote ? "Remote" : p.location)}`,
    `${escapeHtml(p.badge.label)}: ${escapeHtml(p.badge.detail)}`,
    ...(p.why ? [`Why it fits: ${escapeHtml(p.why)}`] : []),
  ];
  const ask = (q: string) => `${appUrl}/chat?ask=${encodeURIComponent(q)}`;
  return {
    text: lines.join("\n"),
    reply_markup: {
      inline_keyboard: [
        [{ text: "Open posting", url: p.url }, { text: `About ${p.company}`.slice(0, 40), callback_data: `i:${p.id}` }],
        [{ text: "Draft my email", url: ask(`Draft a cold email for the ${p.title} role at ${p.company} (job ${p.id})`) }, { text: "Skip", callback_data: `s:${p.id}` }],
      ],
    },
  };
}
