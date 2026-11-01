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
 * How sure we are that a board's brand IS this register entry.
 * - exact: the brand and the entry's name are the same once legal and regional words are removed.
 * - unique: the brand is the start of the entry's name and no other entry in the country shares it.
 * - ambiguous: other entries share the brand ("Quality B.V." vs five "Quality ..." companies, a
 *   brand that is one word of several). Either they are sister entities of one group (NTS, Stripe) or
 *   unrelated companies (Howden insurance vs Howden compressors), and the name alone cannot say which.
 *   The link is kept, but never presented as a confirmed sponsor.
 */
export type LinkMatch = "exact" | "unique" | "ambiguous";

export const isConfirmed = (m: LinkMatch | null | undefined) => m === "exact" || m === "unique";

/** `rivalNames` are the other register entries in the same country that share the brand (exact or prefix). */
export function linkMatch(boardName: string, entryName: string, rivalNames: string[]): LinkMatch | null {
  if (!brandMatches(boardName, entryName)) return null;
  const brand = licenceKey(boardName);
  if (licenceKey(entryName) === brand) return "exact";
  // An exact entry exists elsewhere: this longer name is not the one the brand points at.
  return rivalNames.length ? "ambiguous" : "unique";
}

/** Rivals of `entry` for a brand: register entries (same country) whose key is the brand or starts with it. */
export function rivalsOf<E extends { id: string; key: string }>(brandName: string, entry: { id: string }, sameCountry: E[]): E[] {
  const brand = licenceKey(brandName);
  if (!brand) return [];
  return sameCountry.filter((o) => o.id !== entry.id && (o.key === brand || o.key.startsWith(`${brand} `)));
}

/**
 * One board can have been attached to several register entries. Pick the single best: the exact
 * one, else the closest name (fewest extra words), else the lowest id so the choice is stable.
 */
export function pickBoardEntry<E extends { id: string; name: string }>(brandName: string, entries: E[]): E | null {
  const brand = licenceKey(brandName);
  const rank = (e: E) => {
    const k = licenceKey(e.name);
    return [k === brand ? 0 : 1, k.split(" ").length];
  };
  return [...entries].sort((a, b) => {
    const [ra, rb] = [rank(a), rank(b)];
    return ra[0] - rb[0] || ra[1] - rb[1] || a.id.localeCompare(b.id);
  })[0] ?? null;
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
