import { fetchBoard, keepJob, MARKET_COUNTRIES, type AtsKind, type NormalizedJob } from "./ats";
import { fetchHimalayas, fetchRemoteOk } from "./feeds";
import { licenceKey } from "./registers";
import { titleFamily } from "../titles";
import { prettyCompany } from "../employer";

/**
 * Pulls every resolved board (US sponsors in `companies`, UK/NL/IE sponsors in `sponsor_licences`),
 * upserts jobs in our markets, links each one to its register entry, and deactivates postings that
 * disappeared. Shared by the daily cron route and scripts/refresh-jobs.mts.
 */

type Db = { from(table: string): any }; // eslint-disable-line @typescript-eslint/no-explicit-any
export type JobLink = { companyId: string | null; licenceId: string | null };

export function toRow(j: NormalizedJob, link: JobLink, now: string) {
  return {
    source: j.source, source_id: j.sourceId, company_id: link.companyId, licence_id: link.licenceId, company: prettyCompany(j.company), title: j.title,
    family: titleFamily(j.title), location: j.location, remote: j.remote, is_us: j.isUs, country: j.country, remote_scope: j.remoteScope,
    seniority: j.seniority, url: j.url, description: j.description, posted_at: j.postedAt, jd_sponsorship: j.jdSponsorship, active: true, last_seen: now,
  };
}

const CHUNK = 100; // job descriptions are large; big batches time out on a small DB instance

/** Retries transient failures (timeouts, schema-cache reloads) with backoff: 1s, 3s. */
export async function withRetry<T>(fn: () => Promise<T>, tries = 3, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < tries - 1) await sleep(1000 * (2 * i + 1));
    }
  }
  throw last;
}

/** Stable bucket for a company id, so each cron shard always owns the same boards. */
export function inShard(id: string, shard: number, of: number): boolean {
  return of <= 1 || parseInt(id.replace(/-/g, "").slice(0, 8), 16) % of === shard;
}

/** `${country}:${key}` → sponsor_licences.id, for the employer names we're about to see. */
export type LicenceIndex = Map<string, string>;

export async function loadLicenceIndex(db: Db, names: string[]): Promise<LicenceIndex> {
  const keys = [...new Set(names.map(licenceKey).filter(Boolean))];
  const idx: LicenceIndex = new Map();
  for (let i = 0; i < keys.length; i += 150) {
    const { data, error } = await db.from("sponsor_licences").select("id,country,key").in("key", keys.slice(i, i + 150)).eq("listed", true);
    if (error) throw new Error(`licence index: ${error.message}`);
    for (const r of data as { id: string; country: string; key: string }[]) idx.set(`${r.country}:${r.key}`, r.id);
  }
  return idx;
}

/** The register entry for a job: the board's own licence when the countries agree, else a name match in the job's country. */
export function licenceFor(j: NormalizedJob, names: string[], idx: LicenceIndex, own?: { id: string; country: string } | null): string | null {
  if (!j.country || !MARKET_COUNTRIES.has(j.country)) return null;
  if (own && own.country === j.country) return own.id;
  for (const n of [j.company, ...names]) {
    const id = idx.get(`${j.country}:${licenceKey(n)}`);
    if (id) return id;
  }
  return null;
}

type Board = { id: string; kind: AtsKind; slug: string; label: string; names: string[]; companyId: string | null; licence: { id: string; country: string } | null };

/** Boards from both tables, merged when a US sponsor and a register entry share one board. */
async function loadBoards(db: Db): Promise<Board[]> {
  const out = new Map<string, Board>();
  const { data: us, error } = await db.from("companies").select("id,board_kind,board_slug,display_name,name").not("board_kind", "is", null);
  if (error) throw new Error(error.message);
  for (const c of us as { id: string; board_kind: AtsKind; board_slug: string; display_name: string | null; name: string }[]) {
    out.set(`${c.board_kind}:${c.board_slug}`, { id: c.id, kind: c.board_kind, slug: c.board_slug, label: c.display_name ?? c.name, names: [c.name, c.display_name ?? ""].filter(Boolean), companyId: c.id, licence: null });
  }
  for (let from = 0; ; from += 1000) {
    const { data, error: e } = await db.from("sponsor_licences").select("id,country,board_kind,board_slug,display_name,name").not("board_kind", "is", null).order("id").range(from, from + 999);
    if (e) throw new Error(e.message);
    const rows = data as { id: string; country: string; board_kind: AtsKind; board_slug: string; display_name: string | null; name: string }[];
    for (const l of rows) {
      const k = `${l.board_kind}:${l.board_slug}`;
      const prev = out.get(k);
      if (prev) { prev.licence ??= { id: l.id, country: l.country }; prev.names.push(l.name); continue; }
      out.set(k, { id: l.id, kind: l.board_kind, slug: l.board_slug, label: l.display_name ?? l.name, names: [l.name, l.display_name ?? ""].filter(Boolean), companyId: null, licence: { id: l.id, country: l.country } });
    }
    if (rows.length < 1000) break;
  }
  return [...out.values()];
}

