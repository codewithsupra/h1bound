/**
 * Posted pay, and whether it clears the visa salary floor. Pure and client-safe.
 *
 * Guidance, not legal advice: floors also depend on the occupation's "going rate" (UK), the
 * person's age (NL) and the occupation list (IE). So the check only ever says that posted pay
 * meets or misses a published floor, and says "not stated" rather than guess when a posting has
 * no pay. Floors live in SALARY_FLOORS (lib/visa.ts) with their sources.
 */
import { SALARY_FLOORS, type Market, type VisaSituation } from "@/lib/visa";

export type Period = "year" | "month" | "day" | "hour";
export type Salary = { min: number; max: number | null; currency: string; period: Period };

// Full-time conversions to a year. UK hourly roles usually quote 37.5 hours a week.
const PER_YEAR: Record<Period, number> = { year: 1, month: 12, day: 260, hour: 1950 };

export function annualise(s: Salary): { min: number; max: number } {
  const k = PER_YEAR[s.period];
  return { min: Math.round(s.min * k), max: Math.round((s.max ?? s.min) * k) };
}

const valid = (s: Salary | null): Salary | null => {
  if (!s || !Number.isFinite(s.min) || s.min <= 0) return null;
  const max = s.max != null && Number.isFinite(s.max) && s.max >= s.min ? s.max : null;
  const year = s.min * PER_YEAR[s.period];
  return year >= 5_000 && year <= 2_000_000 ? { ...s, currency: s.currency.toUpperCase(), max } : null;
};

/* ------------------------------------------------------------------ structured board fields */

const LEVER_PERIOD: Record<string, Period> = { "per-year-salary": "year", "per-month-salary": "month", "per-day-wage": "day", "per-hour-wage": "hour" };
export function fromLeverSalary(r: { min?: number; max?: number; currency?: string; interval?: string } | null | undefined): Salary | null {
  const period = r?.interval ? LEVER_PERIOD[r.interval] : undefined;
  if (!r?.min || !r.currency || !period) return null;
  return valid({ min: r.min, max: r.max ?? null, currency: r.currency, period });
}

type AshbyComponent = { compensationType?: string; interval?: string; currencyCode?: string; minValue?: number | null; maxValue?: number | null };
const ASHBY_PERIOD: Record<string, Period> = { "1 YEAR": "year", "1 MONTH": "month", "1 DAY": "day", "1 HOUR": "hour" };
export function fromAshbyCompensation(c: { summaryComponents?: AshbyComponent[] } | null | undefined): Salary | null {
  const s = c?.summaryComponents?.find((x) => x.compensationType === "Salary");
  const period = s?.interval ? ASHBY_PERIOD[s.interval] : undefined;
  if (!s?.minValue || !s.currencyCode || !period) return null;
  return valid({ min: s.minValue, max: s.maxValue ?? null, currency: s.currencyCode, period });
}

export function fromRecruiteeSalary(r: { min?: string | number | null; max?: string | number | null; currency?: string | null; period?: string | null } | null | undefined): Salary | null {
  const period = (["year", "month", "day", "hour"] as const).find((p) => p === r?.period);
  const min = Number(r?.min);
  if (!period || !r?.currency || !min) return null;
  return valid({ min, max: r.max != null ? Number(r.max) : null, currency: r.currency, period });
}

export function fromGreenhousePay(ranges: { min_cents?: number; max_cents?: number; currency_type?: string }[] | null | undefined): Salary | null {
  const r = ranges?.[0];
  if (!r?.min_cents || !r.currency_type) return null;
  return valid({ min: r.min_cents / 100, max: r.max_cents ? r.max_cents / 100 : null, currency: r.currency_type, period: "year" });
}

/* ------------------------------------------------------------------ free text */

