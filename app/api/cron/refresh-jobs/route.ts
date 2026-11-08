import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import { refreshAll, refreshFeeds } from "@/lib/ingest/refresh";
import { trackRun } from "@/lib/server/ops";

export const maxDuration = 300;

/**
 * Daily job refresh, called by the scheduled workflow with `Authorization: Bearer ${CRON_SECRET}`.
 * `?shard=i&of=n` splits the boards so each call fits in maxDuration; `?feeds=1` pulls the remote-job feeds instead.
 */
export async function POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = adminDb();
  if (req.nextUrl.searchParams.get("feeds") === "1") {
    const out = await trackRun("refresh-feeds", {}, () => refreshFeeds(db), (r) => {
      const bad = Object.values(r).filter((v) => typeof v === "string").length;
      return { boards: Object.keys(r).length, failed: bad, jobs: Object.values(r).reduce<number>((a, v) => a + (typeof v === "number" ? v : 0), 0), stats: r };
    });
    return NextResponse.json(out);
  }
  const of = Math.max(1, Number(req.nextUrl.searchParams.get("of")) || 1);
  const shard = Number(req.nextUrl.searchParams.get("shard")) || 0;
  if (shard < 0 || shard >= of) return NextResponse.json({ error: "bad shard" }, { status: 400 });
  const result = await trackRun("refresh-jobs", { shard, of }, async (rec) => {
    const r = await refreshAll(db, { concurrency: 4, shard, of, onFailure: rec.failures });
    // One shard also deletes expired, unsaved postings so the database stays inside the free plan.
    const purged = shard === 0 ? (await db.rpc("purge_stale_jobs", { p_days: 30 })).data : null;
    return { ...r, purged: typeof purged === "number" ? purged : null };
  }, (r) => ({ boards: r.boards, failed: r.failed, jobs: r.jobs, stats: { purged: r.purged } }));
  return NextResponse.json(result);
}
