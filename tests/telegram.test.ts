import { describe, expect, it } from "vitest";
import { escapeHtml, parseUpdate, pickMessage } from "@/lib/telegram";

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
    expect(parseUpdate({ update_id: 2, callback_query: { id: "q", data: `i:${id}`, message: { chat: { id: 7 } } } })).toEqual({ kind: "action", chatId: 7, callbackId: "q", action: "insight", jobId: id });
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
