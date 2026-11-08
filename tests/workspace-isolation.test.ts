import { beforeEach, describe, expect, it, vi } from "vitest";
import { decrypt, encrypt, encryptJson } from "@/lib/crypto";
import { createFakeDb, type FakeDb } from "./helpers/fake-db";

let db: FakeDb;
let session: { id: string; email: string; name: string | null } | null;
const redirect = vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); });

vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getSessionUser: async () => session }));
vi.mock("@/lib/supabase/admin", () => ({ adminDb: () => db.database }));

const actions = await import("@/app/(app)/actions");

const ALICE = { id: "user-alice", email: "alice@example.com", name: "Alice Rao" };
const BOB = { id: "user-bob", email: "bob@example.com", name: "Bob Stone" };
const J1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const J2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BOB_SECRET = "BOB-PRIVATE-NOTE-7731";
const BOB_EMAIL_BODY = "BOB-DRAFT-TEXT-9921";

beforeEach(() => {
  session = ALICE;
  redirect.mockClear();
  db = createFakeDb({
    jobs: [{ id: J1, description: "Build pipelines", posted_at: "2026-10-30" }, { id: J2, description: "Other role", posted_at: "2026-10-30" }],
    matches: [
      { user_id: ALICE.id, job_id: J1, status: "shown", notes_enc: encrypt("alice note") },
      { user_id: BOB.id, job_id: J1, status: "shown", notes_enc: encrypt(BOB_SECRET) },
      { user_id: BOB.id, job_id: J2, status: "emailed", notes_enc: null },
    ],
    outreach: [
      { id: "o-alice", user_id: ALICE.id, job_id: J1, kind: "cold_email", sent_at: null, body_enc: encryptJson({ email: "Hi from Alice", contact: { email: "sam@monzo.com" } }) },
      { id: "o-bob", user_id: BOB.id, job_id: J2, kind: "cold_email", sent_at: null, body_enc: encryptJson({ email: BOB_EMAIL_BODY, contact: { email: "bob-target@x.com" } }) },
    ],
    profiles: [{ user_id: ALICE.id, citizenship: "IN" }, { user_id: BOB.id, citizenship: "NG" }],
    consents: [{ user_id: BOB.id, email_updates: true, picks_paused: false }],
    chat_messages: [{ id: "c-bob", user_id: BOB.id, message_enc: encryptJson({ id: "m", role: "user", parts: [{ type: "text", text: "bob chat" }] }), created_at: "2026-10-30T10:00:00Z" }],
  });
});

const mine = (table: string, user = ALICE.id, job?: string) => db.tables[table].find((r) => r.user_id === user && (!job || r.job_id === job))!;

describe("every action needs a signed-in user", () => {
  it("sends anonymous callers to sign in and touches nothing", async () => {
    session = null;
    const calls: [string, () => Promise<unknown>][] = [
      ["setStage", () => actions.setStage(J1, "interview")],
      ["markReply", () => actions.markReply(J1, "yes")],
      ["saveNote", () => actions.saveNote(J1, "x")],
      ["jobDetail", () => actions.jobDetail(J1)],
      ["saveCase", () => actions.saveCase({ pitch: "x" })],
      ["answerQuestion", () => actions.answerQuestion("q1", "a")],
      ["saveSettings", () => actions.saveSettings({ picksPerDay: 9 })],
      ["exportData", () => actions.exportData()],
    ];
    for (const [name, call] of calls) await expect(call(), name).rejects.toThrow("REDIRECT /login");
    expect(db.log).toEqual([]);
  });
});

