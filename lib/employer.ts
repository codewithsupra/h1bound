/**
 * Employer-name normalization and matching.
 *
 * DOL filings spell employers in legal form ("GOOGLE LLC", "Amazon.com Services LLC"), while job
 * boards use brand names ("Google", "Amazon"). We normalize both sides to a comparable key and
 * fall back to token overlap for near-misses. Pure and client-safe.
 */

const SUFFIXES = new Set([
  "inc", "incorporated", "llc", "llp", "lp", "ltd", "limited", "corp", "corporation", "co", "company",
  "plc", "pllc", "pc", "pa", "gmbh", "ag", "sa", "bv", "nv", "pte", "pvt", "private", "holdings",
  "group", "usa", "us", "america", "na", "the",
]);

/** Tokens that carry little identity on their own; ignored when scoring overlap. */
const WEAK = new Set(["services", "technologies", "technology", "solutions", "systems", "labs", "software", "global", "international"]);

export function employerTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\.com\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !SUFFIXES.has(t));
}

/** Stable comparison key: "Amazon.com Services, LLC" → "amazon services". */
export function normalizeEmployer(name: string): string {
  return employerTokens(name).join(" ");
}

/** Key without weak words: "amazon services" → "amazon". Used as a second lookup tier. */
export function coreEmployer(name: string): string {
  const strong = employerTokens(name).filter((t) => !WEAK.has(t));
  return (strong.length ? strong : employerTokens(name)).join(" ");
}

function jaccard(a: string[], b: string[]) {
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter || 1);
}

export type EmployerIndex = { byKey: Map<string, string>; byCore: Map<string, string>; keys: string[] };

/** Builds a lookup over normalized employer keys → canonical id. */
export function buildEmployerIndex(entries: { id: string; name: string }[]): EmployerIndex {
  const byKey = new Map<string, string>();
  const byCore = new Map<string, string>();
  for (const e of entries) {
    const k = normalizeEmployer(e.name);
    if (k && !byKey.has(k)) byKey.set(k, e.id);
    const c = coreEmployer(e.name);
    if (c && !byCore.has(c)) byCore.set(c, e.id);
  }
  return { byKey, byCore, keys: [...byKey.keys()] };
}

/** Exact key → core key → fuzzy (Jaccard ≥ 0.75 on strong tokens). Returns the id or null. */
export function matchEmployer(name: string, idx: EmployerIndex): string | null {
  const k = normalizeEmployer(name);
  if (!k) return null;
  const exact = idx.byKey.get(k);
  if (exact) return exact;
  const core = idx.byCore.get(coreEmployer(name));
  if (core) return core;
  const mine = coreEmployer(name).split(" ");
  let best: string | null = null;
  let bestScore = 0.75;
  for (const key of idx.keys) {
    const s = jaccard(mine, coreEmployer(key).split(" "));
    if (s >= bestScore && s > 0) {
      if (s > bestScore || !best) best = idx.byKey.get(key)!;
      bestScore = s;
    }
  }
  return best;
}

const LEGAL_SUFFIX = /[,\s]+(inc\.?|incorporated|llc|l\.l\.c\.|llp|corp\.?|corporation|co\.?|ltd\.?|limited|plc|pllc|lp|l\.p\.)$/i;

/** "PALANTIR TECHNOLOGIES INC." → "Palantir Technologies"; mixed-case brand names are kept as written. */
export function prettyCompany(name: string): string {
  let n = name.trim();
  for (let i = 0; i < 3 && LEGAL_SUFFIX.test(n); i++) n = n.replace(LEGAL_SUFFIX, "").trim();
  if (n === n.toUpperCase() && /[A-Z]{3,}/.test(n)) {
    n = n.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Ai|Ml|Usa|Us|Ibm|Aws|Sap|Hp)\b/g, (w) => w.toUpperCase());
  }
  return n.replace(/,$/, "");
}

/**
 * Name to show for an employer. Job boards' brand names win ("Handshake" for Stryder Corporation),
 * unless the board name is just a truncated piece of the legal name ("charles" for Charles Schwab),
 * in which case the cleaned legal name is clearer.
 */
export function companyLabel(display: string | null | undefined, legal: string): string {
  if (!display?.trim()) return prettyCompany(legal);
  const d = normalizeEmployer(display);
  const l = normalizeEmployer(legal);
  if (d && l.startsWith(d) && l.length > d.length) return prettyCompany(legal);
  return prettyCompany(display);
}

/**
 * Does a job board's company name refer to this employer? Exact match on the core name (or DBA),
 * or one name extends the other by a single generic suffix ("Scale" ~ "Scale AI"). A lone shared first
 * word is not enough: "Public" is not "Public Health Trust of Dade County".
 */
const GENERIC_SUFFIX = new Set(["ai", "labs", "hq", "io", "app", "tech", "technologies", "technology", "software", "systems", "solutions", "services", "global", "international", "digital", "cloud", "platform", "platforms", "health"]);

export function sameCompany(boardName: string, legal: string, dba: string | null = null): boolean {
  const a = coreEmployer(boardName);
  if (!a) return false;
  for (const name of [legal, dba]) {
    if (!name) continue;
    const b = coreEmployer(name);
    if (!b) continue;
    if (a === b || normalizeEmployer(boardName) === normalizeEmployer(name)) return true;
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    const extra = long.startsWith(`${short} `) ? long.slice(short.length + 1).split(" ") : [];
    if (extra.length === 1 && GENERIC_SUFFIX.has(extra[0])) return true;
  }
  return false;
}
