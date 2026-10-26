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
