# Sponsorbound

An AI job buddy for international students. **Maya** reads your CV and finds jobs in the **UK, Netherlands and Ireland** (plus remote roles open to you) at employers that appear on the official visa-sponsor registers, then helps you contact the hiring manager from your own Gmail, only when you approve each email.

Live: <https://h1bound.vercel.app>. The repo and URL keep the original name, *H1Bound*, from when this was a US H-1B tool.

## What makes the sponsorship signal honest

Three different questions are kept apart, and the app only claims what the data supports:

- **Is this employer on a sponsor register?** The UK Home Office register, the Dutch IND register of recognised sponsors, and the Irish permits-by-company data. Being on a register means an employer *can* sponsor, never that it *will* sponsor a given job. Irish data shows permits issued, which is not a licence.
- **Is the link to that register entry confirmed?** A job board's name is matched to a register entry with a confidence: `exact`, `unique`, or `ambiguous` when look-alike entries exist (`lib/ingest/boards.ts`). Only exact or unique links say "Licensed sponsor"; ambiguous ones say "Possible sponsor: check which entity hires you".
- **Does the posting itself offer sponsorship?** The job description's own words ("we can't sponsor", "right to work required") override the register (`lib/jd-signals.ts`).

How well each of these works is measured on frozen, hand-labeled sets, with a held-out set that is never tuned against: see [`docs/EVAL.md`](docs/EVAL.md). The labels are by an AI labeler and not independently verified, and the report says so. Real failures and fixes are in [`docs/INCIDENTS.md`](docs/INCIDENTS.md).

## What it does

- **Maya (chat):** an agent with tools for onboarding, job search, company sponsor checks, company culture summaries from public sources (cited, no Glassdoor scraping), CV review, cold-email drafting and interview prep.
- **Workspace** (signed in): a pipeline as table or board, a job drawer with the register proof, the draft email, follow-ups and private notes, a profile ("Your case") with work rights per country, and a visa clock that puts sponsors first as a post-study visa nears its end.
- **Gmail, on approval only:** the `gmail.send` scope only, so it cannot read your inbox. Each draft is reviewed, claimed atomically before sending so a double click cannot send twice, and follow-ups unlock 4 days after the first email.
- **Daily picks** by email or Telegram, at the hour the user chooses.
- **Matching:** deterministic scoring (skills, seniority, freshness, work rights) with an LLM re-rank that falls back to the deterministic order if it fails or times out.

## Data sources

Job boards (Greenhouse, Lever, Ashby, Recruitee) through their public APIs, plus the Himalayas and Remote OK feeds, which require a credit link. **No scraping of LinkedIn, Indeed or Glassdoor.** Sponsor registers are imported by `scripts/import-registers.mts` (UK and NL are also refreshed weekly by cron).

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Supabase (Postgres with row-level security, auth) · GitHub Actions (scheduled jobs) · Vercel AI SDK v7 with Claude via OpenRouter on zero-data-retention routes · Vercel · Stripe · Resend · Telegram Bot API · Hunter (contact lookup) · Vitest.

Privacy: the uploaded CV file is parsed in memory and dropped. The parsed CV text, chats, notes, drafts and the Gmail and Telegram tokens are AES-256-GCM encrypted (`lib/crypto.ts`). Personal tables are readable only by their owner; every write goes through the server after an auth and quota check.

## Status

Early and deployed, with no real users yet. Gmail sending, Telegram and daily-pick email are implemented but need credentials configured, and paid checkout is not built yet (see Plans) (see `.env.example`); until then they stay off. Google must also verify the Gmail scope before anyone outside the test users can connect it.

## Commands

```bash
npm run dev -- --port 3102     # app
npm run verify                 # typecheck + lint + unit tests + evaluation report check
npm run eval                   # regenerate docs/EVAL.md from the labeled sets

npx tsx --env-file=.env.local scripts/import-registers.mts GB NL IE        # sponsor registers -> sponsor_licences
npx tsx --env-file=.env.local scripts/resolve-licence-boards.mts IE GB NL  # find job boards for register entries
npx tsx --env-file=.env.local scripts/classify-board-links.mts             # dry run: link confidence per board
npx tsx --env-file=.env.local scripts/refresh-jobs.mts [--feeds]           # pull jobs (daily in production)
npx tsx --env-file=.env.local scripts/ops-report.mts --since 2026-11-02 --until 2026-11-09   # runs, failures, staleness, AI cost
```

Scheduled in production (`.github/workflows/cron.yml` calls the cron routes with `Authorization: Bearer $CRON_SECRET`; a failing run emails the repo owner): job refresh in 4 shards, remote feeds, weekly UK and NL registers, hourly daily-picks, nudges. Details and what to do when something breaks: [`docs/OPERATIONS.md`](docs/OPERATIONS.md). The US sponsor pages and OPT clock from the earlier H-1B version are kept for search traffic; their data comes from the DOL LCA importer (`scripts/import-lca.mts`).

## Plans

Free: 10 matched jobs, CV reviews on 5 of them. Pro (the plan and its limits are in the code; **paid checkout is not live**: it ran on a managed Stripe integration that went away with the move to Supabase, and a direct Stripe integration is still to be built; the 7-day trial works) ($12 / €10 / ₹399 a month by country, 7-day trial): unlimited matches, up to 15 daily picks, hiring-manager contacts, drafted emails, interview plans and tailoring.

## Layout

- `lib/ingest/`: registers, job-board fetchers, board-to-register matching, refresh
- `lib/visa.ts`, `lib/match.ts`: work-right rules, visa fit, scoring and the re-rank blend
- `lib/ai/`, `lib/server/`: agent tools, models, Gmail, Telegram, insights, telemetry
- `app/(app)/`: the signed-in workspace; `app/sponsors/`: public register pages
- `tests/`, `tests/eval/`, `lib/eval/`: unit tests and the labeled evaluation sets
- `supabase/migrations/`: SQL, applied with `npx tsx --env-file=.env.local scripts/db-migrate.mts` (tracks what is applied; validated on a throwaway Postgres by `scripts/check-migrations.sh`)
