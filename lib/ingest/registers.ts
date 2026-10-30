/**
 * Official visa-sponsor registers for the UK, Netherlands and Ireland, parsed into one shape.
 *
 * - UK: Home Office "Register of licensed sponsors: workers" (CSV, republished daily on gov.uk).
 * - NL: IND public register of recognised sponsors for regular labour and highly skilled migrants (HTML table).
 * - IE: Dept. of Enterprise "Employment permits issued to companies" (xlsx, per month, one file per year).
 *
 * Being on a register means the employer is licensed or recognised to sponsor, not that a given job
 * will be sponsored, so copy cites the register and never promises. Pure: parsers take file contents.
 */
import { employerTokens } from "../employer";

export type Country = "GB" | "NL" | "IE";

export type Licence = {
  country: Country;
  key: string;
  name: string;
  city: string | null;
  region: string | null;
  /** UK visa routes the licence covers, e.g. "Skilled Worker". */
  routes: string[];
  /** UK licence rating: "A", "B" or "Provisional". */
  rating: string | null;
  /** NL Chamber of Commerce (KVK) number. */
  regId: string | null;
  /** IE permits issued per year, e.g. { "2025": 31, "2026": 7 }. */
  permits: Record<string, number>;
};

/** Country words that legal names add to a brand ("Google Ireland Limited", "Amazon UK Services Ltd"). */
const REGIONAL = new Set(["uk", "gb", "ireland", "irl", "nederland", "netherlands", "holland", "europe", "emea", "eu", "dac", "uc", "unlimited", "cic", "ta"]);

/** Comparison key for a register name: the employer key without regional and Irish/UK legal-form words. */
export function licenceKey(name: string): string {
  // "B.V." / "D.A.C." / "U.K." → "BV" / "DAC" / "UK" before tokenizing, or they split into single letters.
  const flat = name.replace(/\bt\/a\b.*$/i, "").replace(/\b(?:[a-z]\.)+[a-z]\b\.?/gi, (m) => m.replace(/\./g, ""));
  const tokens = employerTokens(flat);
  const kept = tokens.filter((t) => !REGIONAL.has(t));
  return (kept.length ? kept : tokens).join(" ");
}

/** "Hamilton, " → "Hamilton"; "LONDON" → "London". */
function cleanPlace(s: string | undefined): string | null {
  const t = (s ?? "").replace(/,?\s*(united kingdom|uk|england)\s*$/i, "").replace(/[,\s]+$/, "").trim();
  if (!t) return null;
  return t === t.toUpperCase() ? t.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()) : t;
}

/** RFC 4180-ish: handles quoted fields with commas and doubled quotes; one record per line. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** Routes a student or graduate could plausibly be hired on. Religious, sport and charity routes are not jobs we match. */
export const UK_JOB_ROUTES = new Set(["Skilled Worker", "Global Business Mobility: Graduate Trainee", "Scale-up", "Global Business Mobility: Senior or Specialist Worker"]);

function ukRating(typeAndRating: string): string | null {
  const m = typeAndRating.match(/\(([^)]*)\)/);
  if (!m) return null;
  if (/provisional/i.test(m[1])) return "Provisional";
  const r = m[1].match(/\b([AB])\s+rating/i);
  return r ? r[1].toUpperCase() : null;
}

/** Merges rows that normalize to the same key, keeping the first name/place and the union of routes. */
function merge(into: Map<string, Licence>, l: Licence) {
  const prev = into.get(l.key);
  if (!prev) { into.set(l.key, l); return; }
  for (const r of l.routes) if (!prev.routes.includes(r)) prev.routes.push(r);
  // A worse rating on any licence for this employer wins: B means the Home Office has concerns.
  if (l.rating === "B" || (l.rating && !prev.rating)) prev.rating = l.rating;
  prev.city ??= l.city;
  prev.region ??= l.region;
  prev.regId ??= l.regId;
  for (const [y, n] of Object.entries(l.permits)) prev.permits[y] = (prev.permits[y] ?? 0) + n;
}

/** UK register CSV → one licence per employer, only those holding at least one job route. */
export function parseUkRegister(csv: string): Licence[] {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/);
  const head = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const col = (name: string) => {
    const i = head.indexOf(name);
    if (i < 0) throw new Error(`UK register: missing column "${name}" (got ${head.join(", ")})`);
    return i;
  };
  const [iName, iCity, iCounty, iType, iRoute] = [col("organisation name"), col("town/city"), col("county"), col("type & rating"), col("route")];
  const out = new Map<string, Licence>();
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const f = parseCsvLine(line);
    const route = (f[iRoute] ?? "").trim();
    const name = (f[iName] ?? "").trim().replace(/\s+/g, " ");
    if (!UK_JOB_ROUTES.has(route) || !name) continue;
    const key = licenceKey(name);
    if (!key) continue;
    merge(out, {
      country: "GB", key, name, city: cleanPlace(f[iCity]), region: cleanPlace(f[iCounty]),
      routes: [route], rating: ukRating(f[iType] ?? ""), regId: null, permits: {},
    });
  }
  return [...out.values()];
}

const decode = (s: string) =>
  s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/""/g, '"').replace(/^"(.*)"$/, "$1").replace(/\s+/g, " ").trim();

/** IND register page → recognised sponsors with their KVK number. */
export function parseNlRegister(html: string): Licence[] {
  const out = new Map<string, Licence>();
  for (const m of html.matchAll(/<tr>\s*<th scope="row">([\s\S]*?)<\/th>\s*<td>\s*(\d+)\s*<\/td>\s*<\/tr>/g)) {
    const name = decode(m[1]);
    const key = licenceKey(name);
    if (!key) continue;
    merge(out, { country: "NL", key, name, city: null, region: null, routes: ["Highly skilled migrant"], rating: null, regId: m[2], permits: {} });
  }
  return [...out.values()];
}

/**
 * IE permits-by-company sheet, given as rows of cell values. The employer name is the first text
 * cell and the yearly total the last number; header and "Grand Total" rows are skipped.
 */
export function parseIePermits(rows: unknown[][], year: string): Licence[] {
  const out = new Map<string, Licence>();
  for (const row of rows) {
    const cells = row.filter((c) => c !== null && c !== undefined && c !== "");
    const name = typeof cells[0] === "string" ? cells[0].trim().replace(/\s+/g, " ") : "";
    const total = cells.at(-1);
    if (!name || typeof total !== "number" || /^(grand total|employer name)$/i.test(name)) continue;
    const key = licenceKey(name);
    if (!key) continue;
    merge(out, { country: "IE", key, name, city: null, region: null, routes: ["Employment permit"], rating: null, regId: null, permits: { [year]: total } });
  }
  return [...out.values()];
}

/** Combines several years of IE permits into one licence per employer; the newest year's name wins. */
export function mergeYears(...years: Licence[][]): Licence[] {
  const out = new Map<string, Licence>();
  for (const list of [...years].reverse()) for (const l of list) merge(out, { ...l, permits: { ...l.permits }, routes: [...l.routes] });
  return [...out.values()];
}
