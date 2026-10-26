import { describe, expect, it } from "vitest";
import { annualWage, median, sponsorBadge, sponsorLevel, type SponsorStats } from "@/lib/sponsor";

const big: SponsorStats = { fiscalYear: 2026, total: 1200, byFamily: { software_engineer: { count: 400, medianWage: 165000 } }, lastFiled: "2026-06-01" };
const small: SponsorStats = { fiscalYear: 2026, total: 3, byFamily: { software_engineer: { count: 1, medianWage: 120000 } }, lastFiled: null };
const zero: SponsorStats = { fiscalYear: 2026, total: 0, byFamily: {}, lastFiled: null };

describe("sponsorLevel", () => {
  it("grades by filings", () => {
    expect(sponsorLevel(big, "software_engineer")).toBe("strong");
    expect(sponsorLevel(small, "software_engineer")).toBe("some");
    expect(sponsorLevel(small, "designer")).toBe("rare");
    expect(sponsorLevel(zero, "designer")).toBe("none");
    expect(sponsorLevel(null, "designer")).toBe("unknown");
  });
});

describe("sponsorBadge", () => {
  it("cites counts, wage and source, never claims a guaranteed visa", () => {
    const b = sponsorBadge(big, "software_engineer");
    expect(b.detail).toContain("1,200 H-1B filings in FY2026");
    expect(b.detail).toContain("400 for similar roles, median $165k");
    expect(b.detail).toContain("Dept. of Labor");
    for (const s of [big, small, zero, null]) {
      const x = sponsorBadge(s, "software_engineer");
      expect(`${x.label} ${x.detail}`).not.toMatch(/guarantee|✅|will sponsor/i);
    }
  });
});

describe("annualWage / median", () => {
  it("annualizes units and rejects junk", () => {
    expect(annualWage(60, "Hour")).toBe(124800);
    expect(annualWage(150000, "Year")).toBe(150000);
    expect(annualWage(10000, "Month")).toBe(120000);
    expect(annualWage(5, "Year")).toBeNull();
    expect(annualWage(100, "Fortnight?")).toBeNull();
  });
  it("computes medians", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(3);
    expect(median([])).toBeNull();
  });
});
