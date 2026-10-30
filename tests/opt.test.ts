import { describe, expect, it } from "vitest";
import { optStatus, optSummary } from "@/lib/opt";
import { freeJobLimit } from "@/lib/quota";

const today = new Date("2026-10-30T15:00:00Z");

describe("optStatus", () => {
  it("counts days since asOf while unemployed", () => {
    const s = optStatus({ type: "opt", usedDays: 20, asOf: "2026-10-20", employed: false }, today);
    expect(s).toEqual({ allowance: 90, used: 30, left: 60, deadline: "2026-12-29", expired: false });
  });
  it("pauses the clock while employed", () => {
    const s = optStatus({ type: "opt", usedDays: 20, asOf: "2026-01-01", employed: true }, today);
    expect(s.left).toBe(70);
    expect(s.deadline).toBeNull();
  });
  it("uses 150 days total for STEM OPT", () => {
    expect(optStatus({ type: "stem", usedDays: 90, asOf: "2026-10-30", employed: false }, today).left).toBe(60);
  });
  it("clamps at zero once the allowance is used", () => {
    const s = optStatus({ type: "opt", usedDays: 80, asOf: "2026-09-01", employed: false }, today);
    expect(s).toMatchObject({ used: 90, left: 0, expired: true, deadline: null });
    expect(optSummary(s, false)).toMatch(/DSO/);
  });
  it("ignores a future or invalid asOf", () => {
    expect(optStatus({ type: "opt", usedDays: 5, asOf: "2027-01-01", employed: false }, today).used).toBe(5);
    expect(optStatus({ type: "opt", usedDays: 5, asOf: "bad", employed: false }, today).used).toBe(5);
  });
});

describe("freeJobLimit", () => {
  it("adds 5 per activated friend, capped at 3", () => {
    expect(freeJobLimit(0)).toBe(10);
    expect(freeJobLimit(2)).toBe(20);
    expect(freeJobLimit(9)).toBe(25);
    expect(freeJobLimit(-1)).toBe(10);
  });
});
