import { describe, expect, it } from "vitest";
import { findLinkedIn, normalizeLinkedIn } from "@/lib/linkedin";

describe("normalizeLinkedIn", () => {
  it.each([
    ["https://www.linkedin.com/in/asha-rao/", "https://www.linkedin.com/in/asha-rao"],
    ["linkedin.com/in/asha-rao", "https://www.linkedin.com/in/asha-rao"],
    ["http://uk.linkedin.com/in/asha_rao-123?trk=public_profile", "https://www.linkedin.com/in/asha_rao-123"],
    ["https://in.linkedin.com/in/asha#about", "https://www.linkedin.com/in/asha"],
  ])("%s", (input, want) => expect(normalizeLinkedIn(input)).toBe(want));

  it.each([
    "https://www.linkedin.com/company/monzo", "https://linkedin.com/feed/", "https://evil.com/linkedin.com/in/asha",
    "https://linkedin.com.evil.com/in/asha", "javascript:alert(1)//linkedin.com/in/x", "linkedin.com/in/", "", null,
  ])("rejects %s", (input) => expect(normalizeLinkedIn(input)).toBeNull());
});

describe("findLinkedIn", () => {
  it("finds a profile link inside a message", () => {
    expect(findLinkedIn("hey here's my profile: linkedin.com/in/asha-rao, thanks!")).toBe("https://www.linkedin.com/in/asha-rao");
    expect(findLinkedIn("no link here")).toBeNull();
  });
});
