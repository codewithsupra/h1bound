import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptJson } from "@/lib/crypto";
import { createFakeDb, type FakeDb } from "./helpers/fake-db";

let db: FakeDb;
let session: { id: string; email: string; name: string | null } | null;
const sendGmail = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ getSessionUser: async () => session }));
vi.mock("@/lib/supabase/admin", () => ({ adminDb: () => db.database }));
vi.mock("@/lib/server/gmail", () => ({ sendGmail: (...a: unknown[]) => sendGmail(...a) }));

const { POST } = await import("@/app/api/outreach/send/route");

const ALICE = { id: "user-alice", email: "alice@example.com", name: "Alice Rao" };
const BOB = { id: "user-bob", email: "bob@example.com", name: "Bob" };
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const valid = { outreachId: "11111111-1111-4111-8111-111111111111", to: "hiring@monzo.com", subject: "Graduate data role", body: "Hi, I built dbt pipelines at Ocado." };
const send = (body: unknown) => POST(new Request("http://localhost/api/outreach/send", { method: "POST", body: JSON.stringify(body) }));

function seed(extra: { outreach?: Record<string, unknown>[]; matches?: Record<string, unknown>[] } = {}) {
  db = createFakeDb({
    outreach: [
      { id: valid.outreachId, user_id: ALICE.id, job_id: "job-1", kind: "cold_email", sent_at: null, body_enc: encryptJson({ senderName: "Alice" }) },
      ...(extra.outreach ?? []),
    ],
    matches: [
      { user_id: ALICE.id, job_id: "job-1", status: "shown" },
      { user_id: BOB.id, job_id: "job-1", status: "shown" },
      ...(extra.matches ?? []),
    ],
  });
}
const draft = (id = valid.outreachId) => db.tables.outreach.find((r) => r.id === id)!;
const status = (user: string) => db.tables.matches.find((r) => r.user_id === user && r.job_id === "job-1")!.status;

beforeEach(() => {
  session = ALICE;
  sendGmail.mockReset();
  sendGmail.mockResolvedValue({ id: "gmail-msg-1", from: "alice@gmail.com" });
  seed();
});

describe("POST /api/outreach/send: who and what", () => {
  it("refuses an anonymous caller before touching anything", async () => {
    session = null;
    const res = await send(valid);
    expect(res.status).toBe(401);
    expect(sendGmail).not.toHaveBeenCalled();
    expect(db.log).toEqual([]);
  });

  it("rejects malformed requests", async () => {
    for (const bad of [null, { ...valid, outreachId: "not-a-uuid" }, { ...valid, to: "not an address" }, { ...valid, subject: "" }, { ...valid, body: "x".repeat(5001) }, { ...valid, to: "a@b.com\r\nBcc: evil@x.com" }]) {
      expect((await send(bad)).status).toBe(400);
    }
    expect(sendGmail).not.toHaveBeenCalled();
  });

  it("will not send another user's draft, and does not reveal that it exists", async () => {
    session = BOB;
    const res = await send(valid);
    expect(res.status).toBe(404);
    expect(sendGmail).not.toHaveBeenCalled();
    expect(draft().sent_at).toBeNull();
  });

  it("only sends cold emails and follow-ups, not interview plans or tailoring notes", async () => {
    seed({ outreach: [{ id: "22222222-2222-4222-8222-222222222222", user_id: ALICE.id, job_id: "job-1", kind: "interview_plan", sent_at: null, body_enc: encryptJson("plan") }] });
    const res = await send({ ...valid, outreachId: "22222222-2222-4222-8222-222222222222" });
    expect(res.status).toBe(404);
    expect(sendGmail).not.toHaveBeenCalled();
  });
});