const CUR: Record<string, string> = { "£": "GBP", "€": "EUR", $: "USD", gbp: "GBP", eur: "EUR", usd: "USD" };
// One money amount: symbol or code, then 45,000 / 45.000 / 45000 / 45k / 4.500,00
const AMOUNT = String.raw`(£|€|\$|gbp\s?|eur\s?|usd\s?)\s?(\d{1,3}(?:[.,\s]\d{3})+|\d+(?:[.,]\d+)?)\s?(k\b)?`;
const RANGE = new RegExp(`${AMOUNT}(?:\\s?(?:-|–|—|&mdash;|&ndash;|to)\\s?(?:£|€|\\$|gbp\\s?|eur\\s?|usd\\s?)?\\s?(\\d{1,3}(?:[.,\\s]\\d{3})+|\\d+(?:[.,]\\d+)?)\\s?(k\\b)?)?`, "gi");

const PERIOD_WORDS: [Period, RegExp][] = [
  ["year", /^\s*(?:per\s+(?:annum|year)|a\s+year|p\.?\s?a\.?|annually|\/\s?(?:year|yr|annum)|yearly|gross\s+per\s+year)/i],
  ["month", /^\s*(?:per\s+month|a\s+month|monthly|\/\s?(?:month|mo|mnd)|p\.?\s?m\.?\b|bruto\s+per\s+maand|per\s+maand)/i],
  ["day", /^\s*(?:per\s+day|a\s+day|daily|\/\s?day)/i],
  ["hour", /^\s*(?:per\s+hour|an\s+hour|hourly|\/\s?(?:hour|hr|uur)|per\s+uur)/i],
];
const CONTEXT = /(salary|salaris|pay\b|paid|compensation|package|base|remuneration|wage|annum|range|per\s+(?:year|month|hour)|bruto)/i;
const NOT_PAY = /(million|billion|\bm\b|\bbn\b|budget|bonus|allowance|stipend|funding|raised|revenue|turnover|equity|relocation|sign-?on|referral|voucher|discount|cashback|ote\b|on[-\s]target|acv\b|arr\b|deals?\b|sales\b|contract\s+value|processed|transactions?)/i;

/** A number written as 45,000 / 45.000 / 4.500,00 / 45k. Commas and dots are read as thousands separators when 3 digits follow. */
function toNumber(raw: string, k: string | undefined): number {
  let s = raw.replace(/\s/g, "");
  if (/^\d{1,3}(?:[.,]\d{3})+[.,]\d{2}$/.test(s)) s = s.slice(0, -3); // drop cents after thousands: 4.500,00 -> 4.500
  s = /[.,]\d{3}(?:[.,]\d{3})*$/.test(s) ? s.replace(/[.,]/g, "") : s.replace(",", ".");
  const n = Number(s);
  return k ? n * 1000 : n;
}

function guessPeriod(n: number, currency: string): Period | null {
  if (n >= 10_000) return "year";
  if (n < 200) return "hour";
  if (n >= 1_000 && currency === "EUR") return "month"; // Dutch and Irish postings quote monthly gross
  return null;
}

/**
 * The first plausible salary in a posting's text, or null. Deliberately strict: an amount counts
 * only near pay words or with a period, and never when it reads as funding, a bonus, a budget or
 * on-target earnings (OTE includes commission, which visa floors don't count).
 */
export function parseSalaryText(text: string): Salary | null {
  if (!text) return null;
  // Commission-heavy postings quote earnings, not base pay; there only an amount called base counts.
  const commissioned = /\bote\b|commission[-\s]only|uncapped\s+(?:upfront\s+)?commission/i.test(text);
  for (const m of text.matchAll(RANGE)) {
    const at = m.index ?? 0;
    // Only this sentence counts as context, so "raised £30m. Salary: £42,000" still reads the salary.
    const before = text.slice(Math.max(0, at - 60), at).split(/[.;!?\n]\s/).pop() ?? "";
    const after = text.slice(at + m[0].length, at + m[0].length + 40);
    if (NOT_PAY.test(after.slice(0, 15)) || NOT_PAY.test(before.slice(-30)) || /\bote\b/i.test(after)) continue;
    if (commissioned && !/\bbas(?:e|ic)\b/i.test(before)) continue;
    const currency = CUR[m[1].trim().toLowerCase()];
    let min = toNumber(m[2], m[3]);
    const max = m[4] ? toNumber(m[4], m[5] ?? m[3]) : null;
    if (max && m[5] && !m[3] && min < 1000) min *= 1000; // "£60-70K": the K covers both ends
    const said = PERIOD_WORDS.find(([, re]) => re.test(after))?.[0];
    if (!said && !CONTEXT.test(before) && !m[4]) continue;
    const period = said ?? guessPeriod(min, currency);
    if (!period) continue;
    const s = valid({ min, max, currency, period });
    if (s) return s;
  }
  return null;
}