describe("a user can only change their own rows", () => {
  it("setStage moves only the caller's match", async () => {
    expect(await actions.setStage(J1, "interview")).toEqual({ ok: true });
    expect(mine("matches").status).toBe("interview");
    expect(mine("matches", BOB.id, J1).status).toBe("shown");
  });

  it("setStage cannot create or touch a match the caller doesn't have", async () => {
    await actions.setStage(J2, "offer"); // Alice has no match on J2; Bob does
    expect(mine("matches", BOB.id, J2).status).toBe("emailed");
    expect(db.tables.matches.filter((r) => r.user_id === ALICE.id)).toHaveLength(1);
  });

  it("rejects ids and stages that aren't valid, without querying", async () => {
    expect(await actions.setStage("' or 1=1 --", "interview")).toEqual({ ok: false });
    expect(await actions.setStage(J1, "hired" as never)).toEqual({ ok: false });
    expect(await actions.markReply("nope", "yes")).toEqual({ ok: false });
    expect(await actions.saveNote("nope", "x")).toEqual({ ok: false });
    expect(db.log).toEqual([]);
  });

  it("markReply: yes replied, no closes, not-yet only reschedules", async () => {
    await actions.markReply(J1, "not_yet");
    expect(mine("matches").status).toBe("shown");
    expect(mine("matches").asked_reply_at).toBeTruthy();
    await actions.markReply(J1, "yes");
    expect(mine("matches").status).toBe("replied");
    await actions.markReply(J1, "no");
    expect(mine("matches").status).toBe("rejected");
    expect(mine("matches", BOB.id, J1).status).toBe("shown");
  });

  it("notes are encrypted, trimmed to 4000 characters, and clearable", async () => {
    await actions.saveNote(J1, `  referral from Priya ${"x".repeat(5000)}  `);
    const stored = String(mine("matches").notes_enc);
    expect(stored).toMatch(/^v1:/);
    expect(stored).not.toMatch(/Priya/);
    expect(decrypt(stored).length).toBeLessThanOrEqual(4000);
    expect(decrypt(stored).length).toBeGreaterThan(3900);
    await actions.saveNote(J1, "   ");
    expect(mine("matches").notes_enc).toBeNull();
    expect(decrypt(String(mine("matches", BOB.id, J1).notes_enc))).toBe(BOB_SECRET);
  });
});

describe("a user can only read their own data", () => {
  it("jobDetail returns the caller's note and draft, decrypted", async () => {
    const d = await actions.jobDetail(J1);
    expect(d?.note).toBe("alice note");
    expect(d?.email).toMatchObject({ outreachId: "o-alice", text: "Hi from Alice", to: "sam@monzo.com" });
  });

  it("jobDetail returns nothing for a job the caller has no match on, even though another user does", async () => {
    expect(await actions.jobDetail(J2)).toBeNull();
  });

  it("jobDetail never leaks another user's note", async () => {
    const d = await actions.jobDetail(J1);
    expect(JSON.stringify(d)).not.toContain(BOB_SECRET);
  });

  it("the data export contains the caller's data and nothing of anyone else's", async () => {
    const out = await actions.exportData();
    const all = JSON.stringify(JSON.parse(out));
    expect(all).toContain("alice note");
    expect(all).toContain("Hi from Alice");
    for (const secret of [BOB_SECRET, BOB_EMAIL_BODY, "bob-target@x.com", "bob chat", "bob@example.com", BOB.id]) expect(all).not.toContain(secret);
    expect(all).toContain(ALICE.email);
  });
});

describe("settings and profile writes are scoped and validated", () => {
  it("clamps daily picks to 3-15 and ignores an unknown timezone", async () => {
    await actions.saveSettings({ picksPerDay: 40, timezone: "Mars/Olympus" });
    expect(mine("profiles").picks_per_day).toBe(15);
    expect(mine("profiles").timezone).toBeUndefined();
    await actions.saveSettings({ picksPerDay: 1, timezone: "Europe/Amsterdam" });
    expect(mine("profiles").picks_per_day).toBe(3);
    expect(mine("profiles").timezone).toBe("Europe/Amsterdam");
    expect(mine("profiles", BOB.id).picks_per_day).toBeUndefined();
  });

  it("writes consent changes to the caller's row only", async () => {
    await actions.saveSettings({ picksPaused: true, emailUpdates: false });
    expect(mine("consents", ALICE.id)).toMatchObject({ picks_paused: true, email_updates: false });
    expect(mine("consents", BOB.id)).toMatchObject({ picks_paused: false, email_updates: true });
  });

  it("saveCase refuses links that aren't web addresses and keeps valid ones", async () => {
    const bad = await actions.saveCase({ links: { github: "javascript:alert(1)" } });
    expect(bad.ok).toBe(false);
    const good = await actions.saveCase({ links: { github: "github.com/alice" }, citizenship: "in", targetCountries: ["GB", "XX"] });
    expect(good.ok).toBe(true);
    expect(mine("profiles").citizenship).toBe(null); // "in" is not an uppercase ISO code
    expect(mine("profiles").target_countries).toEqual(["GB"]);
    expect(mine("profiles", BOB.id).citizenship).toBe("NG");
  });
});
