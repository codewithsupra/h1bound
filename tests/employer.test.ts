import { describe, expect, it } from "vitest";
import { buildEmployerIndex, matchEmployer, normalizeEmployer } from "@/lib/employer";

describe("normalizeEmployer", () => {
  it("strips legal suffixes and punctuation", () => {
    expect(normalizeEmployer("GOOGLE LLC")).toBe("google");
    expect(normalizeEmployer("Amazon.com Services, LLC")).toBe("amazon services");
    expect(normalizeEmployer("The Goldman Sachs Group, Inc.")).toBe("goldman sachs");
    expect(normalizeEmployer("AT&T Corp")).toBe("at and t");
  });
});

describe("matchEmployer", () => {
  const idx = buildEmployerIndex([
    { id: "g", name: "GOOGLE LLC" },
    { id: "a", name: "Amazon.com Services LLC" },
    { id: "m", name: "META PLATFORMS, INC." },
    { id: "s", name: "Stripe, Inc." },
    { id: "d", name: "Databricks Inc" },
  ]);
  it("matches brand names to legal names", () => {
    expect(matchEmployer("Google", idx)).toBe("g");
    expect(matchEmployer("Amazon", idx)).toBe("a");
    expect(matchEmployer("Stripe", idx)).toBe("s");
    expect(matchEmployer("databricks", idx)).toBe("d");
  });
  it("matches near-misses by token overlap", () => {
    expect(matchEmployer("Meta Platforms", idx)).toBe("m");
  });
  it("returns null for unrelated names", () => {
    expect(matchEmployer("Tiny Startup Co", idx)).toBeNull();
    expect(matchEmployer("", idx)).toBeNull();
  });
});

import { prettyCompany } from "@/lib/employer";
describe("prettyCompany", () => {
  it("title-cases all-caps legal names and drops suffixes", () => {
    expect(prettyCompany("PALANTIR TECHNOLOGIES INC.")).toBe("Palantir Technologies");
    expect(prettyCompany("Stripe, Inc.")).toBe("Stripe");
    expect(prettyCompany("SCALE AI, INC.")).toBe("Scale AI");
    expect(prettyCompany("Databricks")).toBe("Databricks");
  });
});

import { companyLabel } from "@/lib/employer";
describe("companyLabel", () => {
  it("prefers brand names but not truncated ones", () => {
    expect(companyLabel("Stripe", "Stripe, LLC")).toBe("Stripe");
    expect(companyLabel("Handshake", "Stryder Corporation")).toBe("Handshake");
    expect(companyLabel("charles", "Charles Schwab and Company, Inc.")).toBe("Charles Schwab and Company");
    expect(companyLabel("Insight", "INSIGHT GLOBAL, LLC")).toBe("Insight Global");
    expect(companyLabel(null, "PALANTIR TECHNOLOGIES INC.")).toBe("Palantir Technologies");
  });
});
