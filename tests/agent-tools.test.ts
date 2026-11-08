import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "./helpers/fake-db";

let db: FakeDb;
vi.mock("@/lib/supabase/admin", () => ({ adminDb: () => db.database }));

const coldEmail = vi.fn();
const interviewPlan = vi.fn();
const tailorResume = vi.fn();
const reviewResume = vi.fn();
const findContact = vi.fn();
const loadJob = vi.fn();
vi.mock("@/lib/server/coach", () => ({ coldEmail: (...a: unknown[]) => coldEmail(...a), interviewPlan: (...a: unknown[]) => interviewPlan(...a), tailorResume: (...a: unknown[]) => tailorResume(...a), reviewResume: (...a: unknown[]) => reviewResume(...a) }));
vi.mock("@/lib/server/hunter", () => ({ findContact: (...a: unknown[]) => findContact(...a), linkedInSearch: (c: string) => `https://linkedin.example/search?q=${c}` }));
vi.mock("@/lib/server/jobs", () => ({ findJobs: vi.fn(), loadJob: (...a: unknown[]) => loadJob(...a), statsOf: vi.fn(), companiesById: vi.fn() }));
vi.mock("@/lib/server/growth", () => ({ referralInfo: async () => ({ code: "x", activated: 0, maxFriends: 3, jobsPerFriend: 5 }) }));
vi.mock("@/lib/server/insight", () => ({ companyInsight: vi.fn() }));
vi.mock("@/lib/server/gmail", () => ({ gmailAccount: async () => null, gmailConfigured: () => true }));

const { buildTools } = await import("@/lib/ai/tools");
type Store = Parameters<typeof buildTools>[0];

const JOB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_JOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const run = (t: unknown, input: unknown) => (t as { execute: (i: unknown, o: unknown) => Promise<Record<string, unknown>> }).execute(input, { toolCallId: "t", messages: [] });

const EMAIL = "Subject: Graduate data engineer role\n\nHi Sam, I cut a 6-hour pipeline to 40 minutes at Ocado. Could we talk for 15 minutes?\n\nFollow-up (send after 5 business days):\nHi Sam, following up on my note about the data role.";

function store(p: { kind?: "user" | "guest"; id?: string; pro?: boolean; shown?: string[]; lookups?: boolean } = {}) {
  const saved: unknown[] = [];
  const s = {
    kind: p.kind ?? "user", id: p.id ?? "user-alice", firstName: "Alice", jobLimit: 10, dailyMessageCap: 150,
    isPro: async () => p.pro ?? true,
    hasJob: async (id: string) => (p.shown ?? [JOB]).includes(id),
    contactLookupAllowed: async () => p.lookups ?? true,
    loadProfile: async () => ({ row: { skills: [], target_families: [], years_experience: 0, needs_sponsorship: true, wants_remote: "any", locations: [], onboarded: true, citizenship: "IN", visa_country: "GB", visa_situation: "graduate", target_countries: ["GB"], email_tone: "warm" }, details: { name: "Alice Rao", resumeText: "Alice Rao. Data engineer. Ocado intern.", signOff: null } }),
    saveProfile: async (patch: unknown) => { saved.push(patch); },
    saved,
  };
  return s as unknown as Store & { saved: unknown[] };
}

beforeEach(() => {
  db = createFakeDb({ outreach: [], matches: [
    { user_id: "user-alice", job_id: JOB, status: "shown" },
    { user_id: "user-bob", job_id: JOB, status: "shown" },
    { user_id: "user-bob", job_id: OTHER_JOB, status: "shown" },
  ] });
  for (const m of [coldEmail, interviewPlan, tailorResume, reviewResume, findContact, loadJob]) m.mockReset();
  coldEmail.mockResolvedValue(EMAIL);
  interviewPlan.mockResolvedValue("plan");
  tailorResume.mockResolvedValue("tips");
  findContact.mockResolvedValue({ name: "Sam Lee", title: "CTO", email: "sam@monzo.com", confidence: 90, source: "hunter" });
  loadJob.mockResolvedValue({ id: JOB, title: "Graduate Data Engineer", company: "Monzo", description: "x", url: "https://x", location: "London", remote: false, family: "data_engineer", posted_at: null, jd_sponsorship: null, company_id: null });
});

describe("guests", () => {
  it("get no outreach, coaching or tracking tools, and nothing is written or generated", async () => {
    const tools = buildTools(store({ kind: "guest", id: "guest-1" }));
    for (const [name, input] of [["coldEmail", { jobId: JOB }], ["interviewPlan", { jobId: JOB }], ["tailorResume", { jobId: JOB }], ["reviewResume", { jobId: JOB }], ["updateJobStatus", { jobId: JOB, status: "applied" }]] as const) {
      const out = await run((tools as Record<string, unknown>)[name], input);
      expect(out, name).toMatchObject({ signUpRequired: true });
    }
    expect([coldEmail, interviewPlan, tailorResume, reviewResume, findContact]).toSatisfy((ms: ReturnType<typeof vi.fn>[]) => ms.every((m) => m.mock.calls.length === 0));
    expect(db.log).toEqual([]);
  });

  it("never save a visa end date (the visa clock belongs to accounts)", async () => {
    const guest = store({ kind: "guest", id: "guest-1" });
    await run(buildTools(guest).updatePreferences, { visaEndsOn: "2027-01-31", citizenship: "IN" });
    expect(JSON.stringify(guest.saved)).not.toMatch(/visa_ends_on/);
    expect(JSON.stringify(guest.saved)).toMatch(/"citizenship":"IN"/);

    const user = store();
    await run(buildTools(user).updatePreferences, { visaEndsOn: "2027-01-31" });
    expect(JSON.stringify(user.saved)).toMatch(/"visa_ends_on":"2027-01-31"/);
  });
});

