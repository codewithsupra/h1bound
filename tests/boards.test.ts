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

import { isConfirmed, linkMatch, pickBoardEntry, rivalsOf } from "@/lib/ingest/boards";

describe("linkMatch", () => {
  it("is exact when the brand is the entry's name", () => {
    expect(linkMatch("Allego", "Allego B.V.", ["Allego Holding B.V."])).toBe("exact");
    expect(linkMatch("Monzo Bank", "Monzo Bank Ltd", [])).toBe("exact");
  });
  it("is unique when the brand only prefixes one entry", () => {
    expect(linkMatch("Monzo", "Monzo Bank Ltd", [])).toBe("unique");
  });
  it("is ambiguous when other entries share the brand", () => {
    expect(linkMatch("Howden", "Howden Thomassen Compressors B.V.", ["Howden Netherlands B.V."])).toBe("ambiguous");
    expect(isConfirmed("ambiguous")).toBe(false);
    expect(isConfirmed("unique")).toBe(true);
  });
  it("rejects names that are not the brand at all", () => {
    expect(linkMatch("Wise", "Wiseman Care Ltd", [])).toBeNull();
  });
});

describe("rivalsOf and pickBoardEntry", () => {
  const entries = [
    { id: "a", key: "ace incubator", name: "ACE Incubator B.V." },
    { id: "b", key: "ace", name: "ACE B.V." },
    { id: "c", key: "ace and tate", name: "Ace and Tate Holding B.V." },
    { id: "d", key: "acer", name: "Acer Nederland B.V." },
  ];
  it("finds entries that share the brand but not look-alike words", () => {
    expect(rivalsOf("ACE", entries[0], entries).map((e) => e.id)).toEqual(["b", "c"]);
  });
  it("prefers the exact entry, then the closest name, then a stable id", () => {
    expect(pickBoardEntry("ACE", entries.filter((e) => e.id !== "d"))!.id).toBe("b");
    const candidates = entries.filter((e) => e.id !== "d");
    expect(pickBoardEntry("ACE", candidates.filter((e) => e.id !== "b"))!.id).toBe("a");
  });
});
