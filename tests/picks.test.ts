import { describe, expect, it } from "vitest";
import { picksToday } from "@/lib/picks";

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

import { clampPicks, inDeliveryWindow, localHour } from "@/lib/picks";

describe("inDeliveryWindow", () => {
  const at = (iso: string) => Date.parse(iso);
  it("hourly runs: only the exact hour", () => {
    expect(inDeliveryWindow(at("2026-11-25T08:10:00Z"), "Europe/London", 8)).toBe(true);
    expect(inDeliveryWindow(at("2026-11-25T09:10:00Z"), "Europe/London", 8)).toBe(false);
  });
  it("runs every 3 hours: the hour or the two after it, across midnight too", () => {
    expect(inDeliveryWindow(at("2026-11-25T10:00:00Z"), "Europe/London", 8, 3)).toBe(true);
    expect(inDeliveryWindow(at("2026-11-25T11:00:00Z"), "Europe/London", 8, 3)).toBe(false);
    expect(inDeliveryWindow(at("2026-11-25T07:00:00Z"), "Europe/London", 8, 3)).toBe(false);
    expect(inDeliveryWindow(at("2026-11-26T00:30:00Z"), "Europe/London", 23, 3)).toBe(true);
  });
  it("every user's hour falls in exactly one of the eight 3-hourly runs", () => {
    for (let hour = 0; hour < 24; hour++) {
      const hits = [0, 3, 6, 9, 12, 15, 18, 21].filter((h) => inDeliveryWindow(Date.UTC(2026, 10, 25, h), "UTC", hour, 3)).length;
      expect(hits, `hour ${hour}`).toBe(1);
    }
  });
});
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
