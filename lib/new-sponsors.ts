/**
 * "New on the sponsor register": employers that joined the UK or Dutch register since a date. A new
 * licence is a strong sign an employer is about to hire someone who needs a visa, often before any
 * role is posted. Pure and client-safe; the loader is lib/server/new-sponsors.ts.
 *
 * The registers don't say what sector an employer is in, so ranking uses what we do know: open roles
 * in the student's field on a job board we've linked, then the student's cities.
 */
export type NewSponsor = {
  id: string; name: string; country: "GB" | "NL"; city: string | null; slug: string | null; firstListed: string;
  rating: string | null; routes: string[];
  /** Open roles in the student's field on the employer's linked job board (0 when none found). */
  openRoles: number;
};

/** More new entries than this in one week means a name-matching change, not a hiring wave: show none. */
export const ANOMALY_PER_WEEK = 1500;

export function rankNewSponsors(list: NewSponsor[], cities: string[], limit: number): NewSponsor[] {
  const want = cities.map((c) => c.toLowerCase().trim()).filter(Boolean);
  const local = (s: NewSponsor) => (s.city && want.some((c) => s.city!.toLowerCase().includes(c) || c.includes(s.city!.toLowerCase())) ? 1 : 0);
  return list
    // UK B-rated licences are on an action plan from the Home Office: not a sign of hiring.
    .filter((s) => s.rating !== "B")
    .sort((a, b) => Number(b.openRoles > 0) - Number(a.openRoles > 0) || local(b) - local(a) || b.openRoles - a.openRoles || b.firstListed.localeCompare(a.firstListed) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** One line per sponsor for the digest and Telegram: what we know, nothing more. */
export function newSponsorLine(s: NewSponsor): string {
  const where = s.country === "GB" ? `UK sponsor register${s.city ? `, ${s.city}` : ""}` : "Dutch IND register";
  const added = new Date(`${s.firstListed}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const roles = s.openRoles ? ` ${s.openRoles} open role${s.openRoles === 1 ? "" : "s"} in your field.` : " No roles posted yet: a good moment to introduce yourself.";
  return `${s.name}: new on the ${where} (added ${added}).${roles}`;
}
