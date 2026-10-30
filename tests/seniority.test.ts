import { describe, expect, it } from "vitest";
import { seniority } from "@/lib/titles";

describe("seniority", () => {
  it("reads UK and US level wording", () => {
    expect(seniority("Software Engineering Placement 2027")).toBe("intern");
    expect(seniority("Graduate Scheme - Technology")).toBe("graduate");
    expect(seniority("Trainee Data Analyst")).toBe("graduate");
    expect(seniority("Junior Backend Developer")).toBe("junior");
    expect(seniority("Software Engineer")).toBe("mid");
    expect(seniority("Senior Software Engineer")).toBe("senior");
  });
});
