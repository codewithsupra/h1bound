import { fetchBoard, type AtsKind, type NormalizedJob } from "./ats";
import { titleFamily } from "../titles";
import { prettyCompany } from "../employer";

/**
 * Pulls every resolved board, upserts US jobs, and deactivates postings that disappeared.
 * Shared by the daily cron route and scripts/refresh-jobs.mts.
 */

type Db = { from(table: string): any }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Board = { id: string; board_kind: AtsKind; board_slug: string; display_name: string | null; name: string };

export function toRow(j: NormalizedJob, companyId: string, now: string) {
  return {
    source: j.source, source_id: j.sourceId, company_id: companyId, company: prettyCompany(j.company), title: j.title, family: titleFamily(j.title),
    location: j.location, remote: j.remote, is_us: j.isUs, url: j.url, description: j.description, posted_at: j.postedAt,
    jd_sponsorship: j.jdSponsorship, active: true, last_seen: now,
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

export async function refreshAll(db: Db, opts: { concurrency?: number; shard?: number; of?: number; log?: (s: string) => void } = {}) {
  const log = opts.log ?? (() => {});
  const { data, error } = await db.from("companies").select("id,board_kind,board_slug,display_name,name").not("board_kind", "is", null);
  if (error) throw new Error(error.message);
  const boards = (data as Board[]).filter((b) => inShard(b.id, opts.shard ?? 0, opts.of ?? 1));
  const queue = [...boards];
  let jobs = 0, failed = 0;

  await Promise.all(Array.from({ length: opts.concurrency ?? 3 }, async () => {
    for (let b = queue.shift(); b; b = queue.shift()) {
      const runStart = new Date().toISOString();
      try {
        const list = await withRetry(() => fetchBoard(b.board_kind, b.board_slug, b.display_name ?? b.name));
        if (!list) continue;
        const rows = list.filter((j) => j.isUs).map((j) => toRow(j, b.id, runStart));
        for (let i = 0; i < rows.length; i += CHUNK) {
          await withRetry(async () => {
            const { error: e } = await db.from("jobs").upsert(rows.slice(i, i + CHUNK), { onConflict: "source,source_id" });
            if (e) throw new Error(e.message);
          });
        }
        // Only reached when every batch landed, so a failed board never loses its live jobs.
        await withRetry(async () => {
          const { error: e } = await db.from("jobs").update({ active: false }).eq("company_id", b.id).lt("last_seen", runStart);
          if (e) throw new Error(e.message);
        });
        jobs += rows.length;
        log(`${b.display_name ?? b.name}: ${rows.length} US jobs`);
      } catch (e) {
        failed++;
        log(`! ${b.board_kind}/${b.board_slug}: ${(e as Error).message}`);
      }
    }
  }));
  return { boards: boards.length, jobs, failed };
}
