/**
 * Public job-board APIs (no auth, no scraping): Greenhouse, Lever, Ashby, Recruitee. Each normalizer
 * turns a raw posting into one `NormalizedJob`; fetchers are thin and injectable for tests.
 */

import { isUsLocation, jdSponsorship, type JdSponsorship } from "../jd-signals";
import { countriesIn, remoteScope, type RemoteScope } from "../geo";
import { seniority, type Seniority } from "../titles";

export type AtsKind = "greenhouse" | "lever" | "ashby" | "recruitee";
/** Aggregated remote-job feeds; every job from them is shown with a credit link to the source. */
export type FeedKind = "himalayas" | "remoteok";
export type JobSource = AtsKind | FeedKind;

export type NormalizedJob = {
  source: JobSource;
  sourceId: string; // `${board}:${id}` — unique per source
  board: string;
  company: string;
  title: string;
  location: string;
  remote: boolean;
  url: string;
  description: string; // plain text, trimmed to MAX_DESC
  postedAt: string | null;
  jdSponsorship: JdSponsorship;
  isUs: boolean;
  /** GB / NL / IE / US when the location names one; for remote jobs, the one country they're limited to. */
  country: string | null;
  /** Where a remote job can be done from; null for on-site jobs. */
  remoteScope: RemoteScope | null;
  seniority: Seniority;
};

const MAX_DESC = 12_000;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

export function htmlToText(html: string): string {
  const decoded = html.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, e) => ENTITIES[e]);
  return decoded
    .replace(/<(br|\/p|\/li|\/h\d|\/div)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, e) => ENTITIES[e])
    .replace(/[ \t ]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

type Raw = Omit<NormalizedJob, "jdSponsorship" | "isUs" | "country" | "remoteScope" | "seniority"> & { country?: string | null };

export function finish(j: Raw): NormalizedJob {
  const description = j.description.slice(0, MAX_DESC);
  const countries = countriesIn(j.location);
  const isUs = isUsLocation(j.location) || (j.remote && /\b(us|usa|united states)\b/i.test(j.location));
  const country = j.country ?? (countries.length === 1 ? countries[0] : countries.find((c) => c !== "US") ?? (isUs && !j.remote ? "US" : null));
  return {
    ...j, title: j.title.trim(), description, jdSponsorship: jdSponsorship(description), isUs,
    country, remoteScope: j.remote ? remoteScope(j.location) : null, seniority: seniority(j.title),
  };
}

/** Jobs worth keeping: the US (existing users), our European markets, and remote roles open to Europe. */
export const MARKET_COUNTRIES = new Set(["GB", "NL", "IE"]);
export function keepJob(j: NormalizedJob): boolean {
  if (j.isUs) return true;
  if (j.country && MARKET_COUNTRIES.has(j.country)) return true;
  return j.remote && (j.remoteScope === "anywhere" || j.remoteScope === "europe");
}

type GhJob = { id: number | string; title: string; absolute_url: string; location?: { name?: string }; content?: string; first_published?: string; updated_at?: string; company_name?: string };
export function fromGreenhouse(board: string, company: string, j: GhJob): NormalizedJob {
  const location = j.location?.name ?? "";
  return finish({
    source: "greenhouse", sourceId: `${board}:${j.id}`, board, company: j.company_name || company, title: j.title, location,
    remote: /remote/i.test(location), url: j.absolute_url, description: htmlToText(j.content ?? ""), postedAt: j.first_published ?? j.updated_at ?? null,
  });
}

type LeverJob = { id: string; text: string; hostedUrl: string; categories?: { location?: string; commitment?: string }; workplaceType?: string; createdAt?: number; descriptionPlain?: string; additionalPlain?: string; lists?: { text: string; content: string }[] };
export function fromLever(board: string, company: string, j: LeverJob): NormalizedJob {
  const location = j.categories?.location ?? "";
  const lists = (j.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`).join("\n");
  return finish({
    source: "lever", sourceId: `${board}:${j.id}`, board, company, title: j.text, location,
    remote: j.workplaceType === "remote" || /remote/i.test(location), url: j.hostedUrl,
    description: [j.descriptionPlain, lists, j.additionalPlain].filter(Boolean).join("\n"), postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
  });
}

type AshbyJob = { id: string; title: string; jobUrl: string; location?: string; isRemote?: boolean; workplaceType?: string; publishedAt?: string; descriptionPlain?: string; isListed?: boolean };
export function fromAshby(board: string, company: string, j: AshbyJob): NormalizedJob {
  const location = j.location ?? "";
  return finish({
    source: "ashby", sourceId: `${board}:${j.id}`, board, company, title: j.title, location,
    remote: Boolean(j.isRemote) || j.workplaceType === "Remote", url: j.jobUrl, description: j.descriptionPlain ?? "", postedAt: j.publishedAt ?? null,
  });
}

type RecruiteeOffer = {
  id: number; title: string; careers_url: string; location?: string; city?: string; country_code?: string; remote?: boolean;
  description?: string; requirements?: string; published_at?: string; company_name?: string; status?: string;
};
export function fromRecruitee(board: string, company: string, j: RecruiteeOffer): NormalizedJob {
  const location = j.location || [j.city, j.country_code].filter(Boolean).join(", ");
  const code = j.country_code?.toUpperCase() || null;
  return finish({
    source: "recruitee", sourceId: `${board}:${j.id}`, board, company: j.company_name || company, title: j.title, location,
    remote: Boolean(j.remote) || /remote/i.test(location), url: j.careers_url,
    description: [htmlToText(j.description ?? ""), htmlToText(j.requirements ?? "")].filter(Boolean).join("\n"),
    postedAt: j.published_at ? new Date(j.published_at.replace(" UTC", "Z").replace(" ", "T")).toISOString() : null,
    country: code === "UK" ? "GB" : code,
  });
}

export const BOARD_URL: Record<AtsKind, (board: string) => string> = {
  greenhouse: (b) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(b)}/jobs?content=true`,
  lever: (b) => `https://api.lever.co/v0/postings/${encodeURIComponent(b)}?mode=json`,
  ashby: (b) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(b)}`,
  recruitee: (b) => `https://${encodeURIComponent(b)}.recruitee.com/api/offers/`,
};

type Fetch = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Fetches and normalizes one board. Returns null when the board doesn't exist (404). */
export async function fetchBoard(kind: AtsKind, board: string, company: string, f: Fetch = fetch): Promise<NormalizedJob[] | null> {
  const res = await f(BOARD_URL[kind](board));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${kind}:${board} HTTP ${res.status}`);
  const body = (await res.json()) as unknown;
  if (kind === "greenhouse") return ((body as { jobs?: GhJob[] }).jobs ?? []).map((j) => fromGreenhouse(board, company, j));
  if (kind === "lever") return (Array.isArray(body) ? (body as LeverJob[]) : []).map((j) => fromLever(board, company, j));
  if (kind === "recruitee") return ((body as { offers?: RecruiteeOffer[] }).offers ?? []).filter((j) => !j.status || j.status === "published").map((j) => fromRecruitee(board, company, j));
  return ((body as { jobs?: AshbyJob[] }).jobs ?? []).filter((j) => j.isListed !== false).map((j) => fromAshby(board, company, j));
}

/** Candidate board slugs to probe for a company name: "Scale AI" → ["scaleai", "scale-ai", "scale"]. */
export function boardSlugs(company: string): string[] {
  const words = company.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  const out = [words.join(""), words.join("-"), words[0]];
  return [...new Set(out.filter((s) => s && s.length >= 2))];
}
