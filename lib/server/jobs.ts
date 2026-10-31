import "server-only";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { rankJobs, type JobLite, type Scored } from "@/lib/match";
import { canShowJobs, type Usage } from "@/lib/quota";
import type { Store } from "./store";
import { isInternTitle } from "@/lib/titles";
import { jobBadge, type SponsorBadge, type SponsorStats } from "@/lib/sponsor";
import type { JdSponsorship } from "@/lib/jd-signals";
import { toMatchProfile, type ProfileRow } from "./profile";
import { blendRerank, scoreJob } from "@/lib/match";
import { isMarketProfile, jobVisaFit, MARKET_NAME, MARKETS, remoteRight, visaBadge, workRights, type LicenceProof, type Market } from "@/lib/visa";
import { SOURCE_CREDIT } from "@/lib/ingest/feeds";
import { FAMILY_LABEL } from "@/lib/titles";
import { rerank } from "./rerank";

export type JobCard = {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  url: string;
  postedAt: string | null;
  score: number;
  reasons: string[];
  badge: SponsorBadge;
  /** Model's one-line fit explanation and biggest gap (UK/EU matching). */
  why?: string | null;
  gap?: string | null;
  /** Credit for aggregated feeds, required by their terms. */
  via?: { name: string; url: string } | null;
};

type JobRow = { id: string; title: string; company: string; company_id: string | null; location: string; remote: boolean; url: string; description: string; posted_at: string | null; jd_sponsorship: JdSponsorship; family: string };
type CompanyRow = { id: string; fiscal_year: number; total_filings: number; by_family: SponsorStats["byFamily"]; last_filed: string | null };

const db = () => createAdminInsForge().database;

export const statsOf = (c: CompanyRow | undefined): SponsorStats | null =>
  c ? { fiscalYear: c.fiscal_year, total: c.total_filings, byFamily: c.by_family, lastFiled: c.last_filed } : null;

export async function companiesById(ids: string[]): Promise<Map<string, CompanyRow>> {
  const out = new Map<string, CompanyRow>();
  const uniq = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 200) {
    const { data } = await db().from("companies").select("id,fiscal_year,total_filings,by_family,last_filed").in("id", uniq.slice(i, i + 200));
    for (const c of (data ?? []) as CompanyRow[]) out.set(c.id, c);
  }
  return out;
}

const FILLER = new Set(["full", "time", "fulltime", "full-time", "part", "role", "roles", "job", "jobs", "position", "positions", "opening", "openings", "us", "usa", "remote", "new", "grad", "level", "entry"]);

/** "backend full-time roles" → ["backend"]. Each remaining word must appear in the title. */
export function keywordTerms(keyword: string | undefined): string[] {
  return (keyword ?? "")
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((w) => w.length >= 2 && !FILLER.has(w))
    .slice(0, 3);
}

export type FindResult = { cards: JobCard[]; blocked: number; poolSize: number };

/**
 * Ranks fresh, unseen US jobs for this user or guest and records the ones shown (which is what
 * counts against the free quota). Nobody gets more than their remaining allowance.
 */
export type FindOpts = { count: number; remoteOnly?: boolean; keyword?: string; country?: string; resume?: string };

