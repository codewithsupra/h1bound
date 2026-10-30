/**
 * OPT unemployment clock. F-1 OPT allows 90 days of unemployment; the STEM OPT extension adds 60,
 * for 150 total across both periods. Pure: shared by the chat tool, the landing calculator and
 * the public /opt-clock page. Not legal advice; the DSO's count is the one that matters.
 */

export type OptType = "opt" | "stem";

export const OPT_ALLOWANCE: Record<OptType, number> = { opt: 90, stem: 150 };

export type OptClock = {
  type: OptType;
  /** Unemployment days already used as of `asOf`. */
  usedDays: number;
  /** "YYYY-MM-DD" the count was taken. */
  asOf: string;
  /** Employed days don't count, so the clock is paused while this is true. */
  employed: boolean;
};

export type OptStatus = { allowance: number; used: number; left: number; deadline: string | null; expired: boolean };

const DAY = 86_400_000;
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export function parseDay(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function optStatus(c: OptClock, today: Date = new Date()): OptStatus {
  const allowance = OPT_ALLOWANCE[c.type];
  const asOf = parseDay(c.asOf);
  const elapsed = !c.employed && asOf ? Math.max(0, Math.round((utcDay(today) - asOf.getTime()) / DAY)) : 0;
  const used = Math.min(allowance, Math.max(0, Math.floor(c.usedDays)) + elapsed);
  const left = allowance - used;
  // While unemployed, the last allowed day is `left` days from today.
  const deadline = c.employed || left === 0 ? null : new Date(utcDay(today) + left * DAY).toISOString().slice(0, 10);
  return { allowance, used, left, deadline, expired: left === 0 };
}

/** One line for Maya and the UI. */
export function optSummary(s: OptStatus, employed: boolean): string {
  if (s.expired) return "OPT unemployment days are used up; talk to your DSO right away.";
  if (employed) return `${s.left} of ${s.allowance} unemployment days left (clock paused while employed).`;
  return `${s.left} of ${s.allowance} unemployment days left, until ${s.deadline}.`;
}
