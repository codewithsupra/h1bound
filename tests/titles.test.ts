import { describe, expect, it } from "vitest";
import { isEntryTitle, isSeniorTitle, titleFamily } from "@/lib/titles";

describe("titleFamily", () => {
  it.each([
    ["Software Engineer II", "software_engineer"],
    ["SDE I", "software_engineer"],
    ["Backend Developer", "software_engineer"],
    ["Machine Learning Engineer", "ml_engineer"],
    ["Data Scientist", "data_scientist"],
    ["Senior Data Engineer", "data_engineer"],
    ["Business Intelligence Analyst", "data_analyst"],
    ["Site Reliability Engineer", "devops"],
    ["iOS Engineer", "mobile"],
    ["Frontend Engineer", "frontend"],
    ["Product Manager", "product_manager"],
    ["UX Designer", "designer"],
    ["ASIC Design Verification Engineer", "hardware"],
    ["Staff Accountant", "finance"],
    ["Registered Nurse", "healthcare"],
    ["Chef", "other"],
  ])("%s → %s", (title, fam) => expect(titleFamily(title)).toBe(fam));
});

describe("seniority", () => {
  it("detects senior and entry titles", () => {
    expect(isSeniorTitle("Senior Software Engineer")).toBe(true);
    expect(isSeniorTitle("Software Engineer")).toBe(false);
    expect(isEntryTitle("Software Engineer, New Grad")).toBe(true);
    expect(isEntryTitle("Senior Associate")).toBe(false);
  });
});
