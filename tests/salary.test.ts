import { describe, expect, it } from "vitest";
import {
  annualise, fromAshbyCompensation, fromGreenhousePay, fromLeverSalary, fromRecruiteeSalary, parseSalaryText, salaryCheck,
} from "@/lib/salary";

describe("parseSalaryText", () => {
  it.each([
    ["Salary: £45,000 per annum plus benefits", { min: 45_000, max: null, currency: "GBP", period: "year" }],
    ["We offer £40,000 - £50,000 depending on experience", { min: 40_000, max: 50_000, currency: "GBP", period: "year" }],
    ["Base salary £38k–£45k", { min: 38_000, max: 45_000, currency: "GBP", period: "year" }],
    ["Salaris: €4.500 - €5.500 bruto per maand", { min: 4_500, max: 5_500, currency: "EUR", period: "month" }],
    ["Salary €3.800,00 per month gross", { min: 3_800, max: null, currency: "EUR", period: "month" }],
    ["Compensation: EUR 55,000 a year", { min: 55_000, max: null, currency: "EUR", period: "year" }],
    ["Pay: £14.50 per hour", { min: 14.5, max: null, currency: "GBP", period: "hour" }],
    ["The range for this role is €60k to €70k.", { min: 60_000, max: 70_000, currency: "EUR", period: "year" }],
    ["Salary Range £72,000 &mdash; £75,500 GBP", { min: 72_000, max: 75_500, currency: "GBP", period: "year" }],
    ["Salary: £60-70K Hybrid", { min: 60_000, max: 70_000, currency: "GBP", period: "year" }],
    ["Salary : £27,051.44 per annum.", { min: 27_051, max: null, currency: "GBP", period: "year" }],
  ])("reads %s", (text, want) => {
    expect(parseSalaryText(text)).toEqual(want);
  });

  it.each([
    "We raised £20m in our Series B.",
    "We've raised €12 million from investors.",
    "£1,000 learning budget every year",
    "Annual bonus of up to £5,000",
    "£2,000 relocation allowance",
    "OTE £60,000 including commission",
    "drive upsells ranging from $20K to $50K+ ACV",
    "Typical sales will be $100k to $500k, with POCs",
    "Turnover of £45,000,000",
    "We have 400 employees and £30 in team lunch vouchers",
    "No salary info here at all.",
    "",
  ])("ignores %s", (text) => {
    expect(parseSalaryText(text)).toBeNull();
  });

  it("skips funding text and still finds the real salary later on", () => {
    expect(parseSalaryText("Backed by £30m funding. Salary: £42,000 per year.")).toEqual({ min: 42_000, max: null, currency: "GBP", period: "year" });
  });

  it("in a commission-heavy posting, only a base salary counts", () => {
    expect(parseSalaryText("Uncapped commission | OTE £7,000-£10,000+/month. Partners are generating around £7,000 per month.")).toBeNull();
    expect(parseSalaryText("OTE £60k. Base salary £35,000 per year plus commission.")).toEqual({ min: 35_000, max: null, currency: "GBP", period: "year" });
  });

  it("needs a pay word, a period or a range before it trusts a lone amount", () => {
    expect(parseSalaryText("Tickets cost £45,000 for the whole team")).toBeNull();
  });
});

describe("structured board fields", () => {
  it("Lever salaryRange", () => {
    expect(fromLeverSalary({ min: 40000, max: 50000, currency: "GBP", interval: "per-year-salary" })).toEqual({ min: 40000, max: 50000, currency: "GBP", period: "year" });
    expect(fromLeverSalary({ min: 20, currency: "GBP", interval: "per-hour-wage" })).toEqual({ min: 20, max: null, currency: "GBP", period: "hour" });
    expect(fromLeverSalary({ min: 1, currency: "GBP", interval: "weird" })).toBeNull();
    expect(fromLeverSalary(undefined)).toBeNull();
  });
  it("Ashby compensation summary (empty when the company hides pay)", () => {
    expect(fromAshbyCompensation({ summaryComponents: [{ compensationType: "Salary", interval: "1 YEAR", currencyCode: "EUR", minValue: 50000, maxValue: 65000 }] }))
      .toEqual({ min: 50000, max: 65000, currency: "EUR", period: "year" });
    expect(fromAshbyCompensation({ summaryComponents: [{ compensationType: "EquityPercentage", interval: "1 YEAR", currencyCode: "EUR", minValue: 1 }] })).toBeNull();
    expect(fromAshbyCompensation({ summaryComponents: [] })).toBeNull();
  });
  it("Recruitee salary (all null when not published)", () => {
    expect(fromRecruiteeSalary({ min: "4000", max: "5000", currency: "EUR", period: "month" })).toEqual({ min: 4000, max: 5000, currency: "EUR", period: "month" });
    expect(fromRecruiteeSalary({ min: null, max: null, currency: null, period: null })).toBeNull();
  });
  it("Greenhouse pay ranges in cents", () => {
    expect(fromGreenhousePay([{ min_cents: 4500000, max_cents: 5500000, currency_type: "GBP" }])).toEqual({ min: 45000, max: 55000, currency: "GBP", period: "year" });
    expect(fromGreenhousePay([])).toBeNull();
  });
  it("drops nonsense: a max below the min, or an implausible yearly amount", () => {
    expect(fromLeverSalary({ min: 50000, max: 100, currency: "GBP", interval: "per-year-salary" })?.max).toBeNull();
    expect(fromLeverSalary({ min: 3, currency: "GBP", interval: "per-year-salary" })).toBeNull();
  });
});

