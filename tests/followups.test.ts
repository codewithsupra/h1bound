import { beforeEach, describe, expect, it, vi } from "vitest";
import { encrypt, encryptJson } from "@/lib/crypto";
import { createFakeDb, type FakeDb } from "./helpers/fake-db";

let db: FakeDb;
const sendGmail = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ adminDb: () => db.database }));
vi.mock("@/lib/server/gmail", () => ({ sendGmail: (...a: unknown[]) => sendGmail(...a) }));

const { runDueFollowUps, cancelAutoFollowUp, MAX_ATTEMPTS } = await import("@/lib/server/followups");

const DAY = 86_400_000;
const now = Date.parse("2026-11-27T10:25:00Z");
const iso = (t: number) => new Date(t).toISOString();

function seed(o: { status?: string; due?: number; first?: Partial<Record<string, unknown>>; fu?: Partial<Record<string, unknown>> } = {}) {
  db = createFakeDb({
    matches: [{ user_id: "alice", job_id: "job-1", status: o.status ?? "emailed" }],
    outreach: [
      { id: "first", user_id: "alice", job_id: "job-1", kind: "cold_email", sent_at: iso(now - 4 * DAY), gmail_thread_id: "thread-1", rfc_message_id: "<first@gmail.com>", sent_meta_enc: encryptJson({ to: "cto@monzo.com", subject: "Graduate data role" }), body_enc: encryptJson({ senderName: "Alice Rao" }), ...o.first },
      { id: "fu", user_id: "alice", job_id: "job-1", kind: "follow_up", sent_at: null, auto_send_at: iso(o.due ?? now - 60_000), auto_body_enc: encrypt("Just bumping this."), auto_attempts: 0, body_enc: encryptJson({ senderName: "Alice Rao" }), ...o.fu },
    ],
  });
}
const fu = () => db.tables.outreach.find((r) => r.id === "fu")!;

beforeEach(() => {
  sendGmail.mockReset().mockResolvedValue({ id: "gmail-2", threadId: "thread-1", messageId: "<fu@gmail.com>", from: "alice@gmail.com" });
  seed();
});

describe("runDueFollowUps", () => {
  it("sends a due follow-up as a reply in the first email's thread, with the approved text", async () => {
    const out = await runDueFollowUps(now);
    expect(out).toMatchObject({ due: 1, sent: 1 });
    expect(sendGmail).toHaveBeenCalledWith("alice", {
      to: "cto@monzo.com", subject: "Re: Graduate data role", body: "Just bumping this.", fromName: "Alice Rao", threadId: "thread-1", inReplyTo: "<first@gmail.com>",
    });
    expect(fu()).toMatchObject({ sent_at: iso(now), auto_send_at: null, gmail_message_id: "gmail-2" });
  });

  it("waits until it's due", async () => {
    seed({ due: now + 3_600_000 });
    expect((await runDueFollowUps(now)).due).toBe(0);
    expect(sendGmail).not.toHaveBeenCalled();
  });

  it.each(["replied", "interview", "offer", "rejected", "dismissed"])("doesn't send once the job is %s, and unschedules it", async (status) => {
    seed({ status });
    const out = await runDueFollowUps(now);
    expect(out.stopped).toBe(1);
    expect(sendGmail).not.toHaveBeenCalled();
    expect(fu()).toMatchObject({ sent_at: null, auto_send_at: null });
  });

  it("doesn't send if the first email has no recorded recipient", async () => {
    seed({ first: { sent_meta_enc: null } });
    expect((await runDueFollowUps(now)).stopped).toBe(1);
    expect(sendGmail).not.toHaveBeenCalled();
  });

  it("never sends twice: a second run finds nothing to do", async () => {
    await runDueFollowUps(now);
    await runDueFollowUps(now + 3_600_000);
    expect(sendGmail).toHaveBeenCalledTimes(1);
  });

  it("two overlapping runs still send it once (the claim)", async () => {
    const [a, b] = await Promise.all([runDueFollowUps(now), runDueFollowUps(now)]);
    expect(a.sent + b.sent).toBe(1);
    expect(sendGmail).toHaveBeenCalledTimes(1);
  });

  it("a cancelled follow-up never goes out", async () => {
    await cancelAutoFollowUp("alice", "job-1");
    expect((await runDueFollowUps(now)).due).toBe(0);
    expect(fu().auto_body_enc).toBeNull();
  });

  it("cancelling only touches the student's own follow-up", async () => {
    await cancelAutoFollowUp("bob", "job-1");
    expect(fu().auto_send_at).not.toBeNull();
  });

  it("a Gmail failure releases the claim and retries in an hour", async () => {
    sendGmail.mockRejectedValue(new Error("gmail send: 500"));
    const out = await runDueFollowUps(now);
    expect(out.retried).toBe(1);
    expect(fu()).toMatchObject({ sent_at: null, auto_send_at: iso(now + 3_600_000), auto_attempts: 1 });
  });

  it(`after ${MAX_ATTEMPTS} failures it hands the follow-up back to the student`, async () => {
    seed({ fu: { auto_attempts: MAX_ATTEMPTS - 1 } });
    sendGmail.mockRejectedValue(new Error("gmail send: 500"));
    expect((await runDueFollowUps(now)).gaveUp).toBe(1);
    expect(fu()).toMatchObject({ sent_at: null, auto_send_at: null });
  });

  it("Gmail disconnected: hands it back straight away", async () => {
    sendGmail.mockRejectedValue(new Error("not_connected"));
    expect((await runDueFollowUps(now)).gaveUp).toBe(1);
    expect(fu().auto_send_at).toBeNull();
  });
});
