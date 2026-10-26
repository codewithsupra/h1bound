import { fetchBoard, type AtsKind, type NormalizedJob } from "./ats";
import { titleFamily } from "../titles";

/**
 * Pulls every resolved board, upserts US jobs, and deactivates postings that disappeared.
 * Shared by the daily cron route and scripts/refresh-jobs.mts.
 */

type Db = { from(table: string): any }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Board = { id: string; board_kind: AtsKind; board_slug: string; display_name: string | null; name: string };

export function toRow(j: NormalizedJob, companyId: string, now: string) {
  return {
    source: j.source, source_id: j.sourceId, company_id: companyId, company: j.company, title: j.title, family: titleFamily(j.title),
    location: j.location, remote: j.remote, is_us: j.isUs, url: j.url, description: j.description, posted_at: j.postedAt,
    jd_sponsorship: j.jdSponsorship, active: true, last_seen: now,
  };
}

export async function refreshAll(db: Db, opts: { concurrency?: number; log?: (s: string) => void } = {}) {
  const log = opts.log ?? (() => {});
  const { data, error } = await db.from("companies").select("id,board_kind,board_slug,display_name,name").not("board_kind", "is", null);
  if (error) throw new Error(error.message);
  const boards = data as Board[];
  const queue = [...boards];
  let jobs = 0, failed = 0;

  await Promise.all(Array.from({ length: opts.concurrency ?? 6 }, async () => {
    for (let b = queue.shift(); b; b = queue.shift()) {
      const runStart = new Date().toISOString();
      try {
        const list = await fetchBoard(b.board_kind, b.board_slug, b.display_name ?? b.name);
        if (!list) continue;
        const rows = list.filter((j) => j.isUs).map((j) => toRow(j, b.id, runStart));
        for (let i = 0; i < rows.length; i += 500) {
          const { error: e } = await db.from("jobs").upsert(rows.slice(i, i + 500), { onConflict: "source,source_id" });
          if (e) throw new Error(e.message);
        }
        await db.from("jobs").update({ active: false }).eq("company_id", b.id).lt("last_seen", runStart);
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
