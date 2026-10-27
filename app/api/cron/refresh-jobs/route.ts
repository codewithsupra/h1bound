import { NextResponse, type NextRequest } from "next/server";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { refreshAll } from "@/lib/ingest/refresh";

export const maxDuration = 300;

/** Daily job refresh, called by an InsForge schedule with `Authorization: Bearer ${CRON_SECRET}`. */
export async function POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await refreshAll(createAdminInsForge().database, { concurrency: 4 });
  return NextResponse.json(result);
}