/** LIKE pattern for every job id from one board ("stripe:%"), with LIKE wildcards in the slug escaped. */
export const boardPattern = (slug: string) => `${slug.replace(/[\\%_]/g, (c) => `\\${c}`)}:%`;

async function upsertJobs(db: Db, rows: ReturnType<typeof toRow>[]) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await withRetry(async () => {
      const { error: e } = await db.from("jobs").upsert(rows.slice(i, i + CHUNK), { onConflict: "source,source_id" });
      if (e) throw new Error(e.message);
    });
  }
}

export async function refreshAll(db: Db, opts: { concurrency?: number; shard?: number; of?: number; log?: (s: string) => void } = {}) {
  const log = opts.log ?? (() => {});
  const boards = (await loadBoards(db)).filter((b) => inShard(b.id, opts.shard ?? 0, opts.of ?? 1));
  const idx = await loadLicenceIndex(db, boards.flatMap((b) => b.names));
  const queue = [...boards];
  let jobs = 0, failed = 0;

  await Promise.all(Array.from({ length: opts.concurrency ?? 3 }, async () => {
    for (let b = queue.shift(); b; b = queue.shift()) {
      const runStart = new Date().toISOString();
      try {
        const list = await withRetry(() => fetchBoard(b.kind, b.slug, b.label));
        if (!list) continue;
        const rows = list.filter(keepJob).map((j) => toRow(j, { companyId: b.companyId, licenceId: licenceFor(j, b.names, idx, b.licence) }, runStart));
        await upsertJobs(db, rows);
        // Only reached when every batch landed, so a failed board never loses its live jobs.
        await withRetry(async () => {
          const { error: e } = await db.from("jobs").update({ active: false }).eq("source", b.kind).like("source_id", boardPattern(b.slug)).lt("last_seen", runStart);
          if (e) throw new Error(e.message);
        });
        jobs += rows.length;
        log(`${b.label}: ${rows.length} jobs`);
      } catch (e) {
        failed++;
        log(`! ${b.kind}/${b.slug}: ${(e as Error).message}`);
      }
    }
  }));
  return { boards: boards.length, jobs, failed };
}

/**
 * Remote-job feeds. A feed that returns suspiciously few jobs is treated as a failure, so a bad
 * response never deactivates the whole feed.
 */
export async function refreshFeeds(db: Db, opts: { log?: (s: string) => void; maxPages?: number } = {}) {
  const log = opts.log ?? (() => {});
  const out: Record<string, number | string> = {};
  for (const [source, pull] of [["himalayas", () => fetchHimalayas({ maxPages: opts.maxPages })], ["remoteok", () => fetchRemoteOk()]] as const) {
    const runStart = new Date().toISOString();
    try {
      const list = (await pull()).filter(keepJob);
      if (list.length < 20) throw new Error(`only ${list.length} jobs; keeping yesterday's`);
      const idx = await loadLicenceIndex(db, list.map((j) => j.company));
      await upsertJobs(db, list.map((j) => toRow(j, { companyId: null, licenceId: licenceFor(j, [], idx) }, runStart)));
      const { error } = await db.from("jobs").update({ active: false }).eq("source", source).lt("last_seen", runStart);
      if (error) throw new Error(error.message);
      out[source] = list.length;
      log(`${source}: ${list.length} jobs`);
    } catch (e) {
      out[source] = `failed: ${(e as Error).message}`;
      log(`! ${source}: ${(e as Error).message}`);
    }
  }
  return out;
}
