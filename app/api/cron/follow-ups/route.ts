import { NextResponse, type NextRequest } from "next/server";
import { runDueFollowUps } from "@/lib/server/followups";
import { trackRun } from "@/lib/server/ops";

export const maxDuration = 300;

/** Hourly (scheduled workflow, Bearer CRON_SECRET): sends the follow-ups students approved that are now due. */
export async function POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const out = await trackRun("follow-ups", {}, () => runDueFollowUps(), (r) => ({ jobs: r.sent, boards: r.due, failed: r.gaveUp, stats: r }));
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
