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
