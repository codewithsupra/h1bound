import { describe, expect, it } from "vitest";
import { isUsLocation, jdSponsorship } from "@/lib/jd-signals";

describe("jdSponsorship", () => {
  it.each([
    ["We are unable to sponsor visas for this role.", "no"],
    ["This position is not eligible for visa sponsorship.", "no"],
    ["Candidates must be authorized to work in the United States without the need for current or future employer sponsorship.", "no"],
    ["Must be a U.S. citizen.", "no"],
    ["Requires an active Secret clearance", "no"],
    ["Visa sponsorship is available for this position.", "yes"],
    ["We sponsor H-1B and are open to sponsoring international candidates.", "yes"],
    ["Great team, free lunch.", null],
  ])("%s → %s", (text, want) => expect(jdSponsorship(text)).toBe(want));
});

describe("isUsLocation", () => {
  it.each([
    ["New York, NY", true],
    ["San Francisco", true],
    ["Remote - US", true],
    ["Austin, TX", true],
    ["Remote", true],
    ["London, UK", false],
    ["Singapore, Singapore", false],
    ["Bengaluru, India", false],
  ])("%s → %s", (loc, want) => expect(isUsLocation(loc)).toBe(want));
});

describe("clearance / export-control phrasing", () => {
  it.each([
    "Candidates must be eligible to obtain a U.S. security clearance.",
    "Ability to obtain and maintain an active security clearance is required",
    "Must be a U.S. person as defined by ITAR export regulations",
  ])("%s → no", (t) => expect(jdSponsorship(t)).toBe("no"));
});

describe("export-control citizenship requirements", () => {
  it("catches SpaceX-style wording", () => {
    expect(jdSponsorship("To conform to U.S. Government export regulations, applicant must be a (i) U.S. citizen or national, (ii) U.S. lawful, permanent resident (aka green card holder)")).toBe("no");
  });
  it("leaves plain EEO statements alone", () => {
    expect(jdSponsorship("We do not discriminate on the basis of citizenship or immigration status.")).toBeNull();
  });
});
