import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptJson } from "@/lib/crypto";
import { createFakeDb, type FakeDb } from "./helpers/fake-db";

let db: FakeDb;
let chatOwner: string | null = "alice";
const tg = vi.fn();
const sendText = vi.fn();
const sendApprovedEmail = vi.fn();
const draftEmailForJob = vi.fn();
const cancelAutoFollowUp = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ adminDb: () => db.database }));
vi.mock("@/lib/server/telegram", () => ({
  claimLink: vi.fn(), stopChat: vi.fn(), userForChat: async () => chatOwner,
  tg: (...a: unknown[]) => tg(...a), sendText: (...a: unknown[]) => sendText(...a),
}));
vi.mock("@/lib/server/insight", () => ({ companyInsight: vi.fn() }));
vi.mock("@/lib/server/store", () => ({ storeForUser: async () => ({}) }));
vi.mock("@/lib/server/outreach-send", () => ({ sendApprovedEmail: (...a: unknown[]) => sendApprovedEmail(...a) }));
vi.mock("@/lib/server/draft-email", () => ({ draftEmailForJob: (...a: unknown[]) => draftEmailForJob(...a) }));
vi.mock("@/lib/server/followups", () => ({ cancelAutoFollowUp: (...a: unknown[]) => cancelAutoFollowUp(...a) }));

process.env.TELEGRAM_WEBHOOK_SECRET = "s3cret-value";
const { POST } = await import("@/app/api/telegram/route");

const JOB = "11111111-1111-4111-8111-111111111111";
const DRAFT = "22222222-2222-4222-8222-222222222222";
const press = (data: string) => POST(new Request("http://localhost/api/telegram", {
  method: "POST", headers: { "x-telegram-bot-api-secret-token": "s3cret-value" },
  body: JSON.stringify({ update_id: 1, callback_query: { id: "cb1", data, message: { message_id: 55, chat: { id: 42 } } } }),
}));
const answers = () => tg.mock.calls.filter((c) => c[0] === "answerCallbackQuery").map((c) => (c[1] as { text: string }).text);

beforeEach(() => {
  chatOwner = "alice";
  for (const f of [tg, sendText, sendApprovedEmail, draftEmailForJob, cancelAutoFollowUp]) f.mockReset();
  tg.mockResolvedValue(true); sendText.mockResolvedValue(true);
  db = createFakeDb({
    matches: [{ user_id: "alice", job_id: JOB, status: "emailed", jobs: { company: "Monzo", country: "GB" } }],
    outreach: [
      { id: DRAFT, user_id: "alice", job_id: JOB, kind: "cold_email", sent_at: null, body_enc: encryptJson({ contact: { email: "sam@monzo.com" }, email: "Subject: Graduate data role\n\nHi Sam,\nI built dbt models." }), jobs: { company: "Monzo" } },
      { id: "fu-1", user_id: "alice", job_id: JOB, kind: "follow_up", sent_at: null, created_at: "2026-11-23T10:00:00Z", body_enc: encryptJson({ email: "Just bumping this." }) },
    ],
  });
});

describe("Telegram: send from the chat", () => {
  it("sends the saved draft to the saved address, with the follow-up scheduled, then removes the buttons", async () => {
    sendApprovedEmail.mockResolvedValue({ ok: true, from: "alice@gmail.com", autoFollowUpAt: "2026-11-27T10:00:00Z" });
    await press(`x:${DRAFT}`);
    const [userId, , input] = sendApprovedEmail.mock.calls[0];
    expect(userId).toBe("alice");
    expect(input).toMatchObject({ outreachId: DRAFT, to: "sam@monzo.com", subject: "Graduate data role", autoFollowUp: { body: "Just bumping this." } });
    expect(input.body).toContain("I built dbt models.");
    expect(tg).toHaveBeenCalledWith("editMessageReplyMarkup", { chat_id: 42, message_id: 55, reply_markup: { inline_keyboard: [] } });
    expect(sendText.mock.calls[0][1]).toContain("The follow-up goes out");
  });

  it("'Send only' schedules no follow-up", async () => {
    sendApprovedEmail.mockResolvedValue({ ok: true, from: "alice@gmail.com", autoFollowUpAt: null });
    await press(`y:${DRAFT}`);
    expect(sendApprovedEmail.mock.calls[0][2].autoFollowUp).toBeUndefined();
  });

  it("someone else's chat can't send Alice's draft", async () => {
    chatOwner = "bob";
    await press(`x:${DRAFT}`);
    expect(sendApprovedEmail).not.toHaveBeenCalled();
    expect(answers()[0]).toMatch(/isn't linked to your account/);
  });

  it("an unlinked chat can't send anything", async () => {
    chatOwner = null;
    await press(`x:${DRAFT}`);
    expect(sendApprovedEmail).not.toHaveBeenCalled();
  });

  it("no address on the draft: says so instead of sending", async () => {
    db.tables.outreach[0].body_enc = encryptJson({ contact: null, email: "Subject: Hi\n\nHello" });
    await press(`y:${DRAFT}`);
    expect(sendApprovedEmail).not.toHaveBeenCalled();
    expect(answers()[0]).toMatch(/no address/);
  });

  it("a second tap after sending is refused by the shared send path, and the buttons stay as they were", async () => {
    sendApprovedEmail.mockResolvedValue({ ok: false, error: "already_sent", status: 409 });
    await press(`y:${DRAFT}`);
    expect(answers()[0]).toBe("This one has already been sent.");
    expect(tg.mock.calls.some((c) => c[0] === "editMessageReplyMarkup")).toBe(false);
  });
});

describe("Telegram: draft, replied, cancel", () => {
  it("drafts in the chat and shows the send buttons", async () => {
    draftEmailForJob.mockResolvedValue({
      job: { title: "Data Analyst", company: "Monzo" }, contact: { email: "sam@monzo.com", name: "Sam Lee" }, findContactYourself: null,
      email: "x", draft: { subject: "Graduate data role", body: "Hi Sam", followUp: "Bump" }, outreachId: DRAFT, followUpId: "fu-1", gmail: "connected", lookupsLeft: true,
    });
    await press(`d:${JOB}`);
    expect(draftEmailForJob).toHaveBeenCalledWith(expect.anything(), "alice", JOB);
    const [, text, extra] = sendText.mock.calls[0];
    expect(text).toContain("To: Sam Lee &lt;sam@monzo.com&gt;");
    expect(JSON.stringify(extra)).toContain(`x:${DRAFT}`);
  });

  it("free plan: points to Pro instead of drafting", async () => {
    draftEmailForJob.mockResolvedValue({ proOnly: true, upsell: "…" });
    await press(`d:${JOB}`);
    expect(sendText.mock.calls[0][1]).toMatch(/part of Pro/);
  });

  it("won't draft for a job that wasn't shown to this account", async () => {
    chatOwner = "bob";
    await press(`d:${JOB}`);
    expect(draftEmailForJob).not.toHaveBeenCalled();
  });

  it("'They replied' marks the job replied and stops the follow-up", async () => {
    await press(`r:${JOB}`);
    expect(db.tables.matches[0].status).toBe("replied");
    expect(cancelAutoFollowUp).toHaveBeenCalledWith("alice", JOB);
  });

  it("'They replied' never moves a job backwards from an interview", async () => {
    db.tables.matches[0].status = "interview";
    await press(`r:${JOB}`);
    expect(db.tables.matches[0].status).toBe("interview");
  });

  it("'Cancel follow-up' cancels only this account's follow-up", async () => {
    await press(`c:${JOB}`);
    expect(cancelAutoFollowUp).toHaveBeenCalledWith("alice", JOB);
  });
});
