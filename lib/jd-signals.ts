/**
 * Reads what a job description itself says about sponsorship and location. A posting that says
 * "we cannot sponsor" beats any company-level filing history, so this overrides the badge.
 * Pure and client-safe.
 */

export type JdSponsorship = "no" | "yes" | null;

const NO = [
  /\b(unable|not able|cannot|can ?not|can't|won't|will not|do(es)? not|are not able to|is not able to)\s+(to\s+)?(provide\s+|offer\s+)?(visa\s+|immigration\s+|employment\s+visa\s+)?sponsor/,
  /\b(no|without)\s+(visa\s+|immigration\s+)?sponsorship\b/,
  /\bsponsorship\s+(is\s+)?(not\s+(available|offered|provided)|unavailable)/,
  /\bnot\s+(eligible|available)\s+for\s+(visa\s+|immigration\s+)?sponsorship/,
  /\bmust\s+be\s+(a\s+)?(us|u\.s\.)\s+citizen/,
  /\b(requires?|required)\b.{0,40}\bclearance\b/,
  /\b(eligib\w*|ability|able)\s+(to\s+obtain|for|to\s+get)\s+(and\s+maintain\s+)?(an?\s+)?(active\s+)?(u\.?s\.?\s+)?(government\s+)?(security\s+)?clearance/,
  /\b(must\s+be\s+an?\s+)?u\.?s\.?\s+persons?\b.{0,60}\b(itar|export)/,
  /\b(itar|ear)\b.{0,80}\bu\.?s\.?\s+(person|citizen)/,
  /\bexport (control )?regulations?\b.{0,120}\b(citizen|permanent resident|u\.?s\.? person)/,
  /\bmust\s+be\s+an?\s+(\(i\)\s*)?u\.?s\.?\s+citizen/,
  /\bmust\s+(be\s+)?(legally\s+)?authorized\s+to\s+work\s+in\s+the\s+(us|u\.s\.|united states)\s+without\s+(the\s+need\s+for\s+)?(current\s+or\s+future\s+)?(employer\s+)?sponsorship/,
  // UK / EU phrasing. "Right to work" alone is common boilerplate, so it only counts when the sentence rules out sponsorship.
  /\b(must|need to|required to)\s+(already\s+)?(have|hold|possess)\s+(the\s+|full\s+|an?\s+existing\s+|existing\s+|unrestricted\s+)?right\s+to\s+work\s+in\s+the\s+(uk|united kingdom|netherlands|eu|european union|republic of ireland|ireland)\b(?![^.]{0,60}\b(or|and)\b[^.]{0,40}\bsponsor)/,
  /\b(valid\s+)?(eu|eea)\s+(work\s+permit|passport|citizenship)\s+(is\s+)?(required|necessary|mandatory)/,
  /\b(only|solely)\s+(consider|accept)\w*\s+(applicants|candidates)\s+(who|with)\b.{0,40}\bright\s+to\s+work/,
  /\b(sole\s+)?uk\s+national(s|ity)?\s+(only|required)/,
  /\b(sc|dv|security)\s+clear(ed|ance)\s+(is\s+)?(required|essential)/,
];

const YES = [
  /\b(visa|h-?1b|immigration)\s+sponsorship\s+(is\s+)?(available|offered|provided|possible)/,
  /\b(we|will|can|able to)\s+(provide\s+|offer\s+)?sponsor\s+(visas?|h-?1b|work\s+authorization)/,
  /\bopen\s+to\s+sponsor/,
  /\bsponsorship\s+available\b/,
  /\b(offer|provide|support)s?\s+(full\s+)?(visa|immigration|relocation\s+and\s+visa)\s+(sponsorship|support)\b/,
  /\b(we\s+)?(can|will|are able to)\s+sponsor\s+(a\s+)?(skilled\s+worker|tier\s*2|work)\s+(visa|permit)s?/,
  /\b(skilled\s+worker|tier\s*2)\s+(visa\s+)?sponsorship\s+(is\s+)?(available|offered|possible)/,
  /\b(kennismigrant|highly\s+skilled\s+migrant)\b.{0,60}\b(available|possible|support|eligible|offer)/,
  /\b(critical\s+skills|general)\s+employment\s+permit\b.{0,40}\b(available|support|sponsor)/,
];

export function jdSponsorship(text: string): JdSponsorship {
  const t = text.toLowerCase().replace(/\s+/g, " ");
  if (NO.some((r) => r.test(t))) return "no";
  if (YES.some((r) => r.test(t))) return "yes";
  return null;
}

const US_STATES =
  "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";
const US_RE = new RegExp(
  `\\b(united states|usa|u\\.s\\.|us-?remote|remote.{0,4}us\\b|new york|san francisco|seattle|boston|austin|chicago|los angeles|bay area|atlanta|denver|dallas|houston|miami|washington|philadelphia|pittsburgh|san jose|mountain view|palo alto|menlo park|sunnyvale)\\b|,\\s*(${US_STATES})\\b`,
  "i",
);

/** True when the location string points at the US (or is a bare "Remote" with no country). */
export function isUsLocation(location: string): boolean {
  if (US_RE.test(location)) return true;
  return /^\s*remote\s*$/i.test(location);
}
