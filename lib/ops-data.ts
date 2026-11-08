import { breaches, dailyCost, DEFAULT_THRESHOLDS, summarizeAi, summarizeIngestion, summarizeRuns, type AiRow, type RunRow, type Thresholds } from "./ops";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any; rpc?: any };

/** Free plan size; set DB_LIMIT_MB on a paid plan. */
const limitBytes = () => (Number(process.env.DB_LIMIT_MB) || 500) * 1_048_576;

async function all<T>(build: (from: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from);
    if (error) throw new Error(error.message);
    out.push(...(data as T[]));
    if ((data as T[]).length < 1000) break;
  }
  return out;
}

export type OpsWindow = { since: string; until: string };

/** Everything the ops report and the health check need for one window. Read-only. */
export async function loadOps(db: Db, w: OpsWindow, thresholds: Thresholds = DEFAULT_THRESHOLDS) {
  const now = Date.parse(w.until);
  // Measure "did the scheduled jobs run?" only from when this database came into being (its register was
  // first loaded). Otherwise a fresh database reports 0% completion for jobs that could not have run yet.
  const birth = await db.from("sponsor_licences").select("updated_at").order("updated_at").limit(1).maybeSingle()
    .then((r: { data: { updated_at: string } | null }) => (r.data ? Date.parse(r.data.updated_at) : 0), () => 0);
  const windowMs = now - Math.max(Date.parse(w.since), birth);
  const [runs, calls, topFailing] = await Promise.all([
    all<RunRow>((f) => db.from("job_runs").select("job,shard,started_at,finished_at,status,boards,failed,jobs,error").gte("started_at", w.since).lt("started_at", w.until).order("started_at").range(f, f + 999)),
    all<AiRow>((f) => db.from("ai_calls").select("at,kind,model,ms,input_tokens,output_tokens,cost_usd,ok,error").gte("at", w.since).lt("at", w.until).order("at").range(f, f + 999)),
    all<{ board: string; error: string; at: string }>((f) => db.from("board_failures").select("board,error,at").gte("at", w.since).lt("at", w.until).order("at").range(f, f + 999)),
  ]);

  const stale = new Date(now - 48 * 3_600_000).toISOString();
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const active = await count(db.from("jobs").select("id", { count: "exact", head: true }).eq("active", true));
  const staleActive = await count(db.from("jobs").select("id", { count: "exact", head: true }).eq("active", true).lt("last_seen", stale));
  const byCountry: Record<string, number> = {};
  for (const c of ["GB", "NL", "IE"]) byCountry[c] = await count(db.from("jobs").select("id", { count: "exact", head: true }).eq("active", true).eq("country", c));
  byCountry.remote = await count(db.from("jobs").select("id", { count: "exact", head: true }).eq("active", true).eq("remote", true).is("country", null));

  const size = db.rpc ? await db.rpc("db_size_bytes").then((r: { data: unknown }) => (typeof r.data === "number" || typeof r.data === "string" ? Number(r.data) : null), () => null) : null;
  const dbSize = size !== null && Number.isFinite(size) ? { bytes: size, limitBytes: limitBytes() } : null;
  const jobs = summarizeRuns(runs, windowMs, now);
  const ingestion = summarizeIngestion(runs);
  const ai = summarizeAi(calls);
  const daily = dailyCost(calls);
  const staleShare = active ? staleActive / active : null;

  const byBoard = new Map<string, { n: number; last: string; error: string }>();
  for (const f of topFailing) {
    const b = byBoard.get(f.board) ?? { n: 0, last: f.at, error: f.error };
    b.n++; b.last = f.at; b.error = f.error;
    byBoard.set(f.board, b);
  }
  const failingBoards = [...byBoard.entries()].map(([board, v]) => ({ board, ...v })).sort((a, b) => b.n - a.n).slice(0, 15);

  return { window: w, runs, jobs, ingestion, active, staleActive, staleShare, byCountry, ai, daily, failingBoards, dbSize, problems: breaches({ jobs, ingestion, staleShare, ai, daily, db: dbSize }, thresholds) };
}

export type Ops = Awaited<ReturnType<typeof loadOps>>;
