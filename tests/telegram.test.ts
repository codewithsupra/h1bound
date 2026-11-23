import { describe, expect, it } from "vitest";
import { draftMessage, escapeHtml, parseUpdate, pickMessage, sentMessage, type DraftCard } from "@/lib/telegram";

const id = "3f2b1c4d-5e6f-4a1b-8c2d-9e0f1a2b3c4d";

describe("parseUpdate", () => {
  it("reads /start with a link token", () => {
    expect(parseUpdate({ update_id: 1, message: { chat: { id: 7, type: "private" }, text: "/start abcdefghijklmnopqrstuvwxyz012345" } }))
      .toEqual({ kind: "start", chatId: 7, token: "abcdefghijklmnopqrstuvwxyz012345" });
    expect(parseUpdate({ update_id: 1, message: { chat: { id: 7, type: "private" }, text: "/start" } })).toEqual({ kind: "start", chatId: 7, token: null });
  });
  it("ignores group chats", () => {
    expect(parseUpdate({ update_id: 1, message: { chat: { id: -5, type: "group" }, text: "/start abcdefghijklmnopqrstuvwxyz012345" } }).kind).toBe("ignore");
  });
  it("reads button presses and rejects forged data", () => {
    expect(parseUpdate({ update_id: 2, callback_query: { id: "q", data: `i:${id}`, message: { chat: { id: 7 } } } })).toEqual({ kind: "action", chatId: 7, callbackId: "q", messageId: null, action: "insight", jobId: id });
    expect(parseUpdate({ update_id: 2, callback_query: { id: "q", data: "i:'; drop table", message: { chat: { id: 7 } } } }).kind).toBe("ignore");
  });
  it("reads /stop", () => {
    expect(parseUpdate({ update_id: 3, message: { chat: { id: 7, type: "private" }, text: "/stop" } })).toEqual({ kind: "stop", chatId: 7 });
  });
});

describe("pickMessage", () => {
  it("escapes HTML and keeps callback data short", () => {
    const m = pickMessage({ id, title: "Graduate <Engineer>", company: "AT&T", location: "London", remote: false, url: "https://x", badge: { label: "Licensed sponsor", detail: "On the register" }, why: "Python & SQL" }, "https://app");
    expect(m.text).toContain("<b>Graduate &lt;Engineer&gt;</b>");
    expect(m.text).toContain("AT&amp;T");
    for (const row of m.reply_markup.inline_keyboard) for (const b of row) if ("callback_data" in b) expect(Buffer.byteLength(b.callback_data as string)).toBeLessThanOrEqual(64);
    expect(escapeHtml("<a>")).toBe("&lt;a&gt;");
  });
});

describe("parseUpdate: drafting and sending from the chat", () => {
  const cb = (data: string) => parseUpdate({ update_id: 4, callback_query: { id: "q", data, message: { message_id: 99, chat: { id: 7 } } } });
  it("reads draft, replied and cancel buttons", () => {
    expect(cb(`d:${id}`)).toMatchObject({ kind: "action", action: "draft", jobId: id, messageId: 99 });
    expect(cb(`r:${id}`)).toMatchObject({ kind: "action", action: "replied" });
    expect(cb(`c:${id}`)).toMatchObject({ kind: "action", action: "cancel_follow_up" });
  });
  it("reads send buttons, with and without the follow-up", () => {
    expect(cb(`x:${id}`)).toEqual({ kind: "send", chatId: 7, callbackId: "q", messageId: 99, outreachId: id, autoFollowUp: true });
    expect(cb(`y:${id}`)).toMatchObject({ kind: "send", autoFollowUp: false });
  });
  it("rejects unknown or forged buttons", () => {
    for (const d of [`z:${id}`, "x:not-a-uuid", `x:${id}:extra`, "x:", ""]) expect(cb(d).kind, d).toBe("ignore");
  });
});

const card: DraftCard = {
  jobId: id, job: { title: "Data <Analyst>", company: "Monzo" }, to: "sam@monzo.com", contactName: "Sam Lee", subject: "Graduate data role", body: "Hi Sam,\nI built dbt models.",
  followUp: "Just bumping this.", outreachId: id, followUpId: id, gmail: "connected", findContactYourself: null,
};
const buttons = (m: { reply_markup: { inline_keyboard: { text: string; callback_data?: string; url?: string }[][] } }) => m.reply_markup.inline_keyboard.flat();

describe("draftMessage", () => {
  it("shows exactly what would be sent, including the follow-up, escaped", () => {
    const m = draftMessage(card, "https://app");
    expect(m.text).toContain("<b>Email for Data &lt;Analyst&gt; at Monzo</b>");
    expect(m.text).toContain("To: Sam Lee &lt;sam@monzo.com&gt;");
    expect(m.text).toContain("Just bumping this.");
    expect(buttons(m).map((b) => b.callback_data).filter(Boolean)).toEqual([`x:${id}`, `y:${id}`]);
  });
  it("no follow-up drafted: one plain send button", () => {
    expect(buttons(draftMessage({ ...card, followUp: null, followUpId: null }, "https://app")).find((b) => b.callback_data)?.text).toBe("Send from my Gmail");
  });
  it("no send buttons without an address or without Gmail", () => {
    expect(buttons(draftMessage({ ...card, to: null, findContactYourself: "https://linkedin.example" }, "https://app")).some((b) => b.callback_data)).toBe(false);
    const noGmail = buttons(draftMessage({ ...card, gmail: "not_connected" }, "https://app"));
    expect(noGmail.some((b) => b.callback_data)).toBe(false);
    expect(noGmail[0]).toMatchObject({ text: "Connect Gmail to send", url: "https://app/settings" });
  });
  it("stays inside Telegram's message limit", () => {
    expect(draftMessage({ ...card, body: "x".repeat(6000) }, "https://app").text.length).toBeLessThanOrEqual(4000);
  });
});

describe("sentMessage", () => {
  it("says when the follow-up goes out, and offers 'they replied' and cancel", () => {
    const m = sentMessage({ company: "Monzo", from: "alice@gmail.com", autoFollowUpAt: "2026-11-27T10:00:00Z", jobId: id });
    expect(m.text).toContain("The follow-up goes out Friday 27 Nov");
    expect(buttons(m).map((b) => b.callback_data)).toEqual([`r:${id}`, `c:${id}`]);
  });
  it("without a follow-up: only 'they replied'", () => {
    expect(buttons(sentMessage({ company: "Monzo", from: "a@gmail.com", autoFollowUpAt: null, jobId: id }))).toHaveLength(1);
  });
});
