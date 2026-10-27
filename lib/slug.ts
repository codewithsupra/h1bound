import { prettyCompany } from "./employer";

/**
 * URL slugs for public sponsor pages (/sponsors/<slug>). A slug is assigned once and never
 * recomputed, so links stay stable when a display name changes later. Pure and client-safe.
 */

const MAX_LEN = 80;

/** Company name for public pages: prettyCompany, minus the "&" left over from "& Co." */
export function sponsorName(name: string): string {
  return prettyCompany(name).replace(/[\s,]*&$/, "");
}

/** "Amazon.com Services LLC" → "amazon-com-services"; "AT&T Corp" → "at-and-t"; "Ernst & Young U.S. LLP" → "ernst-and-young-us". */
export function companySlug(name: string): string {
  const s = sponsorName(name)
    .replace(/\b([a-z])\.(?=[a-z]\b)/gi, "$1") // "U.S." → "US."
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const cut = s.length > MAX_LEN ? s.slice(0, MAX_LEN).replace(/-[^-]*$/, "") || s.slice(0, MAX_LEN) : s;
  return cut || "employer";
}

/**
 * Board resolution sometimes pins one brand name on several unrelated employers (a "NATIONAL"
 * board matched NIH, Amtrak, …). A display name shared by more than one company isn't trusted
 * for slugs; those fall back to their legal name.
 */
export function withTrustedDisplayNames<T extends { display_name: string | null }>(rows: T[]): T[] {
  const seen = new Map<string, number>();
  for (const r of rows) if (r.display_name) seen.set(r.display_name.toLowerCase(), (seen.get(r.display_name.toLowerCase()) ?? 0) + 1);
  return rows.map((r) => (r.display_name && seen.get(r.display_name.toLowerCase())! > 1 ? { ...r, display_name: null } : r));
}

export type SlugCandidate = { id: string; name: string; display_name: string | null; total_filings: number };

/**
 * Gives each candidate a slug not in `taken`. When two employers share a base slug, the one with
 * more filings keeps the bare slug and the rest get "-2", "-3", … (ties broken by id, so reruns
 * are deterministic). `taken` is not modified.
 */
export function assignSlugs(rows: SlugCandidate[], taken: Iterable<string> = []): Map<string, string> {
  const used = new Set(taken);
  const out = new Map<string, string>();
  const ordered = [...rows].sort((a, b) => b.total_filings - a.total_filings || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const r of ordered) {
    const base = companySlug(r.display_name ?? r.name);
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    out.set(r.id, slug);
  }
  return out;
}