/* ------------------------------------------------------------------ the visa check */

export type SalaryStatus = "meets" | "below" | "depends" | "unknown";
export type SalaryCheck = { status: SalaryStatus; text: string; source: string | null };

const MARKET_CURRENCY: Record<Market, string> = { GB: "GBP", NL: "EUR", IE: "EUR" };
const money = (n: number, cur: string) => `${cur === "GBP" ? "£" : cur === "EUR" ? "€" : `${cur} `}${n.toLocaleString("en-GB")}`;

/** Floors that apply to this person in this market, lowest first, with who each applies to. */
function floors(market: Market, situation: VisaSituation | null): { amount: number; who: string; perMonth?: boolean }[] {
  const early = situation === "student" || situation === "graduate";
  if (market === "GB") {
    const f = SALARY_FLOORS.GB;
    return early
      ? [{ amount: f.newEntrant, who: "Skilled Worker new-entrant rate" }]
      : [{ amount: f.newEntrant, who: "new-entrant rate (under 26 or a recent UK graduate)" }, { amount: f.general, who: "general Skilled Worker rate" }];
  }
  if (market === "NL") {
    const f = SALARY_FLOORS.NL;
    return early
      ? [{ amount: f.recentGraduate, who: "highly skilled migrant rate after study", perMonth: true }]
      : [{ amount: f.under30, who: "highly skilled migrant rate under 30", perMonth: true }, { amount: f.over30, who: "rate at 30 or older", perMonth: true }];
  }
  const f = SALARY_FLOORS.IE;
  return [{ amount: f.general, who: "General Employment Permit minimum" }];
}

/**
 * Does posted pay clear the floor for this person? A range that straddles the floor, or a person
 * whose floor depends on age, is "depends". Remote roles with no market, other currencies and
 * postings with no pay are "unknown".
 */
export function salaryCheck(s: Salary | null, market: Market | null, situation: VisaSituation | null): SalaryCheck {
  if (!market) return { status: "unknown", text: "No visa salary floor applies to this remote role.", source: null };
  const source = SALARY_FLOORS[market].source;
  if (!s) return { status: "unknown", text: "Salary not stated: ask before applying, since the visa needs a minimum.", source };
  const cur = MARKET_CURRENCY[market];
  if (s.currency !== cur) return { status: "unknown", text: `Pay is posted in ${s.currency}, so it can't be checked against the ${cur} floor.`, source };

  const fs = floors(market, situation);
  const monthly = fs[0].perMonth;
  const y = annualise(s);
  const lo = monthly ? Math.round(y.min / 12) : y.min;
  const hi = monthly ? Math.round(y.max / 12) : y.max;
  const unit = monthly ? " a month" : " a year";
  const shown = lo === hi ? money(lo, cur) : `${money(lo, cur)}–${money(hi, cur)}`;
  const caveat = market === "GB" ? " The role's going rate can be higher." : market === "NL" ? " Excludes holiday allowance." : "";
  const lowest = fs[0], highest = fs[fs.length - 1];

  if (lo >= highest.amount) return { status: "meets", text: `Posted pay ${shown}${unit} meets the ${money(highest.amount, cur)} ${highest.who}.${caveat}`, source };
  if (hi < lowest.amount) return { status: "below", text: `Posted pay ${shown}${unit} is under the ${money(lowest.amount, cur)} ${lowest.who}.`, source };
  if (lo >= lowest.amount) {
    return { status: "depends", text: `Posted pay ${shown}${unit} meets the ${money(lowest.amount, cur)} ${lowest.who}, not the ${money(highest.amount, cur)} ${highest.who}.${caveat}`, source };
  }
  return { status: "depends", text: `Posted range ${shown}${unit} straddles the ${money(lowest.amount, cur)} ${lowest.who}: the offer must be at least that.${caveat}`, source };
}
