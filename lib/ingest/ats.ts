/**
 * Public job-board APIs (no auth, no scraping): Greenhouse, Lever, Ashby. Each normalizer turns a
 * raw posting into one `NormalizedJob`; fetchers are thin and injectable for tests.
 */

import { isUsLocation, jdSponsorship, type JdSponsorship } from "../jd-signals";

export type AtsKind = "greenhouse" | "lever" | "ashby";

export type NormalizedJob = {
  source: AtsKind;
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

function finish(j: Omit<NormalizedJob, "jdSponsorship" | "isUs" | "description"> & { description: string }): NormalizedJob {
  const description = j.description.slice(0, MAX_DESC);
  return { ...j, title: j.title.trim(), description, jdSponsorship: jdSponsorship(description), isUs: isUsLocation(j.location) || (j.remote && /\b(us|usa|united states)\b/i.test(j.location)) };
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

export const BOARD_URL: Record<AtsKind, (board: string) => string> = {
  greenhouse: (b) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(b)}/jobs?content=true`,
  lever: (b) => `https://api.lever.co/v0/postings/${encodeURIComponent(b)}?mode=json`,
  ashby: (b) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(b)}`,
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
  return ((body as { jobs?: AshbyJob[] }).jobs ?? []).filter((j) => j.isListed !== false).map((j) => fromAshby(board, company, j));
}

/** Candidate board slugs to probe for a company name: "Scale AI" → ["scaleai", "scale-ai", "scale"]. */
export function boardSlugs(company: string): string[] {
  const words = company.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  const out = [words.join(""), words.join("-"), words[0]];
  return [...new Set(out.filter((s) => s && s.length >= 2))];
}
