import { licenceKey } from "./registers";
import type { NormalizedJob } from "./ats";

/**
 * Checks for a job board found by guessing slugs for a register entry. Pure and tested; the
 * probing lives in scripts/resolve-licence-boards.mts.
 */

/** Does a board's company name refer to this register entry? "Monzo" ~ "Monzo Bank Ltd", "Wise" ≁ "Wiseman Care Ltd". */
export function brandMatches(boardName: string, legalName: string): boolean {
  const a = licenceKey(boardName);
  const b = licenceKey(legalName);
  if (!a || !b) return false;
  return a === b || b.startsWith(`${a} `) || a.startsWith(`${b} `);
}

/**
 * A board is only useful (and only trusted) if it lists jobs where this employer is registered.
 * Slug guesses like "headway" often hit a different company in another country; requiring
 * in-country jobs filters those out.
 */
export function boardFitsCountry(jobs: Pick<NormalizedJob, "country">[], country: string): boolean {
  return jobs.some((j) => j.country === country);
}

/** UK routes that signal an employer big or international enough to have a public careers board. */
export const UK_PRIORITY_ROUTES = ["Scale-up", "Global Business Mobility: Graduate Trainee", "Global Business Mobility: Senior or Specialist Worker"];
