/**
 * Operational evidence for a defined period: did the scheduled jobs run, did ingestion complete,
 * which boards failed, how fresh is the data, and what do AI calls cost. Read-only.
 * Usage: npx tsx --env-file=.env.local scripts/ops-report.mts [--since 2026-11-02] [--until 2026-11-09] [--write docs/ops/week-1.md]
 * Run it over complete days only: runs before telemetry was deployed are counted as missing.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createAdminClient } from "@insforge/sdk";
import { loadOps } from "../lib/ops-data";
import { pct } from "../lib/eval/metrics";

const args = process.argv.slice(2);
const flag = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const until = flag("until") ? new Date(`${flag("until")}T00:00:00Z`).toISOString() : new Date().toISOString();
const since = flag("since") ? new Date(`${flag("since")}T00:00:00Z`).toISOString() : new Date(Date.parse(until) - 7 * 86_400_000).toISOString();
const db = createAdminClient({ baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!, apiKey: process.env.INSFORGE_API_KEY! }).database;

const o = await loadOps(db, { since, until });
const days = ((Date.parse(until) - Date.parse(since)) / 86_400_000).toFixed(1);
const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
const ms = (n: number | null) => (n === null ? "n/a" : n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${n}ms`);

const md = `# Operations report

Period: ${since.slice(0, 16).replace("T", " ")} to ${until.slice(0, 16).replace("T", " ")} UTC (${days} days). Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC by \`scripts/ops-report.mts\`.

## Status

${o.problems.length ? o.problems.map((p) => `- **BREACH** ${p}`).join("\n") : "No threshold breached."}

## Scheduled jobs

| Job | Expected | Started | OK | Partial | Failed | Never finished | Completion |
|---|---|---|---|---|---|---|---|
${o.jobs.map((j) => `| ${j.job} | ${j.expected} | ${j.started} | ${j.ok} | ${j.partial} | ${j.failed} | ${j.killed} | ${pct(j.completion)} |`).join("\n")}

"Completion" = (ok + partial) / expected from the schedule. "Never finished" = started but not finished within 15 minutes, i.e. killed by the function time limit.

## Ingestion

- Finished runs: ${o.ingestion.runs}; boards attempted ${o.ingestion.boardsAttempted}; boards failed ${o.ingestion.boardsFailed} (${pct(o.ingestion.failureRate, 1)}); jobs upserted ${o.ingestion.jobsUpserted}.
- Active jobs now: ${o.active} (UK ${o.byCountry.GB}, NL ${o.byCountry.NL}, IE ${o.byCountry.IE}, remote-anywhere/Europe ${o.byCountry.remote}).
- **Stale** (active but not seen for 48 hours): ${o.staleActive} (${pct(o.staleShare, 1)}).

Boards that failed most in the period:

${o.failingBoards.length ? o.failingBoards.map((b) => `- \`${b.board}\` failed ${b.n}x, last ${b.last.slice(0, 10)}: ${b.error}`).join("\n") : "_None._"}

## AI calls

| Kind | Calls | Errors | p50 | p95 | Tokens in / out | Cost | Cost reported on |
|---|---|---|---|---|---|---|---|
${o.ai.map((a) => `| ${a.kind} | ${a.calls} | ${a.errors} (${pct(a.errorRate, 1)}) | ${ms(a.p50)} | ${ms(a.p95)} | ${a.inputTokens} / ${a.outputTokens} | ${usd(a.costUsd)} | ${pct(a.costCoverage)} of calls |`).join("\n") || "| _no calls recorded_ | | | | | | | |"}

Cost is what the provider reported per call; calls without a reported cost are not estimated.

Daily spend:

${o.daily.length ? o.daily.map((d) => `- ${d.day}: ${usd(d.costUsd)} over ${d.calls} calls`).join("\n") : "_No calls recorded._"}

## Incidents in the period

See \`docs/INCIDENTS.md\`. Add each real failure there with how it was detected and what changed.
`;

if (flag("write")) { mkdirSync(dirname(flag("write")!), { recursive: true }); writeFileSync(flag("write")!, md); console.log(`wrote ${flag("write")}`); } else console.log(md);
if (o.problems.length) process.exitCode = 1;
