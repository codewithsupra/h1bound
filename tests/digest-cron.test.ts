import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const DAY = 86_400_000;
type Cand = Record<string, unknown>;

let candidates: Cand[] = [];
const logged: Record<string, unknown>[] = [];
const runs: Record<string, unknown>[] = [];
const findJobs = vi.fn();
const sendEmail = vi.fn();
let pro = false, paid = false, jobsShown = 0;
let profileRow: Record<string, unknown> = {};

vi.mock("@/lib/supabase/admin", () => ({
  adminDb: () => ({
    rpc: async () => ({ data: candidates, error: null }),
    from: (t: string) => ({ insert: async (r: Record<string, unknown>) => { (t === "nudge_log" ? logged : runs).push(r); return { error: null }; } }),
  }),
}));
vi.mock("@/lib/server/ops", () => ({ trackRun: async (_j: string, _m: unknown, fn: () => Promise<unknown>) => fn() }));
vi.mock("@/lib/server/store", () => ({
  storeForUser: async () => ({
    firstName: "Asha", jobLimit: 10,
    loadProfile: async () => ({ row: profileRow, details: { resumeText: "SQL, Python, dbt" } }),
    isPro: async () => pro, usage: async () => ({ jobsShown }),
  }),
}));
vi.mock("@/lib/server/growth", () => ({ hasPaidPlan: async () => paid }));
vi.mock("@/lib/server/jobs", () => ({ findJobs: (...a: unknown[]) => findJobs(...a) }));
vi.mock("@/lib/server/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
const newSponsorsFor = vi.fn();
vi.mock("@/lib/server/new-sponsors", () => ({ newSponsorsFor: (...a: unknown[]) => newSponsorsFor(...a) }));
vi.mock("@/lib/server/telegram", () => ({ telegramConfigured: () => false, chatIdOf: () => null, sendText: vi.fn() }));

process.env.CRON_SECRET = "s3cret";
process.env.RESEND_API_KEY = "re_test";
process.env.EMAIL_FROM = "Maya <maya@example.com>";
process.env.NEXT_PUBLIC_APP_URL = "https://app";

const { POST } = await import("@/app/api/cron/daily-picks/route");
const call = (auth = "Bearer s3cret") => POST(new NextRequest("http://localhost/api/cron/daily-picks?all=1", { method: "POST", headers: { authorization: auth } }));

const card = (id: string, sponsored: boolean) => ({
  id, title: `Analyst ${id}`, company: `Co ${id}`, location: "London", remote: false, url: `https://x/${id}`, postedAt: null, score: 80, reasons: [],
  badge: { level: "strong", label: sponsored ? "Licensed sponsor" : "Open to you", detail: sponsored ? "On the UK Home Office sponsor register" : "This remote role is open to your location." },
  sponsored, salary: null,
});

beforeEach(() => {
  candidates = [{ user_id: "u1", email: "asha@example.com", name: "Asha Rao", unsubscribe_token: "tok", email_updates: true, telegram_updates: false, telegram_chat_enc: null, last_pick: null, picks_per_day: 7, picks_hour: 8, timezone: "Europe/London" }];
  logged.length = 0;
  findJobs.mockReset().mockResolvedValue({ cards: [card("a", true)], blocked: 0, poolSize: 1 });
  sendEmail.mockReset().mockResolvedValue(true);
  newSponsorsFor.mockReset().mockResolvedValue([]);
  pro = false; paid = false; jobsShown = 0;
  profileRow = { visa_ends_on: new Date(Date.now() + 60 * DAY).toISOString().slice(0, 10), visa_situation: "graduate", visa_country: "GB" };
});

describe("visa-clock digest cron", () => {
  it("rejects calls without the cron secret", async () => {
    expect((await call("Bearer nope")).status).toBe(401);
  });

  it("paid: asks for the chosen count of new, sponsor-only jobs with the salary check", async () => {
    pro = true; paid = true;
    candidates[0].last_pick = new Date(Date.now() - DAY).toISOString();
    const out = await (await call()).json();
    const opts = findJobs.mock.calls[0][4];
    expect(opts).toMatchObject({ count: 7, sponsorOnly: true, salary: true, since: candidates[0].last_pick });
    expect(out).toMatchObject({ users: 1, picks: 1, failed: 0 });
    const [to, subject, text] = sendEmail.mock.calls[0];
    expect(to).toBe("asha@example.com");
    expect(subject).toMatch(/^\d+ days left: 1 new job at licensed sponsors$/);
    expect(text).toMatch(/days left on your Graduate visa/);
    expect(logged).toEqual([{ user_id: "u1", kind: "daily_picks", channel: "email" }]);
  });

  it("trial: daily, capped at 3", async () => {
    pro = true; paid = false;
    await call();
    expect(findJobs.mock.calls[0][4]).toMatchObject({ count: 3, salary: true });
  });

  it("free: weekly, so nothing goes out two days after the last one", async () => {
    candidates[0].last_pick = new Date(Date.now() - 2 * DAY).toISOString();
    await call();
    expect(findJobs).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("free: up to 3 jobs, no salary check, looking back a week on the first digest", async () => {
    await call();
    const opts = findJobs.mock.calls[0][4];
    expect(opts).toMatchObject({ count: 3, sponsorOnly: true });
    expect(opts.salary).toBeUndefined();
    expect(Date.now() - Date.parse(opts.since)).toBeGreaterThan(6.9 * DAY);
  });

  it("free with the allowance used: counts matches without showing them, and still sends the countdown", async () => {
    jobsShown = 10;
    findJobs.mockResolvedValue({ cards: [], blocked: 0, poolSize: 4 });
    const out = await (await call()).json();
    expect(findJobs.mock.calls[0][4]).toMatchObject({ peek: true, count: 0 });
    const [, subject, text] = sendEmail.mock.calls[0];
    expect(subject).toMatch(/days left: 4 new sponsor jobs matched you/);
    expect(text).toContain("https://app/upgrade");
    expect(out).toMatchObject({ users: 1, picks: 0, countOnly: 1 });
    expect(logged).toHaveLength(1); // so the weekly clock restarts
  });

  it("under 90 days left: sponsor jobs go first", async () => {
    pro = true; paid = true;
    findJobs.mockResolvedValue({ cards: [card("open", false), card("lic", true)], blocked: 0, poolSize: 2 });
    await call();
    const text: string = sendEmail.mock.calls[0][2];
    expect(text.indexOf("Analyst lic")).toBeLessThan(text.indexOf("Analyst open"));
  });

  it("sends nothing, and logs nothing, when no new jobs matched", async () => {
    findJobs.mockResolvedValue({ cards: [], blocked: 0, poolSize: 0 });
    await call();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(logged).toHaveLength(0);
  });

  it("a failed email isn't logged as delivered, so it's retried next time", async () => {
    sendEmail.mockResolvedValue(false);
    const out = await (await call()).json();
    expect(logged).toHaveLength(0);
    expect(out.users).toBe(0);
  });

  it("skips users with no resume or no channel", async () => {
    candidates[0].email_updates = false;
    await call();
    expect(findJobs).not.toHaveBeenCalled();
  });

  it("adds employers new on the register since the last digest, and sends for them alone", async () => {
    findJobs.mockResolvedValue({ cards: [], blocked: 0, poolSize: 0 });
    newSponsorsFor.mockResolvedValue([{ id: "s1", name: "Acme Robotics", country: "GB", city: "London", slug: "acme", firstListed: "2026-11-30", rating: "A", routes: ["Skilled Worker"], openRoles: 2 }]);
    candidates[0].last_pick = new Date(Date.now() - 7 * DAY).toISOString();
    const out = await (await call()).json();
    expect(newSponsorsFor.mock.calls[0][1]).toBe(candidates[0].last_pick);
    expect(newSponsorsFor.mock.calls[0][2]).toBe(3); // free plan
    expect(sendEmail.mock.calls[0][2]).toContain("Acme Robotics: new on the UK sponsor register");
    expect(out.sponsorsShown).toBe(1);
  });

  it("a failure finding new sponsors never blocks the digest", async () => {
    newSponsorsFor.mockRejectedValue(new Error("db down"));
    await call();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});