export async function findJobs(store: Store, row: ProfileRow, pro: boolean, usage: Usage, opts: FindOpts): Promise<FindResult> {
  if (isMarketProfile(row) || opts.country || !row.visa_status) return findMarketJobs(store, row, pro, usage, opts);
  const seenIds = await store.seenJobIds();

  let q = db().from("jobs").select("id,title,company,company_id,location,remote,url,description,posted_at,jd_sponsorship,family").eq("active", true).eq("is_us", true);
  if (row.target_families.length) q = q.in("family", row.target_families);
  if (row.needs_sponsorship) q = q.or("jd_sponsorship.is.null,jd_sponsorship.eq.yes");
  if (opts.remoteOnly) q = q.eq("remote", true);
  for (const word of keywordTerms(opts.keyword)) q = q.ilike("title", `%${word}%`);
  const { data, error } = await q.order("posted_at", { ascending: false, nullsFirst: false }).limit(600);
  if (error) throw new Error(error.message);
  const student = row.visa_status === "f1_student";
  const pool = ((data ?? []) as JobRow[]).filter((j) => !seenIds.has(j.id) && (student || !isInternTitle(j.title)));

  const companies = await companiesById(pool.map((j) => j.company_id ?? ""));
  const byJob = new Map(pool.map((j) => [j.id, j]));
  const lite: JobLite[] = pool.map((j) => ({ id: j.id, title: j.title, company: j.id, location: j.location, remote: j.remote, description: j.description, postedAt: j.posted_at, jdSponsorship: j.jd_sponsorship }));
  // `company` carries the job id so the sponsor lookup can resolve through the job's company_id.
  const ranked: Scored[] = rankJobs(lite, toMatchProfile(row), (jobId) => statsOf(companies.get(byJob.get(jobId)?.company_id ?? "")));

  const diverse = diversify(ranked, byJob);

  const { show, blocked } = canShowJobs(usage, pro, Math.min(opts.count, diverse.length), store.jobLimit);
  const picked = diverse.slice(0, show);
  await store.recordShown(picked.map((s) => ({ jobId: s.job.id, score: s.score, reasons: s.reasons })));
  const cards = picked.map((s) => {
    const j = byJob.get(s.job.id)!;
    return {
      id: j.id, title: j.title, company: j.company, location: j.location, remote: j.remote, url: j.url, postedAt: j.posted_at,
      score: s.score, reasons: s.reasons, badge: jobBadge(statsOf(companies.get(j.company_id ?? "")), s.family, j.jd_sponsorship),
    };
  });
  return { cards, blocked, poolSize: diverse.length };
}

/**
 * At most 2 jobs per company and one per (company, title) in a batch, so results aren't one
 * employer's whole board or the same req listed in several cities.
 */
function diversify<S extends Scored>(ranked: S[], byJob: Map<string, { company: string; title: string }>): S[] {
  const perCo = new Map<string, number>();
  const seenTitles = new Set<string>();
  return ranked.filter((s) => {
    const j = byJob.get(s.job.id)!;
    const co = j.company.toLowerCase();
    const titleKey = `${co}|${j.title.toLowerCase()}`;
    const n = perCo.get(co) ?? 0;
    if (n >= 2 || seenTitles.has(titleKey)) return false;
    perCo.set(co, n + 1);
    seenTitles.add(titleKey);
    return true;
  });
}

type MarketJobRow = JobRow & { country: string | null; remote_scope: string | null; licence_id: string | null; source: string; seniority: string | null };
type LicenceRow = { id: string; country: Market; rating: string | null; routes: string[]; permits: Record<string, number> };

export async function licencesById(ids: string[]): Promise<Map<string, LicenceProof>> {
  const out = new Map<string, LicenceProof>();
  const uniq = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 200) {
    const { data } = await db().from("sponsor_licences").select("id,country,rating,routes,permits").in("id", uniq.slice(i, i + 200));
    for (const l of (data ?? []) as LicenceRow[]) out.set(l.id, { country: l.country, rating: l.rating, routes: l.routes, permits: l.permits });
  }
  return out;
}

/** Short reason chip for a register-backed job ("on the UK sponsor register"). */
function licenceReason(l: LicenceProof): string {
  return l.country === "GB" ? "on the UK sponsor register" : l.country === "NL" ? "recognised Dutch sponsor" : "issues Irish work permits";
}

/**
 * UK / Netherlands / Ireland + remote matching. Filters out jobs the person can't legally take,
 * scores fit, visa evidence and freshness, then lets a model rerank the top of the list against
 * the full resume. Records what was shown (that's what counts against the free quota).
 */
