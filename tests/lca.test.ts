import { describe, expect, it } from "vitest";
import { addRow, finalize, isCountable, type EmployerAgg } from "@/lib/ingest/lca";

const row = (o: Record<string, unknown>) => ({ CASE_STATUS: "Certified", VISA_CLASS: "H-1B", EMPLOYER_NAME: "GOOGLE LLC", JOB_TITLE: "Software Engineer", WORKSITE_STATE: "CA", WAGE_RATE_OF_PAY_FROM: "150000", WAGE_UNIT_OF_PAY: "Year", DECISION_DATE: new Date("2026-03-01"), ...o });

describe("LCA aggregation", () => {
  it("counts only certified H-1B", () => {
    expect(isCountable(row({}))).toBe(true);
    expect(isCountable(row({ CASE_STATUS: "Certified - Withdrawn" }))).toBe(true);
    expect(isCountable(row({ CASE_STATUS: "Denied" }))).toBe(false);
    expect(isCountable(row({ VISA_CLASS: "E-3 Australian" }))).toBe(false);
  });
  it("aggregates per employer, family, wage and state", () => {
    const aggs = new Map<string, EmployerAgg>();
    addRow(aggs, row({}));
    addRow(aggs, row({ EMPLOYER_NAME: "Google LLC", WAGE_RATE_OF_PAY_FROM: "$170,000.00", DECISION_DATE: new Date("2026-05-01") }));
    addRow(aggs, row({ JOB_TITLE: "Data Scientist", WAGE_RATE_OF_PAY_FROM: "80", WAGE_UNIT_OF_PAY: "Hour", WORKSITE_STATE: "NY" }));
    addRow(aggs, row({ CASE_STATUS: "Denied" }));
    expect(aggs.size).toBe(1);
    const out = finalize(aggs.get("google")!, 2026);
    expect(out.stats.total).toBe(3);
    expect(out.stats.byFamily.software_engineer).toEqual({ count: 2, medianWage: 160000 });
    expect(out.stats.byFamily.data_scientist).toEqual({ count: 1, medianWage: 166400 });
    expect(out.stats.lastFiled).toBe("2026-05-01");
    expect(out.topStates).toEqual(["CA", "NY"]);
    expect(out.name).toBe("GOOGLE LLC");
  });
});
