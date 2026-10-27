import { describe, expect, it } from "vitest";
import { addRow, finalize, isCountable, isoDate, type EmployerAgg } from "@/lib/ingest/lca";

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

describe("isoDate", () => {
  it("reads Excel serial dates, as the streaming importer sees them", () => {
    expect(isoDate(45931)).toBe("2025-10-01");
    expect(isoDate(46022)).toBe("2025-12-31");
    expect(isoDate("45931")).toBe("2025-10-01");
  });
  it("reads Date objects and text dates", () => {
    expect(isoDate(new Date("2026-05-01"))).toBe("2026-05-01");
    expect(isoDate("2026-03-15T00:00:00.000Z")).toBe("2026-03-15");
    expect(isoDate("3/5/2026")).toBe("2026-03-05");
  });
  it("rejects junk", () => {
    expect(isoDate(null)).toBeNull();
    expect(isoDate("")).toBeNull();
    expect(isoDate(150000)).toBeNull();
    expect(isoDate("N/A")).toBeNull();
  });
  it("keeps the latest serial date per employer", () => {
    const aggs = new Map<string, EmployerAgg>();
    addRow(aggs, row({ DECISION_DATE: 45931 }));
    addRow(aggs, row({ DECISION_DATE: 46100 }));
    addRow(aggs, row({ DECISION_DATE: 46000 }));
    expect(finalize(aggs.get("google")!, 2026).stats.lastFiled).toBe("2026-03-19");
  });
});
