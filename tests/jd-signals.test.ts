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

describe("UK and EU sponsorship wording", () => {
  it("reads UK and EU refusals", () => {
    expect(jdSponsorship("Applicants must already have the right to work in the UK.")).toBe("no");
    expect(jdSponsorship("We are unable to offer visa sponsorship for this role.")).toBe("no");
    expect(jdSponsorship("A valid EU work permit is required.")).toBe("no");
    expect(jdSponsorship("SC clearance is required for this project.")).toBe("no");
  });
  it("does not treat right-to-work boilerplate that allows sponsorship as a refusal", () => {
    expect(jdSponsorship("You must have the right to work in the UK or be eligible for sponsorship.")).not.toBe("no");
  });
  it("reads UK and EU offers", () => {
    expect(jdSponsorship("We offer visa sponsorship and relocation.")).toBe("yes");
    expect(jdSponsorship("We can sponsor Skilled Worker visas for this role.")).toBe("yes");
    expect(jdSponsorship("Kennismigrant visa support available.")).toBe("yes");
  });
});
