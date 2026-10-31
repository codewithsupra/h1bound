import { describe, expect, it } from "vitest";
import { picksEmail, picksToday } from "@/lib/picks";

const now = Date.parse("2026-11-02T07:00:00Z");

describe("picksToday", () => {
  it("gives Pro 3 a day and free users 1 while their allowance lasts", () => {
    expect(picksToday({ pro: true, jobsShown: 100, jobLimit: 10, lastPickAt: null, now })).toBe(5);
    expect(picksToday({ pro: false, jobsShown: 4, jobLimit: 10, lastPickAt: null, now })).toBe(1);
    expect(picksToday({ pro: false, jobsShown: 10, jobLimit: 10, lastPickAt: null, now })).toBe(0);
  });
  it("sends at most once a day", () => {
    expect(picksToday({ pro: true, jobsShown: 0, jobLimit: 10, lastPickAt: now - 3_600_000, now })).toBe(0);
    expect(picksToday({ pro: true, jobsShown: 0, jobLimit: 10, lastPickAt: now - 24 * 3_600_000, now })).toBe(5);
  });
});

describe("picksEmail", () => {
  it("includes the posting, sponsor proof and a prefilled draft link", () => {
    const e = picksEmail("Priya", [{ id: "j1", title: "Graduate Analyst", company: "Monzo", location: "London", remote: false, url: "https://x/1", badge: { label: "Licensed sponsor", detail: "On the UK Home Office sponsor register" } }], "https://app", "H1Bound", "https://app/u/t");
    expect(e.subject).toBe("Today's pick: Graduate Analyst at Monzo");
    expect(e.text).toContain("Licensed sponsor: On the UK Home Office sponsor register");
    expect(e.text).toContain("https://app/chat?ask=Draft%20a%20cold%20email");
    expect(e.text).toContain("Unsubscribe: https://app/u/t");
  });
});

import { clampPicks, localHour } from "@/lib/picks";
describe("per-user pick counts", () => {
  const now = Date.parse("2026-11-01T08:30:00Z");
  it("uses the chosen count for paid Pro, capped at 3 on the trial", () => {
    expect(picksToday({ pro: true, perDay: 12, jobsShown: 0, jobLimit: 10, lastPickAt: null, now })).toBe(12);
    expect(picksToday({ pro: true, trial: true, perDay: 12, jobsShown: 0, jobLimit: 10, lastPickAt: null, now })).toBe(3);
    expect(picksToday({ pro: false, perDay: 12, jobsShown: 0, jobLimit: 10, lastPickAt: null, now })).toBe(1);
  });
  it("clamps to 3–15", () => {
    expect(clampPicks(1)).toBe(3);
    expect(clampPicks(40)).toBe(15);
    expect(clampPicks(Number.NaN)).toBe(5);
  });
  it("reads the local hour, falling back to London", () => {
    expect(localHour(now, "Europe/Amsterdam")).toBe(9);
    expect(localHour(now, "Asia/Kolkata")).toBe(14);
    expect(localHour(now, "Not/AZone")).toBe(8);
  });
});