describe("annualise", () => {
  it("converts to a full-time year", () => {
    expect(annualise({ min: 4000, max: 5000, currency: "EUR", period: "month" })).toEqual({ min: 48000, max: 60000 });
    expect(annualise({ min: 20, max: null, currency: "GBP", period: "hour" })).toEqual({ min: 39000, max: 39000 });
  });
});

const gbp = (min: number, max: number | null = null) => ({ min, max, currency: "GBP", period: "year" as const });
const eurM = (min: number, max: number | null = null) => ({ min, max, currency: "EUR", period: "month" as const });

describe("salaryCheck", () => {
  it("UK graduate: the £33,400 new-entrant rate", () => {
    expect(salaryCheck(gbp(35_000), "GB", "graduate").status).toBe("meets");
    expect(salaryCheck(gbp(30_000), "GB", "graduate").status).toBe("below");
    expect(salaryCheck(gbp(35_000), "GB", "graduate").text).toMatch(/£33,400.*going rate/);
  });
  it("UK, not a recent graduate: between the two rates depends on age or graduate status", () => {
    const c = salaryCheck(gbp(36_000), "GB", "sponsored");
    expect(c.status).toBe("depends");
    expect(c.text).toMatch(/£33,400.*not the £41,700/);
    expect(salaryCheck(gbp(42_000), "GB", "sponsored").status).toBe("meets");
  });
  it("a range that straddles the floor depends on the actual offer", () => {
    const c = salaryCheck(gbp(30_000, 40_000), "GB", "graduate");
    expect(c.status).toBe("depends");
    expect(c.text).toMatch(/straddles/);
  });
  it("NL compares monthly gross, and converts a yearly salary", () => {
    expect(salaryCheck(eurM(3_500), "NL", "graduate").status).toBe("meets");
    expect(salaryCheck(eurM(3_000), "NL", "graduate").status).toBe("below");
    expect(salaryCheck({ min: 60_000, max: null, currency: "EUR", period: "year" }, "NL", "sponsored").status).toBe("depends"); // €5,000/mo: under-30 yes, 30+ no
    expect(salaryCheck({ min: 72_000, max: null, currency: "EUR", period: "year" }, "NL", "none").text).toMatch(/€6,000 a month.*holiday/);
  });
  it("Ireland: the €36,605 General Employment Permit minimum", () => {
    expect(salaryCheck({ min: 40_000, max: null, currency: "EUR", period: "year" }, "IE", "none").status).toBe("meets");
    expect(salaryCheck({ min: 34_000, max: null, currency: "EUR", period: "year" }, "IE", "graduate").status).toBe("below");
  });
  it("says 'not stated' instead of guessing, and won't compare currencies", () => {
    expect(salaryCheck(null, "GB", "graduate")).toMatchObject({ status: "unknown", text: expect.stringMatching(/not stated/) });
    expect(salaryCheck({ min: 100_000, max: null, currency: "USD", period: "year" }, "GB", "graduate").status).toBe("unknown");
    expect(salaryCheck(gbp(50_000), null, "graduate").status).toBe("unknown");
  });
  it("always cites a source when a market applies", () => {
    expect(salaryCheck(gbp(50_000), "GB", "graduate").source).toMatch(/^https:\/\/www\.gov\.uk/);
    expect(salaryCheck(null, "IE", null).source).toMatch(/enterprise\.gov\.ie/);
  });
});
