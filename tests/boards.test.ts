import { describe, expect, it } from "vitest";
import { boardFitsCountry, brandMatches } from "@/lib/ingest/boards";

describe("brandMatches", () => {
  it("accepts a brand that is the start of the legal name", () => {
    expect(brandMatches("Monzo", "Monzo Bank Ltd")).toBe(true);
    expect(brandMatches("Booking.com", "Booking.com B.V.")).toBe(true);
    expect(brandMatches("Stripe", "Stripe Payments UK Ltd")).toBe(true);
  });
  it("rejects names that only share a prefix of a word or are unrelated", () => {
    expect(brandMatches("Wise", "Wiseman Care Ltd")).toBe(false);
    expect(brandMatches("Acme", "Globex Ltd")).toBe(false);
    expect(brandMatches("", "Globex Ltd")).toBe(false);
  });
});

describe("boardFitsCountry", () => {
  it("needs at least one job in the employer's country", () => {
    expect(boardFitsCountry([{ country: "US" }, { country: "GB" }], "GB")).toBe(true);
    expect(boardFitsCountry([{ country: "US" }, { country: null }], "GB")).toBe(false);
  });
});
