import { jdSponsorship } from "@/lib/jd-signals";
import { emptyConfusion, precision, recall, tally, type Confusion } from "./metrics";
import type { Failure } from "./sponsor-record";

/**
 * Evaluation 2: VACANCY sponsorship. "Does this posting itself say it offers (yes) or rules out
 * (no) visa sponsorship?" It is independent of the sponsor register: an employer on the register
 * can still post a role that says "no sponsorship", and the reverse.
 */

export type VacancyLabel = "yes" | "no" | "none" | "unclear";

export type VacancyCase = {
  id: string;
  country: string | null;
  company: string;
  /** A short excerpt around the visa-related sentence (a quote, not the posting). */
  text: string;
  label: VacancyLabel;
  confidence: "high" | "medium";
  note?: string;
};

export type VacancyCases = { version: number; labeler: string; drawnAt: string; cases: VacancyCase[] };

type Class = "yes" | "no";
export type VacancyResult = {
  perClass: Record<Class, { confusion: Confusion; precision: number | null; recall: number | null }>;
  /** Of all postings that state a position (yes or no), how many get the right answer. */
  accuracyWhenStated: { correct: number; total: number };
  excludedUnclear: number;
  failures: Failure[];
};

export function runVacancyEval(file: VacancyCases): VacancyResult {
  const perClass = { yes: emptyConfusion(), no: emptyConfusion() };
  const failures: Failure[] = [];
  let excludedUnclear = 0, correct = 0, total = 0;
  for (const c of file.cases) {
    if (c.label === "unclear") { excludedUnclear++; continue; }
    const got = jdSponsorship(c.text) ?? "none";
    for (const k of ["yes", "no"] as const) tally(perClass[k], got === k, c.label === k);
    if (c.label !== "none") { total++; if (got === c.label) correct++; }
    if (got !== c.label) {
      failures.push({
        id: c.id,
        kind: got === "none" ? "false_negative" : c.label === "none" ? "false_positive" : "wrong_entry",
        summary: `${c.company} (${c.country ?? "remote"}): labeled "${c.label}", matcher said "${got}"`,
        evidence: c.text.length > 200 ? `${c.text.slice(0, 200)}…` : c.text,
      });
    }
  }
  const out = {} as VacancyResult["perClass"];
  for (const k of ["yes", "no"] as const) out[k] = { confusion: perClass[k], precision: precision(perClass[k]), recall: recall(perClass[k]) };
  return { perClass: out, accuracyWhenStated: { correct, total }, excludedUnclear, failures };
}
