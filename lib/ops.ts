/**
 * Operational summaries: did the scheduled jobs run, did ingestion complete, how fresh is the data,
 * how do AI calls behave and what do they cost. Pure and tested; scripts/ops-report.mts and the
 * ops-check cron both read this.
 */

export type RunRow = {
  job: string;
  shard: number | null;
  started_at: string;
  finished_at: string | null;
  status: "running" | "ok" | "partial" | "failed";
  boards: number | null;
  failed: number | null;
  jobs: number | null;
  error: string | null;
};

export type AiRow = {
  at: string;
  kind: string;
  model: string;
  ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  ok: boolean;
  error: string | null;
};

/** Scheduled runs per day, from the scheduled workflows (.github/workflows/cron.yml). */
export const EXPECTED_PER_DAY: Record<string, number> = {
  "refresh-jobs": 4,      // four shards
  "refresh-feeds": 1,
  "registers-gb": 1 / 7,
  "registers-nl": 1 / 7,
  "daily-picks": 24,
  nudges: 1,
};

/** A run still "running" after this long was killed by the function time limit. */
export const KILLED_AFTER_MS = 15 * 60_000;

export type JobSummary = { job: string; expected: number; started: number; ok: number; partial: number; failed: number; killed: number; completion: number | null };

export function summarizeRuns(rows: RunRow[], windowMs: number, now: number): JobSummary[] {
  const days = windowMs / 86_400_000;
  const jobs = new Set([...Object.keys(EXPECTED_PER_DAY), ...rows.map((r) => r.job)]);
  return [...jobs].map((job) => {
    const mine = rows.filter((r) => r.job === job);
    const killed = mine.filter((r) => r.status === "running" && now - Date.parse(r.started_at) > KILLED_AFTER_MS).length;
    const ok = mine.filter((r) => r.status === "ok").length;
    const expected = Math.round((EXPECTED_PER_DAY[job] ?? 0) * days);
    return {
      job, expected, started: mine.length, ok, partial: mine.filter((r) => r.status === "partial").length,
      failed: mine.filter((r) => r.status === "failed").length + killed, killed,
      completion: expected ? Math.min(1, (ok + mine.filter((r) => r.status === "partial").length) / expected) : null,
    };
  }).sort((a, b) => a.job.localeCompare(b.job));
}

export type Ingestion = { runs: number; boardsAttempted: number; boardsFailed: number; failureRate: number | null; jobsUpserted: number };

export function summarizeIngestion(rows: RunRow[]): Ingestion {
  const ing = rows.filter((r) => r.job === "refresh-jobs" && r.status !== "running");
  const boardsAttempted = ing.reduce((a, r) => a + (r.boards ?? 0), 0);
  const boardsFailed = ing.reduce((a, r) => a + (r.failed ?? 0), 0);
  return { runs: ing.length, boardsAttempted, boardsFailed, failureRate: boardsAttempted ? boardsFailed / boardsAttempted : null, jobsUpserted: ing.reduce((a, r) => a + (r.jobs ?? 0), 0) };
}

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}

export type AiSummary = { kind: string; calls: number; errors: number; errorRate: number; p50: number | null; p95: number | null; inputTokens: number; outputTokens: number; costUsd: number; costCoverage: number };

export function summarizeAi(rows: AiRow[]): AiSummary[] {
  const kinds = [...new Set(rows.map((r) => r.kind))].sort();
  return kinds.map((kind) => {
    const mine = rows.filter((r) => r.kind === kind);
    const priced = mine.filter((r) => r.cost_usd !== null);
    return {
      kind, calls: mine.length, errors: mine.filter((r) => !r.ok).length, errorRate: mine.filter((r) => !r.ok).length / mine.length,
      p50: percentile(mine.map((r) => r.ms), 50), p95: percentile(mine.map((r) => r.ms), 95),
      inputTokens: mine.reduce((a, r) => a + (r.input_tokens ?? 0), 0), outputTokens: mine.reduce((a, r) => a + (r.output_tokens ?? 0), 0),
      costUsd: priced.reduce((a, r) => a + (r.cost_usd ?? 0), 0), costCoverage: priced.length / mine.length,
    };
  });
}

/** Daily spend, for the "adjust limits" decision. Days with no priced calls are omitted. */
export function dailyCost(rows: AiRow[]): { day: string; costUsd: number; calls: number }[] {
  const by = new Map<string, { costUsd: number; calls: number }>();
  for (const r of rows) {
    const day = r.at.slice(0, 10);
    const d = by.get(day) ?? { costUsd: 0, calls: 0 };
    d.costUsd += r.cost_usd ?? 0;
    d.calls++;
    by.set(day, d);
  }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, ...v }));
}

export type DbSize = { bytes: number; limitBytes: number };

export type Thresholds = { minCompletion: number; maxBoardFailureRate: number; maxStaleShare: number; maxAiErrorRate: number; maxDailyCostUsd: number | null; maxDbShare: number };
export const DEFAULT_THRESHOLDS: Thresholds = { minCompletion: 0.9, maxBoardFailureRate: 0.1, maxStaleShare: 0.05, maxAiErrorRate: 0.05, maxDailyCostUsd: null, maxDbShare: 0.8 };

/** What is currently wrong, in words. Empty means healthy. */
export function breaches(input: { jobs: JobSummary[]; ingestion: Ingestion; staleShare: number | null; ai: AiSummary[]; daily: { day: string; costUsd: number }[]; db?: DbSize | null }, t: Thresholds = DEFAULT_THRESHOLDS): string[] {
  const out: string[] = [];
  for (const j of input.jobs) {
    if (j.expected >= 2 && j.completion !== null && j.completion < t.minCompletion) out.push(`${j.job}: only ${Math.round(j.completion * 100)}% of expected runs completed (${j.ok + j.partial}/${j.expected})`);
    if (j.killed) out.push(`${j.job}: ${j.killed} run(s) started and never finished (killed by the time limit?)`);
  }
  if (input.ingestion.failureRate !== null && input.ingestion.failureRate > t.maxBoardFailureRate) out.push(`ingestion: ${Math.round(input.ingestion.failureRate * 100)}% of boards failed (${input.ingestion.boardsFailed}/${input.ingestion.boardsAttempted})`);
  if (input.staleShare !== null && input.staleShare > t.maxStaleShare) out.push(`${Math.round(input.staleShare * 100)}% of active jobs were not refreshed in the last 48 hours`);
  for (const a of input.ai) if (a.calls >= 5 && a.errorRate > t.maxAiErrorRate) out.push(`AI ${a.kind}: ${Math.round(a.errorRate * 100)}% of ${a.calls} calls failed`);
  if (input.db && input.db.limitBytes > 0 && input.db.bytes / input.db.limitBytes > t.maxDbShare) {
    const mb = (b: number) => Math.round(b / 1_048_576);
    out.push(`database is ${mb(input.db.bytes)} MB of ${mb(input.db.limitBytes)} MB (${Math.round((input.db.bytes / input.db.limitBytes) * 100)}%): the free plan pauses the project at the limit`);
  }
  const last = input.daily[input.daily.length - 1];
  if (t.maxDailyCostUsd !== null && last && last.costUsd > t.maxDailyCostUsd) out.push(`AI spend on ${last.day} was $${last.costUsd.toFixed(2)} (limit $${t.maxDailyCostUsd})`);
  return out;
}
