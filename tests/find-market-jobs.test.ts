import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "./helpers/fake-db";
import type { ProfileRow } from "@/lib/server/profile";
import type { Store } from "@/lib/server/store";

let db: FakeDb;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ adminDb: () => db.database }));
vi.mock("@/lib/server/rerank", () => ({ rerank: async () => new Map() }));

const { findJobs } = await import("@/lib/server/jobs");

const recorded: string[] = [];
const store = { seenJobIds: async () => new Set<string>(), recordShown: async (r: { jobId: string }[]) => { recorded.push(...r.map((x) => x.jobId)); }, jobLimit: 10 } as unknown as Store;
const usage = { jobsShown: 0, reviewedJobIds: [], reviewRounds: 0 };

// An Indian graduate on the UK Graduate visa: needs a sponsor to stay.
const row = {
  user_id: "u1", details_enc: null, skills: ["sql"], target_families: [], years_experience: 1, visa_status: null, needs_sponsorship: true,
  wants_remote: "any", locations: [], onboarded: true, citizenship: "IN", visa_country: "GB", visa_situation: "graduate", target_countries: ["GB"],
} as unknown as ProfileRow;

const job = (id: string, over: Record<string, unknown> = {}) => ({
  id, title: `Data Analyst ${id}`, company: `Co ${id}`, company_id: null, location: "London, UK", remote: false, url: `https://x/${id}`,
  description: "SQL and Python", posted_at: "2026-11-14T00:00:00Z", first_seen: "2026-11-14T00:00:00Z", jd_sponsorship: null, family: "data",
  country: "GB", remote_scope: null, licence_id: null, licence_match: null, source: "greenhouse", seniority: "mid", active: true,
  salary_min: null, salary_max: null, salary_currency: null, salary_period: null, ...over,
});
const gbp = (min: number) => ({ salary_min: min, salary_currency: "GBP", salary_period: "year" });

beforeEach(() => {
  recorded.length = 0;
  db = createFakeDb({
    sponsor_licences: [{ id: "L1", country: "GB", rating: "A", routes: ["Skilled Worker"], permits: {} }],
    jobs: [
      job("licensed-pays", { licence_id: "L1", licence_match: "exact", ...gbp(40_000) }),
      job("licensed-underpays", { licence_id: "L1", licence_match: "exact", ...gbp(28_000) }),
      job("licensed-unstated", { licence_id: "L1", licence_match: "unique" }),
      job("lookalike", { licence_id: "L1", licence_match: "ambiguous", ...gbp(50_000) }),
      job("unlicensed", { ...gbp(60_000) }),
      job("remote-open", { country: null, remote: true, remote_scope: "anywhere", location: "Remote" }),
      job("old", { licence_id: "L1", licence_match: "exact", first_seen: "2026-11-01T00:00:00Z" }),
    ],
  });
});

const ids = (r: { cards: { id: string }[] }) => r.cards.map((c) => c.id).sort();

describe("findJobs for the visa-clock digest", () => {
  it("without digest options, post-study visa holders see unlicensed employers too", async () => {
    const r = await findJobs(store, row, true, usage, { count: 20 });
    expect(ids(r)).toContain("unlicensed");
    expect(ids(r)).toContain("lookalike");
  });

  it("sponsorOnly keeps confirmed register links and jobs needing no visa, and drops look-alikes and unlicensed", async () => {
    const r = await findJobs(store, row, true, usage, { count: 20, sponsorOnly: true });
    expect(ids(r)).toEqual(["licensed-pays", "licensed-underpays", "licensed-unstated", "old", "remote-open"]);
    expect(r.cards.find((c) => c.id === "licensed-pays")?.sponsored).toBe(true);
    expect(r.cards.find((c) => c.id === "remote-open")?.sponsored).toBe(false);
  });

  it("since: only jobs first seen after the last digest", async () => {
    const r = await findJobs(store, row, true, usage, { count: 20, sponsorOnly: true, since: "2026-11-08T00:00:00Z" });
    expect(ids(r)).not.toContain("old");
  });

  it("salary: drops jobs posted under the floor, keeps 'not stated', attaches the check", async () => {
    const r = await findJobs(store, row, true, usage, { count: 20, sponsorOnly: true, salary: true });
    expect(ids(r)).not.toContain("licensed-underpays");
    const byId = new Map(r.cards.map((c) => [c.id, c]));
    expect(byId.get("licensed-pays")?.salary?.status).toBe("meets");
    expect(byId.get("licensed-unstated")?.salary?.status).toBe("unknown");
    expect(byId.get("remote-open")?.salary).toBeNull(); // no visa needed, so no floor
  });

  it("peek: counts matches without recording or showing anything", async () => {
    const r = await findJobs(store, row, false, usage, { count: 0, sponsorOnly: true, peek: true });
    expect(r.cards).toEqual([]);
    expect(r.poolSize).toBe(5);
    expect(recorded).toEqual([]);
  });

  it("records what it shows, so digest picks count like any match", async () => {
    await findJobs(store, row, true, usage, { count: 2, sponsorOnly: true });
    expect(recorded).toHaveLength(2);
  });
});
