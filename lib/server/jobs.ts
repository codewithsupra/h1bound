import "server-only";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { rankJobs, type JobLite, type Scored } from "@/lib/match";
import { canShowJobs } from "@/lib/quota";
import { isInternTitle } from "@/lib/titles";
import { jobBadge, type SponsorBadge, type SponsorStats } from "@/lib/sponsor";
import type { JdSponsorship } from "@/lib/jd-signals";
import { toMatchProfile, type ProfileRow } from "./profile";

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
 * Ranks fresh, unseen US jobs for this user and records the ones shown (which is what counts
 * against the free quota). Free users never get more than their remaining allowance.
 */
export async function findJobs(userId: string, row: ProfileRow, pro: boolean, usage: { jobsShown: number; reviewedJobIds: string[]; reviewRounds: number }, opts: { count: number; remoteOnly?: boolean; keyword?: string }): Promise<FindResult> {
  const { data: seen } = await db().from("matches").select("job_id").eq("user_id", userId);
  const seenIds = new Set(((seen ?? []) as { job_id: string }[]).map((s) => s.job_id));

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

  // At most 2 jobs per company and one per (company, title) in a batch, so results aren't one
  // employer's whole board or the same req listed in several cities.
  const perCo = new Map<string, number>();
  const seenTitles = new Set<string>();
  const diverse = ranked.filter((s) => {
    const j = byJob.get(s.job.id)!;
    const titleKey = `${j.company}|${j.title.toLowerCase()}`;
    const n = perCo.get(j.company) ?? 0;
    if (n >= 2 || seenTitles.has(titleKey)) return false;
    perCo.set(j.company, n + 1);
    seenTitles.add(titleKey);
    return true;
  });

  const { show, blocked } = canShowJobs(usage, pro, Math.min(opts.count, diverse.length));
  const picked = diverse.slice(0, show);
  if (picked.length) {
    const { error: e } = await db().from("matches").upsert(
      picked.map((s) => ({ user_id: userId, job_id: s.job.id, score: s.score, reasons: s.reasons })),
      { onConflict: "user_id,job_id", ignoreDuplicates: true },
    );
    if (e) throw new Error(e.message);
  }
  const cards = picked.map((s) => {
    const j = byJob.get(s.job.id)!;
    return {
      id: j.id, title: j.title, company: j.company, location: j.location, remote: j.remote, url: j.url, postedAt: j.posted_at,
      score: s.score, reasons: s.reasons, badge: jobBadge(statsOf(companies.get(j.company_id ?? "")), s.family, j.jd_sponsorship),
    };
  });
  return { cards, blocked, poolSize: diverse.length };
}

export async function loadJob(jobId: string) {
  const { data } = await db().from("jobs").select("id,title,company,company_id,location,remote,url,description,posted_at,jd_sponsorship,family").eq("id", jobId).maybeSingle();
  return data as JobRow | null;
}

/** Jobs the user has actually been shown (only those can be reviewed / emailed about). */
export async function userHasJob(userId: string, jobId: string) {
  const { data } = await db().from("matches").select("job_id").eq("user_id", userId).eq("job_id", jobId).maybeSingle();
  return Boolean(data);
}
