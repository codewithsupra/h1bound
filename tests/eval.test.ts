import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runSponsorRecordEval, type SponsorRecordCases } from "@/lib/eval/sponsor-record";
import { runVacancyEval, type VacancyCases } from "@/lib/eval/vacancy";
import { tally, emptyConfusion, precision, recall, wilson, f1 } from "@/lib/eval/metrics";

const read = <T,>(f: string) => JSON.parse(readFileSync(new URL(`./eval/${f}`, import.meta.url), "utf8")) as T;
const sponsor = read<SponsorRecordCases>("sponsor-record.cases.json");
const tuned = read<VacancyCases>("vacancy-sponsorship.cases.json");
const holdout = read<VacancyCases>("vacancy-sponsorship.holdout.json");

/**
 * Regression floors: the measured level at the time of writing (see docs/EVAL.md). A change to the
 * matchers that makes these worse fails here; one that improves them should raise the floors.
 * The labeled sets are frozen; changing them is a deliberate act, so update the floors with them.
 */
describe("sponsor-record matching", () => {
  it("board links: no worse than today on the random sample and the collision stress set", async () => {
    const { brand } = await runSponsorRecordEval(sponsor);
    expect(brand.bySet.random.confusion.fp).toBeLessThanOrEqual(1); // Howden
    expect(brand.bySet.random.confusion.fn).toBe(0);
    expect(brand.bySet.stress.confusion.fp).toBeLessThanOrEqual(26);
    expect(brand.bySet.stress.confusion.fn).toBe(0);
  });
  it("name links: never links to the wrong entry, and misses no more than today", async () => {
    const { name } = await runSponsorRecordEval(sponsor);
    expect(name.confusion.fp).toBe(0);
    expect(name.wrongEntry).toBe(0);
    expect(name.confusion.fn).toBeLessThanOrEqual(10);
  });
});

describe("vacancy sponsorship", () => {
  it("held-out set: never gives a wrong answer, and finds at least what it finds today", () => {
    const r = runVacancyEval(holdout);
    expect(r.perClass.yes.confusion.fp).toBe(0);
    expect(r.perClass.no.confusion.fp).toBe(0);
    expect(r.perClass.yes.confusion.tp).toBeGreaterThanOrEqual(8);
    expect(r.perClass.no.confusion.tp).toBeGreaterThanOrEqual(13);
  });
  it("tuned set: every case stays correct (these are the bugs that were fixed)", () => {
    const r = runVacancyEval(tuned);
    expect(r.failures).toEqual([]);
  });
});

describe("labeled sets are well formed", () => {
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
  it("have unique ids and a stated reason for every label", () => {
    for (const list of [sponsor.brand, sponsor.name, tuned.cases, holdout.cases]) expect(new Set(ids(list)).size).toBe(list.length);
    for (const c of sponsor.brand) expect(c.evidence.length).toBeGreaterThan(10);
    for (const c of sponsor.name) expect(c.evidence.length).toBeGreaterThan(10);
    for (const c of [...tuned.cases, ...holdout.cases]) expect(["yes", "no", "none", "unclear"]).toContain(c.label);
  });
  it("keep the held-out set separate from the tuned set", () => {
    const flat = (t: string) => t.toLowerCase().replace(/\W+/g, " ").trim();
    const tunedText = tuned.cases.map((c) => flat(c.text));
    for (const c of holdout.cases) expect(tunedText).not.toContain(flat(c.text));
  });
  it("name candidates always include the expected register entry", () => {
    for (const c of sponsor.name) if (c.expect) expect(c.candidates).toContain(c.expect);
  });
});

describe("metrics", () => {
  it("computes precision, recall and f1 from a confusion matrix", () => {
    const c = emptyConfusion();
    for (const [p, a] of [[true, true], [true, true], [true, false], [false, true], [false, false]] as const) tally(c, p, a);
    expect(precision(c)).toBeCloseTo(2 / 3);
    expect(recall(c)).toBeCloseTo(2 / 3);
    expect(f1(c)).toBeCloseTo(2 / 3);
    expect(precision(emptyConfusion())).toBeNull();
  });
  it("gives a wide interval for small samples", () => {
    const [lo, hi] = wilson(10, 10)!;
    expect(lo).toBeGreaterThan(0.7);
    expect(lo).toBeLessThan(0.75);
    expect(hi).toBe(1);
    expect(wilson(0, 0)).toBeNull();
  });
});