describe("free accounts", () => {
  it("cannot generate a cold email, and no model call or contact lookup is spent", async () => {
    const out = await run(buildTools(store({ pro: false })).coldEmail, { jobId: JOB });
    expect(out).toMatchObject({ proOnly: true });
    expect(coldEmail).not.toHaveBeenCalled();
    expect(findContact).not.toHaveBeenCalled();
    expect(db.tables.outreach).toHaveLength(0);
  });
});

describe("coldEmail", () => {
  it("only works on jobs the user was shown", async () => {
    const out = await run(buildTools(store({ shown: [] })).coldEmail, { jobId: JOB });
    expect(out).toMatchObject({ error: "unknown_job" });
    expect(loadJob).not.toHaveBeenCalled();
    expect(coldEmail).not.toHaveBeenCalled();
    expect(db.tables.outreach).toHaveLength(0);
  });

  it("saves the draft and follow-up for this user only, encrypted", async () => {
    const out = await run(buildTools(store()).coldEmail, { jobId: JOB });
    expect(out).toMatchObject({ job: { company: "Monzo" }, contact: { email: "sam@monzo.com" }, gmail: "not_connected" });
    const rows = db.tables.outreach;
    expect(rows.map((r) => r.kind).sort()).toEqual(["cold_email", "follow_up"]);
    for (const r of rows) {
      expect(r.user_id).toBe("user-alice");
      expect(r.job_id).toBe(JOB);
      expect(String(r.body_enc)).toMatch(/^v1:/);
      expect(String(r.body_enc)).not.toMatch(/Ocado|sam@monzo/);
    }
    expect(out.outreachId).toBe(rows.find((r) => r.kind === "cold_email")!.id);
    expect(out.followUpId).toBe(rows.find((r) => r.kind === "follow_up")!.id);
  });

  it("skips the paid contact lookup when the user is out of lookups, and offers a LinkedIn search instead", async () => {
    const out = await run(buildTools(store({ lookups: false })).coldEmail, { jobId: JOB });
    expect(findContact).not.toHaveBeenCalled();
    expect(out.contact).toBeNull();
    expect(String(out.findContactYourself)).toMatch(/linkedin/);
  });

  it("saves nothing if the model call fails, so no half-written draft exists", async () => {
    coldEmail.mockRejectedValueOnce(new Error("provider down"));
    await expect(run(buildTools(store()).coldEmail, { jobId: JOB })).rejects.toThrow("provider down");
    expect(db.tables.outreach).toHaveLength(0);
  });

  it("falls back gracefully when the contact lookup fails", async () => {
    findContact.mockRejectedValueOnce(new Error("hunter 500"));
    const out = await run(buildTools(store()).coldEmail, { jobId: JOB });
    expect(out.contact).toBeNull();
    expect(db.tables.outreach).toHaveLength(2);
  });
});

describe("updateJobStatus", () => {
  it("changes only the caller's own row for that job", async () => {
    const out = await run(buildTools(store()).updateJobStatus, { jobId: JOB, status: "interview" });
    expect(out).toEqual({ ok: true, status: "interview" });
    const mine = db.tables.matches.find((r) => r.user_id === "user-alice" && r.job_id === JOB)!;
    expect(mine.status).toBe("interview");
    expect(db.tables.matches.filter((r) => r.user_id === "user-bob").every((r) => r.status === "shown")).toBe(true);
  });
});

describe("tool inputs are validated before anything runs", () => {
  const tools = buildTools(store());
  const ok = (t: unknown, input: unknown) => (t as { inputSchema: { safeParse: (i: unknown) => { success: boolean } } }).inputSchema.safeParse(input).success;
  it("needs a real job id", () => {
    expect(ok(tools.coldEmail, { jobId: JOB })).toBe(true);
    expect(ok(tools.coldEmail, { jobId: "'; drop table jobs;--" })).toBe(false);
    expect(ok(tools.coldEmail, {})).toBe(false);
  });
  it("accepts only known statuses", () => {
    expect(ok(tools.updateJobStatus, { jobId: JOB, status: "offer" })).toBe(true);
    expect(ok(tools.updateJobStatus, { jobId: JOB, status: "hired" })).toBe(false);
  });
  it("rejects malformed preferences", () => {
    expect(ok(tools.updatePreferences, { citizenship: "India" })).toBe(false);
    expect(ok(tools.updatePreferences, { visaEndsOn: "next spring" })).toBe(false);
    expect(ok(tools.updatePreferences, { targetCountries: ["GB", "NL", "IE", "US"] })).toBe(false);
    expect(ok(tools.updatePreferences, { citizenship: "IN", targetCountries: ["GB"], visaEndsOn: "2027-01-31" })).toBe(true);
  });
});
