# Operating Sponsorbound

What runs, how to tell it is healthy, and what to do when it is not. Numbers here come from `job_runs`, `board_failures` and `ai_calls` (migration `20261101120000_ops-telemetry.sql`); nothing is estimated.

## What runs on a schedule (`.github/workflows/cron.yml`, `Authorization: Bearer $CRON_SECRET`)

| Job | Schedule (UTC) | Route | Expected per day |
|---|---|---|---|
| Job boards, 4 shards | 10:00, 10:10, 10:20, 10:30 | `/api/cron/refresh-jobs?shard=i&of=4` | 4 |
| Remote feeds | 10:40 | `/api/cron/refresh-jobs?feeds=1` | 1 |
| UK register | Mon 03:00 | `/api/cron/registers?country=GB` | 1/7 |
| NL register | Mon 03:20 | `/api/cron/registers?country=NL` | 1/7 |
| Daily picks (the visa-clock digest) | hourly | `/api/cron/daily-picks` | 24 |
| Follow-ups students approved | hourly at :25 | `/api/cron/follow-ups` | 24 |
| Job boards for employers new on the registers | Mon 04:00 | `/api/cron/new-sponsors` | 1/7 |
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
4. Bad migration: `scripts/db-migrate.mts` runs each file in one transaction and skips applied ones, so a failure leaves the database as it was; try changes first with `scripts/check-migrations.sh`. There is no automatic rollback: write the reverse SQL in the same PR for anything destructive.
5. Bad deploy: Vercel → Deployments → promote the previous production deployment (instant rollback).
6. Finish by recording the fix and the prevention in the incident entry.

## Payments

Direct Stripe subscriptions: `lib/server/stripe.ts`, `app/api/billing/{checkout,portal,webhook}`. Pro is granted only by the signed webhook, which re-reads the subscription from Stripe on every event and records event ids in `billing_events` so retries apply once. `billing_customers` links each Stripe Customer to a user.

Setup (test first, in a Stripe sandbox; repeat in live mode when launching):

1. Create a sandbox in the Stripe Dashboard (or `stripe sandbox create` with the Stripe CLI).
2. Create a restricted key: write on Customers, Checkout Sessions and Customer portal; read on Subscriptions, Invoices and Charges. Put it in `STRIPE_SECRET_KEY`.
3. Create one Product, "Sponsorbound Pro", with three recurring monthly Prices: EUR 10, USD 12, INR 399. Put their ids in `NEXT_PUBLIC_PRICE_{EUR,USD,INR}_MONTH`.
4. Turn on the customer portal (Settings > Billing > Customer portal): allow cancelling and updating the payment method.
5. Add a webhook endpoint `https://h1bound.vercel.app/api/billing/webhook` with these events, and put its signing secret in `STRIPE_WEBHOOK_SECRET`:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.dispute.created`, `charge.refunded`, `radar.early_fraud_warning.created`.
6. Locally: `stripe listen --forward-to localhost:3102/api/billing/webhook` prints a temporary signing secret for `.env.local`. Subscribe with test card 4242 4242 4242 4242, check `/settings` shows Pro, cancel in the portal, check Pro ends.
7. Only then set `NEXT_PUBLIC_PAYMENTS_LIVE=true`.

Disputes, refunds and early fraud warnings change nothing automatically: they are logged as `[billing-alert]` and emailed to `OWNER_EMAIL`. Tax: `automatic_tax` is not enabled. Stripe collects no tax without an active registration, and selling digital services to UK or EU consumers can create VAT obligations, so check them before going live.

If a webhook fails: the route answers 500 and Stripe retries for up to 3 days. Failed deliveries are listed under Developers > Webhooks in the Dashboard, where they can be resent.

## Not in place yet

- A database backup/restore procedure that has been tested. Check what backups your Supabase plan includes (scheduled backups are a paid feature at the time of writing) and export with `pg_dump` (via `SUPABASE_DB_URL`) before risky changes.
- Paging: the only alert is email from `ops-check`, once configured.
- A budget for AI spend (`maxDailyCostUsd` is unset).
- Match-quality reports from users ("wrong sponsor") feeding the evaluation sets.