describe("POST /api/outreach/send: sending exactly once", () => {
  it("sends once from the user's own account and records it", async () => {
    const res = await send(valid);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, from: "alice@gmail.com" });
    expect(sendGmail).toHaveBeenCalledTimes(1);
    expect(sendGmail).toHaveBeenCalledWith(ALICE.id, { to: valid.to, subject: valid.subject, body: valid.body, fromName: "Alice" });
    expect(draft().sent_at).toBeTruthy();
    expect(draft().gmail_message_id).toBe("gmail-msg-1");
    expect(status(ALICE.id)).toBe("emailed");
  });

  it("only changes the sender's own match, never another user's", async () => {
    await send(valid);
    expect(status(BOB.id)).toBe("shown");
  });

  it("does not downgrade a job already past 'emailed'", async () => {
    db.tables.matches.find((r) => r.user_id === ALICE.id)!.status = "interview";
    await send(valid);
    expect(status(ALICE.id)).toBe("interview");
  });

  it("refuses to send a draft that was already sent", async () => {
    draft().sent_at = ago(1);
    const res = await send(valid);
    expect(res.status).toBe(409);
    expect(sendGmail).not.toHaveBeenCalled();
  });

  it("a double click sends one email, not two", async () => {
    // Gmail is slow, so both requests are in flight together.
    sendGmail.mockImplementation(() => new Promise((r) => setTimeout(() => r({ id: "m", from: "alice@gmail.com" }), 20)));
    const [a, b] = await Promise.all([send(valid), send(valid)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(sendGmail).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/outreach/send: when sending fails", () => {
  it("releases the draft so the user can retry, and a retry then works", async () => {
    sendGmail.mockRejectedValueOnce(new Error("quota exceeded"));
    const failed = await send(valid);
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: "send_failed" });
    expect(draft().sent_at).toBeNull();
    expect(status(ALICE.id)).toBe("shown");

    const retry = await send(valid);
    expect(retry.status).toBe(200);
    expect(sendGmail).toHaveBeenCalledTimes(2);
  });

  it("tells the user to connect Gmail, and releases the draft", async () => {
    sendGmail.mockRejectedValueOnce(new Error("not_connected"));
    const res = await send(valid);
    expect(res.status).toBe(412);
    expect(await res.json()).toEqual({ error: "not_connected" });
    expect(draft().sent_at).toBeNull();
  });

  it("never lets the same email go out twice if recording the send fails afterwards", async () => {
    // The email is out; the database then errors. Releasing the claim here would allow a second send.
    // The first outreach update is the claim and must succeed; the second (recording the message id) throws.
    const original = db.database.from;
    let updates = 0;
    db.database.from = (t: string) => {
      const q = original(t);
      if (t === "outreach") {
        const u = q.update.bind(q);
        q.update = (patch: Record<string, unknown>) => {
          updates++;
          if (updates === 2) throw new Error("db down while recording");
          return u(patch);
        };
      }
      return q;
    };
    const res = await send(valid);
    expect(res.status).toBe(200);
    expect(sendGmail).toHaveBeenCalledTimes(1);
    expect(draft().sent_at).toBeTruthy(); // still claimed
    const again = await send(valid);
    expect(again.status).toBe(409);
    expect(sendGmail).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/outreach/send: follow-ups", () => {
  const FU = "33333333-3333-4333-8333-333333333333";
  const followUp = { id: FU, user_id: ALICE.id, job_id: "job-1", kind: "follow_up", sent_at: null, body_enc: encryptJson({ senderName: "Alice" }) };

  it("is blocked until the first email has actually been sent", async () => {
    seed({ outreach: [followUp] });
    const res = await send({ ...valid, outreachId: FU });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "too_soon" });
    expect(sendGmail).not.toHaveBeenCalled();
  });

  it("is blocked inside 4 days of the first email", async () => {
    seed({ outreach: [followUp] });
    draft().sent_at = ago(3);
    const res = await send({ ...valid, outreachId: FU });
    expect(await res.json()).toMatchObject({ error: "too_soon" });
    expect(sendGmail).not.toHaveBeenCalled();
    expect(draft(FU).sent_at).toBeNull();
  });

  it("goes out once 4 days have passed", async () => {
    seed({ outreach: [followUp] });
    draft().sent_at = ago(4.1);
    const res = await send({ ...valid, outreachId: FU });
    expect(res.status).toBe(200);
    expect(sendGmail).toHaveBeenCalledTimes(1);
  });

  it("does not count someone else's first email", async () => {
    seed({ outreach: [followUp, { id: "44444444-4444-4444-8444-444444444444", user_id: BOB.id, job_id: "job-1", kind: "cold_email", sent_at: ago(10), body_enc: encryptJson({}) }] });
    const res = await send({ ...valid, outreachId: FU });
    expect(await res.json()).toMatchObject({ error: "too_soon" });
    expect(sendGmail).not.toHaveBeenCalled();
  });
});
