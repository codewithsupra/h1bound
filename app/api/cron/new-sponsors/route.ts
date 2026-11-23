import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import { discoverBoards, type Lic } from "@/lib/ingest/discover";
import { trackRun } from "@/lib/server/ops";

export const maxDuration = 300;

/**
 * Weekly, after the register imports (scheduled workflow, Bearer CRON_SECRET): looks for public job
 * boards for employers that are new on the UK or Dutch register, so the next job refresh picks up
 * their roles and the digest can say "3 open roles in your field". Stops before the time limit; any
 * left over are checked next week (or by scripts/resolve-licence-boards.mts).
 */
export async function POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  try {
    const out = await trackRun("new-sponsors", {}, async () => {
      const db = adminDb();
      const since = new Date(Date.now() - 8 * 86_400_000).toISOString().slice(0, 10);
      const { data, error } = await db.from("sponsor_licences").select("id,country,name,permits")
        .in("country", ["GB", "NL"]).eq("listed", true).not("first_listed", "is", null).gte("first_listed", since).is("board_checked_at", null).limit(2000);
      if (error) throw new Error(error.message);
      const r = await discoverBoards(db, (data ?? []) as Lic[], { concurrency: 30, deadline: started + 240_000 });
      return { candidates: (data ?? []).length, ...r };
    }, (r) => ({ boards: r.done, jobs: r.found, stats: r }));
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
