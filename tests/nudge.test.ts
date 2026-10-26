import { describe, expect, it } from "vitest";
import { chooseNudge, nudgeCopy, type NudgeState } from "@/lib/nudge";

const DAY = 86_400_000;
const now = Date.parse("2026-10-26T12:00:00Z");
const base: NudgeState = { consented: true, pro: false, now, sentAt: [], sentKinds: [], staleApplications: 0, newMatchingJobs: 0, freeLimitHit: false };

describe("chooseNudge", () => {
  it("never emails without consent", () => expect(chooseNudge({ ...base, consented: false, staleApplications: 3 })).toBeNull());
  it("respects 2-day gap and 3/week cap", () => {
    expect(chooseNudge({ ...base, staleApplications: 1, sentAt: [now - 1 * DAY] })).toBeNull();
    expect(chooseNudge({ ...base, staleApplications: 1, sentAt: [now - 2.5 * DAY, now - 4 * DAY, now - 6 * DAY] })).toBeNull();
    expect(chooseNudge({ ...base, staleApplications: 1, sentAt: [now - 3 * DAY] })).toBe("follow_up");
  });
  it("prefers useful nudges over selling, and sells at most once", () => {
    expect(chooseNudge({ ...base, staleApplications: 1, newMatchingJobs: 9, freeLimitHit: true })).toBe("follow_up");
    expect(chooseNudge({ ...base, newMatchingJobs: 5, freeLimitHit: true })).toBe("new_jobs");
    expect(chooseNudge({ ...base, freeLimitHit: true })).toBe("upgrade");
    expect(chooseNudge({ ...base, freeLimitHit: true, sentKinds: ["upgrade"], sentAt: [now - 10 * DAY] })).toBeNull();
    expect(chooseNudge({ ...base, pro: true, freeLimitHit: true })).toBeNull();
  });
  it("always includes an unsubscribe link", () => {
    for (const k of ["follow_up", "new_jobs", "upgrade"] as const) expect(nudgeCopy(k, "A", { stale: 1, jobs: 4 }, "https://x", "https://x/u/t").text).toContain("https://x/u/t");
  });
});
