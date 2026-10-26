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
