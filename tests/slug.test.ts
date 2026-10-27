import { describe, expect, it } from "vitest";
import { assignSlugs, companySlug, withTrustedDisplayNames } from "@/lib/slug";

describe("companySlug", () => {
  it("kebab-cases the pretty company name", () => {
    expect(companySlug("Stripe, Inc.")).toBe("stripe");
    expect(companySlug("PALANTIR TECHNOLOGIES INC.")).toBe("palantir-technologies");
    expect(companySlug("Amazon.com Services LLC")).toBe("amazon-com-services");
    expect(companySlug("AT&T Corp")).toBe("at-and-t");
    expect(companySlug("JPMORGAN CHASE & CO.")).toBe("jpmorgan-chase");
    expect(companySlug("ERNST & YOUNG U.S. LLP")).toBe("ernst-and-young-us");
  });

  it("strips accents, apostrophes and stray punctuation", () => {
    expect(companySlug("Société Générale")).toBe("societe-generale");
    expect(companySlug("McDonald's Corporation")).toBe("mcdonalds");
    expect(companySlug("  --Foo  (USA)  Bar!! ")).toBe("foo-usa-bar");
  });

  it("caps length at a word boundary and never returns empty", () => {
    const s = companySlug("Very Long Employer Name ".repeat(10));
    expect(s.length).toBeLessThanOrEqual(80);
    expect(s.endsWith("-")).toBe(false);
    expect(companySlug("!!!")).toBe("employer");
  });
});

describe("assignSlugs", () => {
  const row = (id: string, name: string, total_filings: number, display_name: string | null = null) => ({ id, name, display_name, total_filings });

  it("prefers the brand display name", () => {
    expect(assignSlugs([row("a", "AMAZON.COM SERVICES LLC", 9000, "Amazon")]).get("a")).toBe("amazon");
  });

  it("gives the bare slug to the bigger filer and numbers the rest", () => {
    const m = assignSlugs([row("small", "Acme Inc", 3), row("big", "ACME LLC", 500), row("mid", "Acme Corp.", 40)]);
    expect(m.get("big")).toBe("acme");
    expect(m.get("mid")).toBe("acme-2");
    expect(m.get("small")).toBe("acme-3");
  });

  it("breaks filing ties by id so reruns are stable", () => {
    const rows = [row("b", "Acme", 10), row("a", "Acme", 10)];
    expect(assignSlugs(rows).get("a")).toBe("acme");
    expect(assignSlugs([...rows].reverse()).get("a")).toBe("acme");
  });

  it("skips slugs already taken in the database", () => {
    const m = assignSlugs([row("new", "Acme", 1000)], ["acme", "acme-2"]);
    expect(m.get("new")).toBe("acme-3");
  });

  it("doesn't collide a numbered slug with a real name ending in a number", () => {
    const m = assignSlugs([row("x", "Acme 2", 100), row("y", "Acme", 50), row("z", "Acme", 10)]);
    expect(new Set(m.values()).size).toBe(3);
    expect(m.get("x")).toBe("acme-2");
    expect(m.get("y")).toBe("acme");
    expect(m.get("z")).toBe("acme-3");
  });
});

describe("withTrustedDisplayNames", () => {
  it("drops display names shared by several employers, case-insensitively", () => {
    const rows = withTrustedDisplayNames([
      { id: "nih", name: "National Institutes of Health, HHS", display_name: "NATIONAL" },
      { id: "amtrak", name: "National Railroad Passenger Corporation", display_name: "national" },
      { id: "stripe", name: "Stripe, Inc.", display_name: "Stripe" },
      { id: "x", name: "X Corp", display_name: null },
    ]);
    expect(rows.map((r) => r.display_name)).toEqual([null, null, "Stripe", null]);
    const slugs = assignSlugs(rows.map((r) => ({ ...r, total_filings: 1 })));
    expect(slugs.get("nih")).toBe("national-institutes-of-health-hhs");
    expect(slugs.get("amtrak")).toBe("national-railroad-passenger");
  });
});
