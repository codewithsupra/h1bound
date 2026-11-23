import { describe, expect, it } from "vitest";
import { COMPARISONS, comparison, ourPrice } from "@/lib/compare";

describe("comparison pages", () => {
  it.each(COMPARISONS.map((c) => [c.slug, c] as const))("%s: every claim about them has a public source and a check date", (_, c) => {
    expect(c.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(c.sources.length).toBeGreaterThan(0);
    for (const r of c.rows) {
      expect(r.them, r.topic).not.toBe("");
      expect(r.source, r.topic).toMatch(/^https:\/\//);
    }
  });
  it("never promises sponsorship, on either side", () => {
    const text = JSON.stringify(COMPARISONS);
    expect(text).not.toMatch(/will sponsor|guarantee/i);
  });
  it("our price follows whether paid plans are live", () => {
    expect(ourPrice(false)).toMatch(/open soon/);
    expect(ourPrice(true)).toMatch(/€10 a month/);
    expect(ourPrice(true)).not.toMatch(/open soon/);
  });
  it("unknown slugs are not found", () => {
    expect(comparison("nope")).toBeNull();
  });
});