async function findMarketJobs(store: Store, row: ProfileRow, pro: boolean, usage: Usage, opts: FindOpts): Promise<FindResult> {
  const seenIds = await store.seenJobIds();
  const profile = toMatchProfile(row);
  const rights = workRights(profile.work ?? { citizenship: null, visaCountry: null, visaSituation: null });
  const wanted = opts.country && (MARKETS as string[]).includes(opts.country) ? [opts.country] : (row.target_countries ?? []).filter((c) => (MARKETS as string[]).includes(c));
  const targets = wanted.length ? wanted : row.visa_country && (MARKETS as string[]).includes(row.visa_country) ? [row.visa_country] : MARKETS;

  let q = db().from("jobs").select("id,title,company,company_id,location,remote,url,description,posted_at,jd_sponsorship,family,country,remote_scope,licence_id,source,seniority").eq("active", true);
  q = opts.country ? q.eq("country", opts.country) : q.or(`country.in.(${targets.join(",")}),remote_scope.in.(anywhere,europe)`);
  if (row.target_families.length) q = q.in("family", row.target_families);
  if (opts.remoteOnly || row.wants_remote === "remote") q = q.eq("remote", true);
  if (row.years_experience < 3) q = q.neq("seniority", "senior");
  for (const word of keywordTerms(opts.keyword)) q = q.ilike("title", `%${word}%`);
  const { data, error } = await q.order("posted_at", { ascending: false, nullsFirst: false }).limit(800);
  if (error) throw new Error(error.message);

  const student = row.visa_situation === "student";
  const pool = ((data ?? []) as MarketJobRow[]).filter((j) => !seenIds.has(j.id) && (student || j.seniority !== "intern"));
  const licences = await licencesById(pool.map((j) => j.licence_id ?? ""));
  const byJob = new Map(pool.map((j) => [j.id, j]));

  const visaOf = new Map<string, { badge: SponsorBadge }>();
  const scored: Scored[] = [];
  for (const j of pool) {
    const market = (MARKETS as string[]).includes(j.country ?? "") ? (j.country as Market) : null;
    const right = j.remote ? remoteRight(j.remote_scope, j.country, rights) : market ? rights[market] : "sponsor";
    const licence = j.licence_id ? licences.get(j.licence_id) ?? null : null;
    const fit = jobVisaFit(market ?? "NL", right, licence, j.jd_sponsorship);
    if (fit === "blocked") continue;
    const reason = right !== "free" && licence && fit === "ok_licensed" ? licenceReason(licence) : null;
    const lite: JobLite = { id: j.id, title: j.title, company: j.company, location: j.location, remote: j.remote, description: j.description, postedAt: j.posted_at, jdSponsorship: j.jd_sponsorship };
    scored.push(scoreJob(lite, profile, null, Date.now(), { fit, right, reason }));
    visaOf.set(j.id, { badge: visaBadge(fit, right, market, licence, j.remote) });
  }
  scored.sort((a, b) => b.score - a.score || a.job.id.localeCompare(b.job.id));
  const diverse = diversify(scored, byJob);

  // The model only judges the top of the list: enough to choose `count` well, cheap enough per call.
  const head = diverse.slice(0, Math.max(opts.count * 4, 16));
  const prefs = [
    `roles: ${row.target_families.map((f) => FAMILY_LABEL[f as keyof typeof FAMILY_LABEL] ?? f).join(", ") || "open"}`,
    `${row.years_experience} years experience`,
    `countries: ${targets.map((c) => MARKET_NAME[c as Market]).join(", ")}`,
    row.wants_remote !== "any" ? `prefers ${row.wants_remote}` : "",
  ].filter(Boolean).join("; ");
  const verdicts = await rerank(opts.resume ?? "", prefs, head.map((s) => byJob.get(s.job.id)!));
  const ordered = [...blendRerank(head, verdicts), ...diverse.slice(head.length)];

  const { show, blocked } = canShowJobs(usage, pro, Math.min(opts.count, ordered.length), store.jobLimit);
  const picked = ordered.slice(0, show);
  await store.recordShown(picked.map((s: Scored & { why?: string }) => ({ jobId: s.job.id, score: s.score, reasons: s.reasons, why: s.why ?? null })));
  const cards: JobCard[] = picked.map((s: Scored & { why?: string; gap?: string | null }) => {
    const j = byJob.get(s.job.id)!;
    return {
      id: j.id, title: j.title, company: j.company, location: j.location, remote: j.remote, url: j.url, postedAt: j.posted_at,
      score: s.score, reasons: s.reasons, badge: visaOf.get(j.id)!.badge, why: s.why ?? null, gap: s.gap ?? null,
      via: SOURCE_CREDIT[j.source] ?? null,
    };
  });
  return { cards, blocked, poolSize: ordered.length };
}

export async function loadJob(jobId: string) {
  const { data } = await db().from("jobs").select("id,title,company,company_id,location,remote,url,description,posted_at,jd_sponsorship,family").eq("id", jobId).maybeSingle();
  return data as JobRow | null;
}
