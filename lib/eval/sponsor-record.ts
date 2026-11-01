import { brandMatches, isConfirmed, linkMatch, type LinkMatch } from "@/lib/ingest/boards";
import { licenceFor, loadLicenceIndex, type LicenceIndex } from "@/lib/ingest/refresh";
import { licenceKey } from "@/lib/ingest/registers";
import type { NormalizedJob } from "@/lib/ingest/ats";
import { emptyConfusion, precision, recall, tally, type Confusion } from "./metrics";

/**
 * Evaluation 1: SPONSOR-RECORD matching. "Is this employer the same organisation as that entry on
 * the official register?" It says nothing about whether any vacancy offers sponsorship (see
 * vacancy.ts). Two decisions in the pipeline are measured separately:
 *   brand: a job board's company name is attached to a register entry (lib/ingest/boards.ts brandMatches)
 *   name:  a job's employer name is linked to a register entry by key (lib/ingest/refresh.ts licenceFor)
 */

export type Label = "same" | "different" | "unsure";

export type BrandCase = {
  id: string;
  /** random: drawn at random from linked employers (an unbiased sample). stress: deliberately enriched with brand collisions, so its precision is NOT a population estimate. */
  set: "random" | "stress";
  country: "GB" | "NL" | "IE";
  boardName: string;
  registerName: string;
  /** Other register entries in the same country that share the board's brand (computed from the register when drawn). */
  rivals?: string[];
  label: Label;
  confidence: "high" | "medium";
  /** What the labeler looked at. */
  evidence: string;
};

export type NameCase = {
  id: string;
  /** Where the employer was drawn from: linked = already linked in production, unlinked = active jobs with no register link. */
  stratum: "linked" | "unlinked";
  country: "GB" | "NL" | "IE";
  company: string;
  /** Register entries in the country that share the employer's first word, as drawn from the register. */
  candidates: string[];
  /** The register entry that is this employer, or null when it is not on the register. */
  expect: string | null;
  unsure?: boolean;
  confidence: "high" | "medium";
  evidence: string;
};

export type SponsorRecordCases = {
  version: number;
  labeler: string;
  drawnAt: string;
  population: { linkedEmployers: number; unlinkedEmployers: number; linkedJobs: number; unlinkedJobs: number };
  brand: BrandCase[];
  name: NameCase[];
};

export type Failure = { id: string; kind: "false_positive" | "false_negative" | "wrong_entry"; summary: string; evidence: string };

type Scored = { confusion: Confusion; precision: number | null; recall: number | null };
export type SponsorRecordResult = {
  brand: Scored & {
    bySet: Record<"random" | "stress", Scored>;
    /**
     * The claim that matters: "this employer is confirmed on the register". Positive = the link is
     * exact or unique (no look-alike entries); correct = it is the same organisation. Ambiguous links
     * are kept but not claimed, so they count as not-claimed here.
     */
    confirmed: Scored & { bySet: Record<"random" | "stress", Scored>; failures: Failure[]; ambiguous: { same: number; different: number } };
    excludedUnsure: number;
    failures: Failure[];
  };
  name: { confusion: Confusion; precision: number | null; recall: number | null; excludedUnsure: number; failures: Failure[]; wrongEntry: number };
};

export function evalBrand(cases: BrandCase[]): SponsorRecordResult["brand"] {
  const confusion = emptyConfusion();
  const sets = { random: emptyConfusion(), stress: emptyConfusion() };
  const conf = emptyConfusion();
  const confSets = { random: emptyConfusion(), stress: emptyConfusion() };
  const failures: Failure[] = [];
  const confFailures: Failure[] = [];
  const ambiguous = { same: 0, different: 0 };
  let excludedUnsure = 0;
  for (const c of cases) {
    if (c.label === "unsure") { excludedUnsure++; continue; }
    const accepted = brandMatches(c.boardName, c.registerName);
    for (const t of [confusion, sets[c.set]]) tally(t, accepted, c.label === "same");
    if (accepted && c.label === "different") failures.push({ id: c.id, kind: "false_positive", summary: `board "${c.boardName}" accepted as "${c.registerName}" (${c.country})`, evidence: c.evidence });
    if (!accepted && c.label === "same") failures.push({ id: c.id, kind: "false_negative", summary: `board "${c.boardName}" rejected for "${c.registerName}" (${c.country})`, evidence: c.evidence });

    const m: LinkMatch | null = linkMatch(c.boardName, c.registerName, c.rivals ?? []);
    const claimed = isConfirmed(m);
    for (const t of [conf, confSets[c.set]]) tally(t, claimed, c.label === "same");
    if (m === "ambiguous") ambiguous[c.label === "same" ? "same" : "different"]++;
    if (claimed && c.label === "different") confFailures.push({ id: c.id, kind: "false_positive", summary: `"${c.boardName}" confirmed as "${c.registerName}" (${c.country}, ${m})`, evidence: c.evidence });
  }
  const scored = (c: Confusion): Scored => ({ confusion: c, precision: precision(c), recall: recall(c) });
  return {
    ...scored(confusion), bySet: { random: scored(sets.random), stress: scored(sets.stress) },
    confirmed: { ...scored(conf), bySet: { random: scored(confSets.random), stress: scored(confSets.stress) }, failures: confFailures, ambiguous },
    excludedUnsure, failures,
  };
}

/** Runs the production linker (licenceFor) against a register index built from the case's candidates. */
export async function predictByName(c: Pick<NameCase, "company" | "country" | "candidates">): Promise<string | null> {
  const byKey = new Map<string, string>();
  for (const name of c.candidates) byKey.set(`${c.country}:${licenceKey(name)}`, name);
  const idx: LicenceIndex = new Map([...byKey.keys()].map((k) => [k, k]));
  const job = { company: c.company, country: c.country } as NormalizedJob;
  const hit = licenceFor(job, [], idx, null);
  return hit ? byKey.get(hit) ?? null : null;
}

export async function evalName(cases: NameCase[], predict: typeof predictByName = predictByName): Promise<SponsorRecordResult["name"]> {
  const confusion = emptyConfusion();
  const failures: Failure[] = [];
  let excludedUnsure = 0, wrongEntry = 0;
  for (const c of cases) {
    if (c.unsure) { excludedUnsure++; continue; }
    const got = await predict(c);
    const actual = c.expect !== null;
    if (got === null) {
      tally(confusion, false, actual);
      if (actual) failures.push({ id: c.id, kind: "false_negative", summary: `"${c.company}" (${c.country}) not linked; register has "${c.expect}"`, evidence: c.evidence });
    } else if (got === c.expect) {
      tally(confusion, true, true);
    } else {
      // Linked to something other than the right entry: costs precision (a wrong claim) and recall (the right one was missed).
      confusion.fp++;
      if (actual) { confusion.fn++; wrongEntry++; }
      failures.push({ id: c.id, kind: actual ? "wrong_entry" : "false_positive", summary: `"${c.company}" (${c.country}) linked to "${got}"${actual ? `, expected "${c.expect}"` : ", which is not on the register"}`, evidence: c.evidence });
    }
  }
  return { confusion, precision: precision(confusion), recall: recall(confusion), excludedUnsure, failures, wrongEntry };
}

export async function runSponsorRecordEval(cases: SponsorRecordCases): Promise<SponsorRecordResult> {
  return { brand: evalBrand(cases.brand), name: await evalName(cases.name) };
}

export { loadLicenceIndex };
