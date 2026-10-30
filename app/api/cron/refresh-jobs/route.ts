import { NextResponse, type NextRequest } from "next/server";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { refreshAll, refreshFeeds } from "@/lib/ingest/refresh";

export const maxDuration = 300;

/**
 * Daily job refresh, called by InsForge schedules with `Authorization: Bearer ${CRON_SECRET}`.
 * `?shard=i&of=n` splits the boards so each call fits in maxDuration; `?feeds=1` pulls the remote-job feeds instead.
 */
export async function POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createAdminInsForge().database;
  if (req.nextUrl.searchParams.get("feeds") === "1") return NextResponse.json(await refreshFeeds(db));
  const of = Math.max(1, Number(req.nextUrl.searchParams.get("of")) || 1);
  const shard = Number(req.nextUrl.searchParams.get("shard")) || 0;
  if (shard < 0 || shard >= of) return NextResponse.json({ error: "bad shard" }, { status: 400 });
  const result = await refreshAll(db, { concurrency: 4, shard, of });
  return NextResponse.json(result);
}
