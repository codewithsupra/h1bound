import { describe, expect, it } from "vitest";
import { pickContact } from "@/lib/server/hunter";

const e = (first: string, position: string, confidence = 90) => ({ value: `${first}@x.com`, first_name: first, last_name: "Doe", position, confidence, department: null, seniority: null });

describe("pickContact", () => {
  it("prefers CTO, then VP Eng, then heads/directors, then managers", () => {
    expect(pickContact([e("a", "Engineering Manager"), e("b", "CTO"), e("c", "VP of Engineering")])?.name).toBe("b Doe");
    expect(pickContact([e("a", "Engineering Manager"), e("c", "Director of Engineering")])?.name).toBe("c Doe");
  });
  it("skips low-confidence and unnamed addresses", () => {
    expect(pickContact([e("a", "CTO", 30)])).toBeNull();
    expect(pickContact([{ ...e("a", "CTO"), first_name: null }])).toBeNull();
  });
});

import { headcountMax } from "@/lib/server/hunter";

describe("pickContact for UK/EU roles", () => {
  it("goes to a founder at small companies", () => {
    expect(pickContact([e("a", "Engineering Manager"), e("f", "Co-Founder & CEO")], { small: true })?.name).toBe("f Doe");
    expect(pickContact([e("a", "Engineering Manager"), e("f", "Co-Founder & CEO")], { small: false })?.name).toBe("a Doe");
  });
  it("picks the leader of the role's own team", () => {
    expect(pickContact([e("t", "CTO"), e("c", "Finance Director")], { family: "finance" })?.name).toBe("c Doe");
    expect(pickContact([e("t", "CTO"), e("p", "Head of Product")], { family: "product_manager" })?.name).toBe("p Doe");
  });
  it("falls back to recruiters", () => {
    expect(pickContact([e("r", "Graduate Recruiter")], { family: "finance" })?.name).toBe("r Doe");
  });
});

describe("headcountMax", () => {
  it("reads Hunter headcount ranges", () => {
    expect(headcountMax("11-50")).toBe(50);
    expect(headcountMax("1001-5000")).toBe(5000);
    expect(headcountMax("10001+")).toBe(10001);
    expect(headcountMax(null)).toBeNull();
  });
});
