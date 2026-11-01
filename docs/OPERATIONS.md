# Operating Sponsorbound

What runs, how to tell it is healthy, and what to do when it is not. Numbers here come from `job_runs`, `board_failures` and `ai_calls` (migration `20261101120000_ops-telemetry.sql`); nothing is estimated.

## What runs on a schedule (InsForge schedules, `Authorization: Bearer $CRON_SECRET`)

| Job | Schedule (UTC) | Route | Expected per day |
|---|---|---|---|
| Job boards, 4 shards | 10:00, 10:10, 10:20, 10:30 | `/api/cron/refresh-jobs?shard=i&of=4` | 4 |
| Remote feeds | 10:40 | `/api/cron/refresh-jobs?feeds=1` | 1 |
| UK register | Mon 03:00 | `/api/cron/registers?country=GB` | 1/7 |
| NL register | Mon 03:20 | `/api/cron/registers?country=NL` | 1/7 |
| Daily picks | hourly | `/api/cron/daily-picks` | 24 |
| Nudges | 15:00 | `/api/cron/nudges` | 1 |
| Health check | daily (to be scheduled) | `/api/cron/ops-check` | 1 |

Irish permits are loaded by script (`scripts/import-registers.mts IE`) when the department publishes a new file.

## Is it healthy?

```bash
npx tsx --env-file=.env.local scripts/ops-report.mts --since 2026-11-02 --until 2026-11-09 --write docs/ops/week-1.md
```

Run it over complete days only. The report shows, for the period: expected vs completed runs per job, boards attempted and failed, the boards that fail most, active jobs per country, **stale** jobs (active but not seen for 48 hours), AI calls with error rate, p50/p95 latency, tokens and provider-reported cost, and daily spend. It exits non-zero if a threshold is breached (defaults in `lib/ops.ts`: completion under 90%, board failures over 10%, stale over 5%, AI errors over 5%).

`/api/cron/ops-check` runs the same check over the last 48 hours and emails `OWNER_EMAIL` only when something is breached. Silence means healthy. It needs `RESEND_API_KEY`, `EMAIL_FROM` and `OWNER_EMAIL`; without them it still returns the findings as JSON.

A run that appears as "never finished" was killed by the 300-second function limit: split that job into more shards.

## When something breaks

1. Add an entry to `docs/INCIDENTS.md` first (impact, how it was detected), then diagnose.
2. Ingestion failing: `board_failures` lists the board and error. A single board failing is normal (companies change boards); a whole shard failing points at the database or a timeout.
3. AI errors: `ai_calls.error` has the provider's message. A 402 means the OpenRouter key limit; raise it at openrouter.ai/settings/keys.
4. Bad migration: migrations are applied by hand with `insforge db migrations up <file>`; each is additive (`IF NOT EXISTS`) so a re-run is safe. There is no automatic rollback: write the reverse SQL in the same PR for anything destructive.
5. Bad deploy: Vercel → Deployments → promote the previous production deployment (instant rollback).
6. Finish by recording the fix and the prevention in the incident entry.

## Not in place yet

- A database backup/restore procedure that has been tested. InsForge backups exist but a restore has not been rehearsed.
- Paging: the only alert is email from `ops-check`, once configured.
- A budget for AI spend (`maxDailyCostUsd` is unset).
- Match-quality reports from users ("wrong sponsor") feeding the evaluation sets.
