import { describe, expect, it } from "vitest";
import { canReview, canShowJobs, canUse, FREE_LIMITS, upsellLine, type Usage } from "@/lib/quota";

const fresh: Usage = { jobsShown: 0, reviewedJobIds: [], reviewRounds: 0 };

describe("free limits", () => {
  it("are 10 jobs, 5 reviewed jobs, 15 rounds", () => {
    expect(FREE_LIMITS).toEqual({ jobs: 10, reviewedJobs: 5, reviewRounds: 15 });
  });
  it("caps jobs at 10 for free and none for pro", () => {
    expect(canShowJobs(fresh, false, 8)).toEqual({ show: 8, blocked: 0 });
    expect(canShowJobs({ ...fresh, jobsShown: 8 }, false, 5)).toEqual({ show: 2, blocked: 3 });
    expect(canShowJobs({ ...fresh, jobsShown: 10 }, false, 1)).toEqual({ show: 0, blocked: 1 });
    expect(canShowJobs({ ...fresh, jobsShown: 999 }, true, 5)).toEqual({ show: 5, blocked: 0 });
  });
  it("allows reviews on 5 distinct jobs, repeat rounds on those, 15 rounds max", () => {
    const five: Usage = { jobsShown: 10, reviewedJobIds: ["a", "b", "c", "d", "e"], reviewRounds: 9 };
    expect(canReview(five, false, "a").ok).toBe(true);
    expect(canReview(five, false, "f")).toEqual({ ok: false, reason: "reviewed_jobs" });
    expect(canReview({ ...five, reviewRounds: 15 }, false, "a")).toEqual({ ok: false, reason: "review_rounds" });
    expect(canReview({ ...five, reviewRounds: 15 }, true, "z").ok).toBe(true);
  });
  it("gates pro features", () => {
    expect(canUse("cold_email", false)).toEqual({ ok: false, reason: "pro_only" });
    expect(canUse("cold_email", true).ok).toBe(true);
    expect(upsellLine("jobs")).toMatch(/10/);
  });
});

import { GUEST_LIMITS } from "@/lib/quota";
describe("guest limits", () => {
  it("caps guests at 5 jobs", () => {
    expect(GUEST_LIMITS.jobs).toBe(5);
    expect(canShowJobs({ jobsShown: 3, reviewedJobIds: [], reviewRounds: 0 }, false, 5, GUEST_LIMITS.jobs)).toEqual({ show: 2, blocked: 3 });
    expect(upsellLine("guest_jobs")).toMatch(/free account/);
  });
});
