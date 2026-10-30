/**
 * Who needs sponsorship where, for the markets we match: UK, Netherlands, Ireland. Pure and client-safe.
 *
 * Not legal advice. Rules are deliberately coarse: they decide which jobs to show and how Maya
 * explains them, and the student confirms details with their university or an adviser.
 */

export type Market = "GB" | "NL" | "IE";
export const MARKETS: Market[] = ["GB", "NL", "IE"];
export const MARKET_NAME: Record<Market, string> = { GB: "UK", NL: "Netherlands", IE: "Ireland" };

/** student: on a study visa there now. graduate: on a post-study route (UK Graduate, IE Stamp 1G, NL orientation year). */
export type VisaSituation = "student" | "graduate" | "sponsored" | "none";

/**
 * free: can work there without a sponsor.
 * post_study: can work now (or after graduating) on a post-study route, but needs a sponsor to stay long term.
 * sponsor: needs a licensed or recognised sponsor from day one.
 */
export type WorkRight = "free" | "post_study" | "sponsor";

export type WorkProfile = { citizenship: string | null; visaCountry: string | null; visaSituation: VisaSituation | null };

// EU + EEA + Switzerland: free movement in NL and IE.
const EEA = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO", "CH",
]);

export function workRight(market: Market, p: WorkProfile): WorkRight {
  const c = p.citizenship?.toUpperCase() ?? null;
  if (c === market) return "free";
  // Common Travel Area: UK and Irish citizens work freely in each other's country.
  if ((market === "GB" && c === "IE") || (market === "IE" && c === "GB")) return "free";
  if (market !== "GB" && c && EEA.has(c)) return "free";
  if (p.visaCountry === market && (p.visaSituation === "student" || p.visaSituation === "graduate")) return "post_study";
  return "sponsor";
}

export function workRights(p: WorkProfile): Record<Market, WorkRight> {
  return { GB: workRight("GB", p), NL: workRight("NL", p), IE: workRight("IE", p) };
}

/** Evidence that an employer can hire someone who needs a visa, from the official registers. */
export type LicenceProof = {
  country: Market;
  /** UK licence rating; B means the Home Office has asked the employer to improve. */
  rating: string | null;
  routes: string[];
  /** Irish permits issued per year. */
  permits: Record<string, number>;
};

export type JobVisaFit = "ok" | "ok_licensed" | "risky" | "blocked";

/**
 * Can this person realistically take this job?
 * - UK and NL employers must hold a licence (or recognition) to sponsor at all, so without one a
 *   sponsor-needing candidate is blocked. Ireland has no licence system: a permit history is strong
 *   evidence, and its absence is risky rather than blocked.
 * - A posting that says it can't sponsor blocks anyone who needs sponsorship, whatever the register says.
 * - Post-study candidates can start without a sponsor; a licensed employer is still better, since it can switch them later.
 */
export function jobVisaFit(market: Market, right: WorkRight, licence: LicenceProof | null, jd: "yes" | "no" | null): JobVisaFit {
  if (right === "free") return "ok";
  const licensed = !!licence && (market !== "GB" || licence.rating !== "B") && (market !== "IE" || permitTotal(licence) > 0);
  if (right === "post_study") return licensed ? "ok_licensed" : jd === "no" ? "risky" : "ok";
  if (jd === "no") return "blocked";
  if (licensed) return "ok_licensed";
  if (market === "IE" || jd === "yes") return "risky";
  return "blocked";
}

export const permitTotal = (l: Pick<LicenceProof, "permits">) => Object.values(l.permits).reduce((a, n) => a + n, 0);

/** One line citing the register, for Maya and job cards. Never says "will sponsor". */
export function licenceLine(l: LicenceProof): string {
  if (l.country === "GB") {
    const route = l.routes.includes("Skilled Worker") ? "Skilled Worker" : l.routes[0] ?? "worker";
    const rating = l.rating === "A" ? "A-rated" : l.rating === "B" ? "B-rated" : l.rating === "Provisional" ? "provisional" : "";
    return `On the UK Home Office sponsor register (${[rating, route].filter(Boolean).join(", ")} licence)`;
  }
  if (l.country === "NL") return "Recognised sponsor on the Dutch IND public register";
  const years = Object.entries(l.permits).sort(([a], [b]) => b.localeCompare(a));
  const parts = years.map(([y, n]) => `${n.toLocaleString("en-GB")} in ${y}`);
  return `Irish employment permits issued: ${parts.join(", ")}`;
}

