import { describe, expect, it } from "vitest";
import { breaches, dailyCost, percentile, summarizeAi, summarizeIngestion, summarizeRuns, type AiRow, type RunRow } from "@/lib/ops";

const now = Date.parse("2026-11-08T12:00:00Z");
const run = (p: Partial<RunRow> = {}): RunRow => ({ job: "refresh-jobs", shard: 0, started_at: "2026-11-07T10:00:00Z", finished_at: "2026-11-07T10:04:00Z", status: "ok", boards: 100, failed: 2, jobs: 900, error: null, ...p });
const ai = (p: Partial<AiRow> = {}): AiRow => ({ at: "2026-11-07T10:00:00Z", kind: "chat", model: "m", ms: 1000, input_tokens: 100, output_tokens: 50, cost_usd: 0.001, ok: true, error: null, ...p });

describe("summarizeRuns", () => {
  it("compares completed runs with what the schedule should have produced", () => {
    const rows = [run(), run({ shard: 1 }), run({ shard: 2, status: "partial" }), run({ shard: 3, status: "failed", error: "db" })];
    const j = summarizeRuns(rows, 86_400_000, now).find((x) => x.job === "refresh-jobs")!;
    expect(j).toMatchObject({ expected: 4, started: 4, ok: 2, partial: 1, failed: 1 });
    expect(j.completion).toBeCloseTo(0.75);
  });
  it("counts a run that never finished as killed, but not one still within the limit", () => {
    const stuck = run({ status: "running", finished_at: null, started_at: "2026-11-08T11:00:00Z" });
    const fresh = run({ status: "running", finished_at: null, started_at: "2026-11-08T11:55:00Z" });
    expect(summarizeRuns([stuck, fresh], 86_400_000, now).find((x) => x.job === "refresh-jobs")).toMatchObject({ killed: 1, failed: 1 });
  });
  it("lists scheduled jobs that never ran", () => {
    expect(summarizeRuns([], 86_400_000, now).find((x) => x.job === "daily-picks")).toMatchObject({ expected: 24, started: 0, completion: 0 });
  });
});

describe("summarizeIngestion", () => {
  it("sums only finished ingestion runs", () => {
    const i = summarizeIngestion([run(), run({ boards: 50, failed: 8 }), run({ status: "running", boards: null }), run({ job: "nudges" })]);
    expect(i).toMatchObject({ runs: 2, boardsAttempted: 150, boardsFailed: 10, jobsUpserted: 1800 });
    expect(i.failureRate).toBeCloseTo(10 / 150);
  });
});

describe("AI summaries", () => {
  it("computes percentiles, error rate and cost coverage per kind", () => {
    const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ai({ ms: n * 100, ok: n !== 10, cost_usd: n <= 5 ? 0.01 : null }));
    const s = summarizeAi(rows)[0];
    expect(s).toMatchObject({ calls: 10, errors: 1, p50: 500, p95: 1000 });
    expect(s.errorRate).toBeCloseTo(0.1);
    expect(s.costUsd).toBeCloseTo(0.05);
    expect(s.costCoverage).toBeCloseTo(0.5);
    expect(percentile([], 50)).toBeNull();
  });
  it("groups cost by day", () => {
    expect(dailyCost([ai({ at: "2026-11-06T09:00:00Z" }), ai({ at: "2026-11-07T09:00:00Z", cost_usd: 0.5 }), ai({ at: "2026-11-07T10:00:00Z", cost_usd: null })])).toEqual([
      { day: "2026-11-06", costUsd: 0.001, calls: 1 }, { day: "2026-11-07", costUsd: 0.5, calls: 2 },
    ]);
  });
});

describe("breaches", () => {
  const healthy = { jobs: summarizeRuns([run(), run(), run(), run()], 86_400_000, now).filter((j) => j.job === "refresh-jobs"), ingestion: summarizeIngestion([run()]), staleShare: 0.01, ai: summarizeAi([ai()]), daily: [] };
  it("is quiet when healthy", () => expect(breaches(healthy)).toEqual([]));
  it("names each problem", () => {
    const bad = {
      jobs: summarizeRuns([run({ status: "failed" }), run({ status: "failed" })], 86_400_000, now).filter((j) => j.job === "refresh-jobs"),
      ingestion: summarizeIngestion([run({ boards: 100, failed: 30 })]),
      staleShare: 0.2,
      ai: summarizeAi(Array.from({ length: 10 }, (_, i) => ai({ ok: i > 2 }))),
      daily: [{ day: "2026-11-07", costUsd: 9 }],
    };
    const out = breaches(bad, { minCompletion: 0.9, maxBoardFailureRate: 0.1, maxStaleShare: 0.05, maxAiErrorRate: 0.05, maxDailyCostUsd: 5 });
    expect(out.join("\n")).toMatch(/refresh-jobs: only 0%/);
    expect(out.join("\n")).toMatch(/30% of boards failed/);
    expect(out.join("\n")).toMatch(/20% of active jobs/);
    expect(out.join("\n")).toMatch(/AI chat: 30% of 10 calls failed/);
    expect(out.join("\n")).toMatch(/\$9\.00/);
  });
});
