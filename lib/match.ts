import { isEntryTitle, isSeniorTitle, titleFamily, type TitleFamily } from "./titles";
import type { JdSponsorship } from "./jd-signals";
import { sponsorLevel, type SponsorStats } from "./sponsor";
import type { JobVisaFit, WorkProfile, WorkRight } from "./visa";

/**
 * Deterministic job ↔ profile scoring (0–100). The LLM only writes the one-line "why it fits"
 * for the top results, so ranking stays cheap, explainable and testable.
 */

export type Profile = {
  skills: string[];
  targetFamilies: TitleFamily[];
  yearsExperience: number;
  needsSponsorship: boolean;
  wantsRemote: "remote" | "hybrid" | "onsite" | "any";
  locations: string[]; // cities or US states the user is open to; empty = anywhere
  /** UK / NL / IE matching only. */
  work?: WorkProfile;
  targetCountries?: string[];
};

export type JobLite = {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  description: string;
  postedAt: string | null;
  jdSponsorship?: JdSponsorship;
};

export type Scored = { job: JobLite; score: number; family: TitleFamily; reasons: string[] };

/** UK/NL/IE matching: the visa fit from the registers replaces the H-1B filing history. */
export type VisaInput = { fit: JobVisaFit; right: WorkRight; reason: string | null };

const VISA_FACTOR: Record<JobVisaFit, number> = { ok_licensed: 1, ok: 0.85, risky: 0.25, blocked: 0 };

const W = { family: 30, skills: 30, level: 15, sponsor: 15, location: 5, fresh: 5 };

function skillHits(skills: string[], text: string): string[] {
  const t = ` ${text.toLowerCase()} `;
  return skills.filter((s) => {
    const k = s.toLowerCase().trim();
    if (!k) return false;
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(t);
  });
}

export function scoreJob(job: JobLite, p: Profile, sponsor: SponsorStats | null, now = Date.now(), visa?: VisaInput): Scored {
  const family = titleFamily(job.title);
  const reasons: string[] = [];
  let score = 0;

  if (p.targetFamilies.includes(family)) {
    score += W.family;
    reasons.push("role matches what you're targeting");
  } else if (family === "other") {
    score += W.family * 0.2;
  }

  const hits = skillHits(p.skills, `${job.title} ${job.description}`);
  if (p.skills.length) {
    score += W.skills * Math.min(1, hits.length / Math.min(6, p.skills.length));
    if (hits.length) reasons.push(`uses ${hits.slice(0, 3).join(", ")}`);
  }

  const senior = isSeniorTitle(job.title);
  if (p.yearsExperience < 3) {
    if (isEntryTitle(job.title)) { score += W.level; reasons.push("entry-level friendly"); }
    else if (!senior) score += W.level * 0.6;
  } else {
    score += senior ? W.level : W.level * 0.7;
  }

  if (visa) {
    score += W.sponsor * VISA_FACTOR[visa.fit];
    if (visa.reason) reasons.push(visa.reason);
  } else if (p.needsSponsorship) {
    const lvl = sponsorLevel(sponsor, family);
    const f = { strong: 1, some: 0.7, rare: 0.3, unknown: 0.2, none: 0 }[lvl];
    score += W.sponsor * f;
    if (lvl === "strong" || lvl === "some") reasons.push("employer has filed H-1Bs");
  } else {
    score += W.sponsor;
  }

  const loc = job.location.toLowerCase();
  if (job.remote && p.wantsRemote !== "onsite") { score += W.location; reasons.push("remote"); }
  else if (!p.locations.length || p.locations.some((l) => loc.includes(l.toLowerCase()))) score += W.location;

  if (job.postedAt) {
    const days = (now - Date.parse(job.postedAt)) / 86_400_000;
    // Recent postings get far more replies; outside the US market the weight is doubled.
    const fresh = days <= 3 ? 1 : days <= 7 ? 0.8 : days <= 14 ? 0.5 : days <= 30 ? 0.25 : 0;
    score += W.fresh * (visa ? 2 : 1) * fresh;
    if (visa && days <= 7) reasons.push(days < 1 ? "posted today" : `posted ${Math.round(days)} day${Math.round(days) === 1 ? "" : "s"} ago`);
  }

  return { job, family, score: Math.min(100, Math.round(score)), reasons };
}

/** Ranks jobs; for users who need sponsorship, drops postings that refuse it and employers with zero filings. */
export function rankJobs(
  jobs: JobLite[],
  p: Profile,
  sponsorOf: (company: string) => SponsorStats | null,
  now = Date.now(),
): Scored[] {
  return jobs
    .map((j) => scoreJob(j, p, sponsorOf(j.company), now))
    .filter((s) => !(p.needsSponsorship && (s.job.jdSponsorship === "no" || sponsorLevel(sponsorOf(s.job.company), s.family) === "none")))
    .sort((a, b) => b.score - a.score || a.job.id.localeCompare(b.job.id));
}

export type RerankVerdict = { fit: number; why: string; gap: string | null };

/** Validates model verdicts (numbers 1..n, fit clamped 0-100, short text) and keys them by job id. */
export function cleanRerank(raw: { n: number; fit: number; why: string; gap: string | null }[], ids: string[]): Map<string, RerankVerdict> {
  const out = new Map<string, RerankVerdict>();
  for (const v of raw) {
    const id = ids[Math.round(v.n) - 1];
    if (!id || out.has(id) || !Number.isFinite(v.fit)) continue;
    const words = (s: string, n: number) => s.trim().split(/\s+/).slice(0, n).join(" ");
    out.set(id, { fit: Math.max(0, Math.min(100, Math.round(v.fit))), why: words(v.why ?? "", 24), gap: v.gap?.trim() ? words(v.gap, 14) : null });
  }
  return out;
}

/** Final order: half rule-based score, half the model's fit judgment; jobs it didn't judge keep their score. */
export function blendRerank(scored: Scored[], verdicts: Map<string, RerankVerdict>): (Scored & { why?: string; gap?: string | null })[] {
  return scored
    .map((s) => {
      const v = verdicts.get(s.job.id);
      return v ? { ...s, score: Math.round((s.score + v.fit) / 2), why: v.why, gap: v.gap } : s;
    })
    .sort((a, b) => b.score - a.score || a.job.id.localeCompare(b.job.id));
}
