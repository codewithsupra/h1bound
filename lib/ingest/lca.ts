/**
 * Aggregates DOL LCA disclosure rows into per-employer sponsor stats. Only certified H-1B cases
 * count ("Certified" and "Certified - Withdrawn" both mean DOL approved the labor condition).
 * Pure: the streaming Excel reader lives in scripts/import-lca.mts.
 */

import { normalizeEmployer } from "../employer";
import { annualWage, median, type SponsorStats } from "../sponsor";
import { titleFamily, type TitleFamily } from "../titles";

export type LcaRow = Record<string, unknown>;

/** Column names as published in the FY2020+ record layout. */
export const COL = {
  status: "CASE_STATUS",
  visa: "VISA_CLASS",
  title: "JOB_TITLE",
  employer: "EMPLOYER_NAME",
  dba: "TRADE_NAME_DBA",
  state: "WORKSITE_STATE",
  wage: "WAGE_RATE_OF_PAY_FROM",
  unit: "WAGE_UNIT_OF_PAY",
  decided: "DECISION_DATE",
} as const;

export type EmployerAgg = {
  key: string;
  name: string; // most common spelling
  dba: string | null;
  total: number;
  families: Map<TitleFamily, number[]>; // wages per family (NaN when unknown, still counted)
  states: Map<string, number>;
  lastFiled: string | null;
  spellings: Map<string, number>;
};

const str = (v: unknown) => (v == null ? "" : v instanceof Date ? v.toISOString() : String(v)).trim();

const EXCEL_EPOCH = Date.UTC(1899, 11, 30); // serial 0 in Excel's 1900 date system

/**
 * DECISION_DATE → "YYYY-MM-DD". The importer streams without styles, so ExcelJS hands dates over
 * as Excel serial numbers (45931 = 2025-10-01); Date objects and text dates are accepted too.
 */
export function isoDate(v: unknown): string | null {
  let d: Date | null = null;
  if (v instanceof Date) d = v;
  else if (typeof v === "number" && v > 20000 && v < 80000) d = new Date(EXCEL_EPOCH + Math.floor(v) * 86_400_000);
  else if (typeof v === "string") {
    const t = v.trim();
    const us = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (us) d = new Date(Date.UTC(+us[3], +us[1] - 1, +us[2]));
    else if (/^\d{4}-\d{2}-\d{2}/.test(t)) d = new Date(`${t.slice(0, 10)}T00:00:00Z`);
    else if (/^\d+(\.\d+)?$/.test(t)) return isoDate(Number(t));
  }
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

export function isCountable(row: LcaRow): boolean {
  const status = str(row[COL.status]).toLowerCase();
  const visa = str(row[COL.visa]).toUpperCase();
  return status.startsWith("certified") && visa === "H-1B";
}

export function addRow(aggs: Map<string, EmployerAgg>, row: LcaRow): void {
  if (!isCountable(row)) return;
  const name = str(row[COL.employer]);
  const key = normalizeEmployer(name);
  if (!key) return;
  let a = aggs.get(key);
  if (!a) {
    a = { key, name, dba: null, total: 0, families: new Map(), states: new Map(), lastFiled: null, spellings: new Map() };
    aggs.set(key, a);
  }
  a.total++;
  a.spellings.set(name, (a.spellings.get(name) ?? 0) + 1);
  const dba = str(row[COL.dba]);
  if (dba && !a.dba) a.dba = dba;
  const fam = titleFamily(str(row[COL.title]));
  const wage = annualWage(Number(str(row[COL.wage]).replace(/[$,]/g, "")), str(row[COL.unit]));
  const list = a.families.get(fam) ?? [];
  list.push(wage ?? Number.NaN);
  a.families.set(fam, list);
  const st = str(row[COL.state]).toUpperCase();
  if (st) a.states.set(st, (a.states.get(st) ?? 0) + 1);
  const d = isoDate(row[COL.decided]);
  if (d && (!a.lastFiled || d > a.lastFiled)) a.lastFiled = d;
}

export type EmployerOut = {
  key: string;
  name: string;
  dba: string | null;
  topStates: string[];
  stats: SponsorStats;
};

export function finalize(a: EmployerAgg, fiscalYear: number): EmployerOut {
  const name = [...a.spellings.entries()].sort((x, y) => y[1] - x[1])[0][0];
  const byFamily: SponsorStats["byFamily"] = {};
  for (const [fam, wages] of a.families) {
    byFamily[fam] = { count: wages.length, medianWage: median(wages.filter((w) => Number.isFinite(w))) };
  }
  const topStates = [...a.states.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([s]) => s);
  return { key: a.key, name, dba: a.dba, topStates, stats: { fiscalYear, total: a.total, byFamily, lastFiled: a.lastFiled } };
}
