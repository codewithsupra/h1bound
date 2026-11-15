/**
 * How many daily picks someone gets today. Pure and tested. Paid Pro gets the number they chose
 * in Settings (3–15, default 5); the trial is capped at 3; free users get 1 a day while their free
 * allowance lasts, so picks never silently burn the whole quota.
 */

export const PICKS_MIN = 3;
export const PICKS_MAX = 15;
export const PICKS_DEFAULT = 5;
export const TRIAL_PICKS = 3;
const HOURS_BETWEEN = 20;

export const clampPicks = (n: number) => Math.min(PICKS_MAX, Math.max(PICKS_MIN, Math.round(Number.isFinite(n) ? n : PICKS_DEFAULT)));

export function picksToday(s: { pro: boolean; trial?: boolean; perDay?: number; jobsShown: number; jobLimit: number; lastPickAt: number | null; now: number }): number {
  if (s.lastPickAt && s.now - s.lastPickAt < HOURS_BETWEEN * 3_600_000) return 0;
  if (s.pro) return s.trial ? Math.min(TRIAL_PICKS, clampPicks(s.perDay ?? PICKS_DEFAULT)) : clampPicks(s.perDay ?? PICKS_DEFAULT);
  return s.jobsShown < s.jobLimit ? 1 : 0;
}

/** The hour (0–23) it is now in a timezone; falls back to London for unknown zones. */
export function localHour(now: number, timeZone: string): number {
  const fmt = (tz: string) => Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(now));
  try { return fmt(timeZone); } catch { return fmt("Europe/London"); }
}
