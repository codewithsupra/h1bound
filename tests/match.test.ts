import { describe, expect, it } from "vitest";
import { rankJobs, scoreJob, type JobLite, type Profile } from "@/lib/match";
import type { SponsorStats } from "@/lib/sponsor";

const now = Date.parse("2026-10-26T00:00:00Z");
const p: Profile = { skills: ["Python", "React", "SQL", "AWS"], targetFamilies: ["software_engineer"], yearsExperience: 1, needsSponsorship: true, wantsRemote: "any", locations: [] };
const job = (id: string, title: string, company: string, description = "", remote = false): JobLite => ({ id, title, company, location: "New York, NY", remote, description, postedAt: "2026-10-24T00:00:00Z" });
const strong: SponsorStats = { fiscalYear: 2026, total: 500, byFamily: { software_engineer: { count: 200, medianWage: 150000 } }, lastFiled: null };
const zero: SponsorStats = { fiscalYear: 2026, total: 0, byFamily: {}, lastFiled: null };

describe("scoreJob", () => {
  it("rewards family, skills, entry level, sponsorship and freshness", () => {
    const s = scoreJob(job("1", "Software Engineer, New Grad", "Big", "Python React SQL AWS"), p, strong, now);
    expect(s.score).toBe(100);
    expect(s.reasons).toContain("employer has filed H-1Bs");
  });
  it("does not match skill substrings (java ≠ javascript)", () => {
    const s = scoreJob(job("1", "Engineer", "X", "JavaScript"), { ...p, skills: ["Java"] }, strong, now);
    expect(s.reasons.join()).not.toContain("uses Java");
  });
  it("scores senior roles lower for new grads", () => {
    const a = scoreJob(job("1", "Software Engineer I", "Big", "python"), p, strong, now).score;
    const b = scoreJob(job("2", "Senior Software Engineer", "Big", "python"), p, strong, now).score;
    expect(a).toBeGreaterThan(b);
  });
});

describe("rankJobs", () => {
  it("drops zero-filing employers for users who need sponsorship and sorts by score", () => {
    const jobs = [job("a", "Software Engineer", "NoSponsor", "python"), job("b", "Data Analyst", "Big"), job("c", "Software Engineer", "Big", "python react")];
    const sponsorOf = (c: string) => (c === "Big" ? strong : zero);
    expect(rankJobs(jobs, p, sponsorOf, now).map((s) => s.job.id)).toEqual(["c", "b"]);
    expect(rankJobs(jobs, { ...p, needsSponsorship: false }, sponsorOf, now)).toHaveLength(3);
  });
});

import { blendRerank, cleanRerank } from "@/lib/match";

describe("rerank", () => {
  it("cleans model output: bad numbers, duplicates and long text", () => {
    const m = cleanRerank([
      { n: 1, fit: 140, why: "a ".repeat(40), gap: "" },
      { n: 1, fit: 10, why: "dup", gap: null },
      { n: 9, fit: 50, why: "out of range", gap: null },
      { n: 2, fit: NaN, why: "nan", gap: null },
    ], ["a", "b"]);
    expect([...m.keys()]).toEqual(["a"]);
    expect(m.get("a")).toMatchObject({ fit: 100, gap: null });
    expect(m.get("a")!.why.split(" ")).toHaveLength(24);
  });
  it("blends scores and reorders", () => {
    const p = { skills: [], targetFamilies: [], yearsExperience: 0, needsSponsorship: false, wantsRemote: "any" as const, locations: [] };
    const mk = (id: string) => scoreJob({ id, title: "Engineer", company: "c", location: "London", remote: false, description: "", postedAt: null }, p, null);
    const [a, b] = [mk("a"), mk("b")];
    const out = blendRerank([a, b], new Map([["b", { fit: 100, why: "Strong React work", gap: null }]]));
    expect(out[0].job.id).toBe("b");
    expect(out[0].why).toBe("Strong React work");
  });
});

describe("visa scoring", () => {
  const p = { skills: [], targetFamilies: [], yearsExperience: 0, needsSponsorship: true, wantsRemote: "any" as const, locations: [] };
  const job = { id: "j", title: "Graduate Software Engineer", company: "c", location: "London", remote: false, description: "", postedAt: new Date(Date.now() - 2 * 86_400_000).toISOString() };
  it("rewards licensed sponsors and fresh postings", () => {
    const licensed = scoreJob(job, p, null, Date.now(), { fit: "ok_licensed", right: "sponsor", reason: "on the UK sponsor register" });
    const risky = scoreJob(job, p, null, Date.now(), { fit: "risky", right: "sponsor", reason: null });
    expect(licensed.score).toBeGreaterThan(risky.score);
    expect(licensed.reasons).toContain("on the UK sponsor register");
    expect(licensed.reasons).toContain("posted 2 days ago");
  });
});