/**
 * Salary floors that change most years. Kept here with their source so Maya can mention them as
 * guidance; not used to hide jobs, because few postings state a salary.
 */
export const SALARY_FLOORS = {
  GB: { year: 2025, general: 41_700, newEntrant: 33_400, unit: "GBP/year", source: "https://www.gov.uk/skilled-worker-visa/your-job" },
  NL: { year: 2025, over30: 5_688, under30: 4_171, recentGraduate: 2_989, unit: "EUR/month gross", source: "https://ind.nl/en/required-amounts-income-requirements" },
} as const;

/**
 * Work right for a remote job. "Anywhere" roles hire across borders (often through an employer of
 * record), so they're treated as open; "Europe" roles need the right to work somewhere in Europe.
 */
export function remoteRight(scope: string | null, country: string | null, rights: Record<Market, WorkRight>): WorkRight {
  if (country && (MARKETS as string[]).includes(country)) return rights[country as Market];
  if (scope === "anywhere") return "free";
  if (scope === "europe") return rights.NL === "free" || rights.IE === "free" ? "free" : MARKETS.some((m) => rights[m] === "post_study") ? "post_study" : "sponsor";
  return "sponsor";
}

/** A job is in "market mode" when the person is looking in the UK, NL or IE rather than the US. */
export function isMarketProfile(row: { target_countries?: string[] | null; visa_country?: string | null }): boolean {
  return (row.target_countries ?? []).some((c) => (MARKETS as string[]).includes(c)) || (MARKETS as string[]).includes(row.visa_country ?? "");
}

type Badge = { level: "strong" | "some" | "rare" | "none" | "unknown"; label: string; detail: string };

/** Same badge shape as the US sponsor badge, so job cards render both. */
export function visaBadge(fit: JobVisaFit, right: WorkRight, market: string | null, licence: LicenceProof | null, remote: boolean): Badge {
  const where = market && (MARKETS as string[]).includes(market) ? MARKET_NAME[market as Market] : null;
  if (right === "free") return { level: "strong", label: remote && !where ? "Open to you" : "No visa needed", detail: where ? `You can work in the ${where} without sponsorship.` : "This remote role is open to your location." };
  if (fit === "ok_licensed" && licence) {
    const label = licence.country === "GB" ? "Licensed sponsor" : licence.country === "NL" ? "Recognised sponsor" : "Permit history";
    return { level: "strong", label, detail: licenceLine(licence) };
  }
  if (right === "post_study") {
    return fit === "risky"
      ? { level: "rare", label: "Check visa wording", detail: "The posting asks for existing right to work; your post-study visa may count, but ask before applying." }
      : { level: "some", label: "OK on post-study visa", detail: `You can start on your post-study visa. This employer isn't on the ${where ?? "official"} sponsor register, so staying long term would need a later switch.` };
  }
  return { level: "rare", label: "Sponsorship unclear", detail: "No official sponsor record found for this employer. Ask before you apply." };
}

/** The departure board's register cell, at most 8 characters: "A-RATED", "LISTED", "368 PMT". */
export function licenceFlap(l: Pick<LicenceProof, "country" | "rating" | "permits">): { text: string; tone: "green" | "sodium" | "red" | "mist" } {
  if (l.country === "GB") {
    if (l.rating === "B") return { text: "B-RATED", tone: "red" };
    if (l.rating === "Provisional") return { text: "PROVISNL", tone: "mist" };
    return { text: "A-RATED", tone: "green" };
  }
  if (l.country === "NL") return { text: "LISTED", tone: "green" };
  const n = permitTotal(l);
  return n ? { text: `${n} PMT`, tone: n >= 10 ? "green" : "sodium" } : { text: "NO PMTS", tone: "mist" };
}

export const COUNTRY_PATH: Record<Market, string> = { GB: "uk", NL: "nl", IE: "ie" };
export const PATH_COUNTRY: Record<string, Market> = { uk: "GB", nl: "NL", ie: "IE" };
