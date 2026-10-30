import { describe, expect, it } from "vitest";
import { jobVisaFit, licenceLine, workRight, workRights } from "@/lib/visa";

const indian = { citizenship: "IN", visaCountry: null, visaSituation: null };

describe("workRight", () => {
  it("non-EU citizens need a sponsor everywhere by default", () => {
    expect(workRights(indian)).toEqual({ GB: "sponsor", NL: "sponsor", IE: "sponsor" });
  });
  it("students and graduates can work in their study country on a post-study route", () => {
    expect(workRights({ citizenship: "IN", visaCountry: "GB", visaSituation: "graduate" })).toEqual({ GB: "post_study", NL: "sponsor", IE: "sponsor" });
    expect(workRight("IE", { citizenship: "NG", visaCountry: "IE", visaSituation: "student" })).toBe("post_study");
    expect(workRight("GB", { citizenship: "IN", visaCountry: "GB", visaSituation: "sponsored" })).toBe("sponsor");
  });
  it("EU citizens are free in NL and IE but need sponsorship in the UK", () => {
    expect(workRights({ citizenship: "de", visaCountry: null, visaSituation: null })).toEqual({ GB: "sponsor", NL: "free", IE: "free" });
  });
  it("UK and Irish citizens are free in each other's country", () => {
    expect(workRights({ citizenship: "IE", visaCountry: null, visaSituation: null })).toEqual({ GB: "free", NL: "free", IE: "free" });
    expect(workRights({ citizenship: "GB", visaCountry: null, visaSituation: null })).toEqual({ GB: "free", NL: "sponsor", IE: "free" });
  });
});

describe("jobVisaFit", () => {
  const ukA = { country: "GB" as const, rating: "A", routes: ["Skilled Worker"], permits: {} };
  const ukB = { ...ukA, rating: "B" };
  const ie = { country: "IE" as const, rating: null, routes: [], permits: { "2025": 12 } };

  it("anyone free to work is fine anywhere", () => {
    expect(jobVisaFit("GB", "free", null, "no")).toBe("ok");
  });
  it("UK jobs need an A-rated licence for sponsor-needing candidates", () => {
    expect(jobVisaFit("GB", "sponsor", ukA, null)).toBe("ok_licensed");
    expect(jobVisaFit("GB", "sponsor", ukB, null)).toBe("blocked");
    expect(jobVisaFit("GB", "sponsor", null, null)).toBe("blocked");
  });
  it("the posting's own 'no sponsorship' wins over the register", () => {
    expect(jobVisaFit("GB", "sponsor", ukA, "no")).toBe("blocked");
  });
  it("Ireland has no licences: no permit history is risky, not blocked", () => {
    expect(jobVisaFit("IE", "sponsor", ie, null)).toBe("ok_licensed");
    expect(jobVisaFit("IE", "sponsor", null, null)).toBe("risky");
  });
  it("post-study candidates can start anywhere, licensed employers preferred", () => {
    expect(jobVisaFit("GB", "post_study", null, null)).toBe("ok");
    expect(jobVisaFit("GB", "post_study", ukA, null)).toBe("ok_licensed");
    expect(jobVisaFit("GB", "post_study", null, "no")).toBe("risky");
  });
});

describe("licenceLine", () => {
  it("cites the register without promising sponsorship", () => {
    expect(licenceLine({ country: "GB", rating: "A", routes: ["Skilled Worker"], permits: {} })).toBe("On the UK Home Office sponsor register (A-rated, Skilled Worker licence)");
    expect(licenceLine({ country: "IE", rating: null, routes: [], permits: { "2025": 368, "2026": 254 } })).toBe("Irish employment permits issued: 254 in 2026, 368 in 2025");
    expect(licenceLine({ country: "NL", rating: null, routes: [], permits: {} })).not.toMatch(/will sponsor/);
  });
});

import { licenceFlap } from "@/lib/visa";
describe("licenceFlap", () => {
  it("fits the board in 8 characters", () => {
    expect(licenceFlap({ country: "GB", rating: "A", permits: {} })).toEqual({ text: "A-RATED", tone: "green" });
    expect(licenceFlap({ country: "NL", rating: null, permits: {} }).text).toBe("LISTED");
    expect(licenceFlap({ country: "IE", rating: null, permits: { "2025": 368, "2026": 254 } }).text).toBe("622 PMT");
    for (const t of [licenceFlap({ country: "GB", rating: "Provisional", permits: {} }).text, licenceFlap({ country: "IE", rating: null, permits: { "2025": 9999 } }).text]) expect(t.length).toBeLessThanOrEqual(8);
  });
});
