import type { JdSponsorship } from "./jd-signals";
import type { TitleFamily } from "./titles";

/**
 * Turns aggregated DOL LCA filings into an honest sponsorship signal.
 * A certified LCA is a required step before an H-1B petition, not an approved visa, so copy
 * always says "filed" and never "sponsors visas ✅". Pure and client-safe.
 */

export type SponsorStats = {
  fiscalYear: number;
  total: number; // certified H-1B LCAs, all roles
  byFamily: Partial<Record<TitleFamily, { count: number; medianWage: number | null }>>;
  lastFiled: string | null; // ISO date
};

export type SponsorLevel = "strong" | "some" | "rare" | "none" | "unknown";

export type SponsorBadge = { level: SponsorLevel; label: string; detail: string };

export function sponsorLevel(stats: SponsorStats | null, family: TitleFamily): SponsorLevel {
  if (!stats) return "unknown";
  if (stats.total === 0) return "none";
  const fam = stats.byFamily[family]?.count ?? 0;
  if (fam >= 10 || stats.total >= 100) return "strong";
  if (fam >= 1 || stats.total >= 10) return "some";
  return "rare";
}

const usd = (n: number) => `$${Math.round(n / 1000)}k`;

export function sponsorBadge(stats: SponsorStats | null, family: TitleFamily): SponsorBadge {
  const level = sponsorLevel(stats, family);
  if (!stats || level === "unknown") {
    return { level, label: "No US filing data", detail: "We couldn't find H-1B labor filings for this employer. Ask the recruiter directly." };
  }
  if (level === "none") {
    return { level, label: "No H-1B filings found", detail: `No certified H-1B labor applications in FY${stats.fiscalYear}.` };
  }
  const fam = stats.byFamily[family];
  const parts = [`${stats.total.toLocaleString("en-US")} H-1B filing${stats.total === 1 ? "" : "s"} in FY${stats.fiscalYear}`];
  if (fam?.count) {
    parts.push(`${fam.count.toLocaleString("en-US")} for similar roles${fam.medianWage ? `, median ${usd(fam.medianWage)}` : ""}`);
  }
  const label = level === "strong" ? "Sponsors often" : level === "some" ? "Has sponsored" : "Sponsors rarely";
  return { level, label, detail: `${parts.join(" · ")}. Source: US Dept. of Labor LCA data.` };
}

/** The posting's own words win over company history: "we can't sponsor" is final for that job. */
export function jobBadge(stats: SponsorStats | null, family: TitleFamily, jd: JdSponsorship): SponsorBadge {
  if (jd === "no") return { level: "none", label: "Posting says no sponsorship", detail: "This job description says it can't sponsor visas or requires citizenship or clearance." };
  const base = sponsorBadge(stats, family);
  if (jd === "yes") return { level: base.level === "strong" ? "strong" : "some", label: "Posting mentions sponsorship", detail: `The job description says sponsorship is available. ${base.detail}` };
  return base;
}

/** Annualizes a DOL wage given its unit ("Year", "Hour", "Week", "Bi-Weekly", "Month"). */
export function annualWage(amount: number, unit: string): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const u = unit.toLowerCase();
  const mult = u.startsWith("year") ? 1 : u.startsWith("hour") ? 2080 : u.startsWith("week") ? 52 : u.startsWith("bi") ? 26 : u.startsWith("month") ? 12 : null;
  if (!mult) return null;
  const v = amount * mult;
  return v >= 15000 && v <= 2_000_000 ? Math.round(v) : null;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}
