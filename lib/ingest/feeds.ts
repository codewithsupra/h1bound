import { finish, htmlToText, type NormalizedJob } from "./ats";
import { titleFamily } from "../titles";
import { SITE_NAME, SITE_URL } from "../site";

/**
 * Remote-job feeds. Both allow showing their jobs in an app on condition that each job links back
 * to its source page and credits the source by name (see SOURCE_CREDIT). Remotive is not used: its
 * terms forbid showing its jobs to collect sign-ups.
 */

export const SOURCE_CREDIT: Record<string, { name: string; url: string }> = {
  himalayas: { name: "Himalayas", url: "https://himalayas.app" },
  remoteok: { name: "Remote OK", url: "https://remoteok.com" },
};

type Fetch = (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const COUNTRY_CODE: Record<string, string> = { "United Kingdom": "GB", Netherlands: "NL", Ireland: "IE" };

/** Feed listings are noisy: non-English roles, tutoring gigs, and titles outside our fields. */
export function feedJobUseful(title: string): boolean {
  if (/\((m\/w\/d|m\/f\/d|w\/m\/d|h\/f|f\/h)\)|\b(mitarbeiter|vertrieb|praktikant|führungskraft|quereinsteiger|werkstudent)\b/i.test(title)) return false;
  if (/\b(tutor|tutoring|teacher|freelance writer|transcription|data entry|survey|mystery shopper|commission only)\b/i.test(title)) return false;
  return titleFamily(title) !== "other";
}

type HimalayasJob = {
  title: string; companyName: string; companySlug?: string; seniority?: string[]; locationRestrictions?: string[];
  description?: string; pubDate?: number | string; applicationLink: string; guid: string; employmentType?: string;
};

export function fromHimalayas(j: HimalayasJob): NormalizedJob {
  const restrictions = j.locationRestrictions ?? [];
  // Our markets first, and long lists shortened: "Remote (United Kingdom, Ireland + 48 more)".
  const ours = restrictions.filter((r) => COUNTRY_CODE[r]);
  const shown = [...ours, ...restrictions.filter((r) => !COUNTRY_CODE[r])].slice(0, 3);
  const more = restrictions.length - shown.length;
  const location = restrictions.length ? `Remote (${shown.join(", ")}${more > 0 ? ` + ${more} more` : ""})` : "Remote (Worldwide)";
  const codes = ours.map((r) => COUNTRY_CODE[r]);
  return finish({
    source: "himalayas", sourceId: `himalayas:${j.guid}`, board: "himalayas", company: j.companyName, title: j.title, location, remote: true,
    url: j.applicationLink, description: htmlToText(j.description ?? ""),
    postedAt: j.pubDate ? new Date(Number(j.pubDate) * 1000).toISOString() : null,
    // Open to several countries including ours: tag the UK first, since that's where most of our users are.
    country: codes.includes("GB") ? "GB" : codes[0] ?? null,
  });
}

type RemoteOkJob = { id: string | number; position?: string; company?: string; description?: string; location?: string; url?: string; date?: string; legal?: string };

export function fromRemoteOk(j: RemoteOkJob): NormalizedJob {
  const location = j.location?.trim() ? `Remote (${j.location.trim()})` : "Remote (Worldwide)";
  return finish({
    source: "remoteok", sourceId: `remoteok:${j.id}`, board: "remoteok", company: j.company ?? "", title: j.position ?? "", location, remote: true,
    url: j.url ?? `https://remoteok.com/remote-jobs/${j.id}`, description: htmlToText(j.description ?? ""), postedAt: j.date ?? null,
  });
}

const HIMALAYAS_SEARCH = "https://himalayas.app/jobs/api/search";
const SLEEP = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Entry- and mid-level remote jobs open to our markets or worldwide. Search pages hold 20 jobs;
 * `maxPages` caps each query so one run stays well inside the public rate limit.
 */
export async function fetchHimalayas(opts: { maxPages?: number; f?: Fetch; pause?: number } = {}): Promise<NormalizedJob[]> {
  const f = opts.f ?? (fetch as Fetch);
  const queries: string[] = [];
  for (const seniority of ["Entry-level", "Mid-level"]) {
    for (const country of Object.keys(COUNTRY_CODE)) queries.push(`country=${encodeURIComponent(country)}&exclude_worldwide=true&seniority=${seniority}`);
    queries.push(`worldwide=true&seniority=${seniority}`);
  }
  const seen = new Map<string, NormalizedJob>();
  for (const q of queries) {
    for (let page = 1; page <= (opts.maxPages ?? 10); page++) {
      const res = await f(`${HIMALAYAS_SEARCH}?${q}&sort=recent&page=${page}`);
      if (!res.ok) throw new Error(`himalayas ${q} page ${page}: HTTP ${res.status}`);
      const jobs = ((await res.json()) as { jobs?: HimalayasJob[] }).jobs ?? [];
      for (const j of jobs) if (feedJobUseful(j.title)) seen.set(j.guid, fromHimalayas(j));
      if (jobs.length < 20) break;
      await SLEEP(opts.pause ?? 700);
    }
  }
  return [...seen.values()];
}

/** Remote OK serves its whole recent feed in one call; the first element is the legal notice. */
export async function fetchRemoteOk(f: Fetch = fetch as Fetch): Promise<NormalizedJob[]> {
  const res = await f("https://remoteok.com/api", { headers: { "user-agent": `${SITE_NAME} job matcher (+${SITE_URL})` } });
  if (!res.ok) throw new Error(`remoteok: HTTP ${res.status}`);
  const body = (await res.json()) as RemoteOkJob[];
  return body.filter((j) => j.id && !j.legal && feedJobUseful(j.position ?? "")).map(fromRemoteOk);
}
