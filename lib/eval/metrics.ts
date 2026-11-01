/** Small, dependency-free metrics for the matching evaluations. Pure and tested. */

export type Confusion = { tp: number; fp: number; fn: number; tn: number };

export const emptyConfusion = (): Confusion => ({ tp: 0, fp: 0, fn: 0, tn: 0 });

/** Counts one case. `predicted` and `actual` are "positive?" for the thing being measured. */
export function tally(c: Confusion, predicted: boolean, actual: boolean) {
  if (predicted && actual) c.tp++;
  else if (predicted && !actual) c.fp++;
  else if (!predicted && actual) c.fn++;
  else c.tn++;
}

const ratio = (a: number, b: number) => (b === 0 ? null : a / b);

export function precision(c: Confusion) { return ratio(c.tp, c.tp + c.fp); }
export function recall(c: Confusion) { return ratio(c.tp, c.tp + c.fn); }
export function f1(c: Confusion) {
  const p = precision(c), r = recall(c);
  return p === null || r === null || p + r === 0 ? null : (2 * p * r) / (p + r);
}

/**
 * 95% Wilson score interval for a proportion: honest about small samples (n = 60 cases cannot
 * support "98%" with a straight face).
 */
export function wilson(successes: number, n: number, z = 1.96): [number, number] | null {
  if (n === 0) return null;
  const p = successes / n;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

export const pct = (x: number | null, digits = 0) => (x === null ? "n/a" : `${(x * 100).toFixed(digits)}%`);

export function describe(label: string, num: number, den: number) {
  const ci = wilson(num, den);
  return `${label}: ${num}/${den} = ${pct(den ? num / den : null)}${ci ? ` (95% CI ${pct(ci[0])}–${pct(ci[1])})` : ""}`;
}
