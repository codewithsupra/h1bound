# H1Bound

Chat with **Maya**, an AI job buddy for international students. Upload a resume, CV, transcript or biodata; Maya matches you to open US jobs at employers with a real H-1B filing record, shows each employer's sponsorship history from US Dept. of Labor data, reviews your resume per job, and (Pro) finds the hiring manager and drafts the cold email, interview plan and tailoring tips.

## What makes the sponsorship signal honest

- **Company history:** 1,032,735 FY2026 DOL LCA disclosure rows → 52,639 employers, counted per role family with median wages (`lib/ingest/lca.ts`). A certified LCA is a required step for an H-1B, not an approved visa, so copy always says "filed", never "will sponsor".
- **The posting's own words win:** "we can't sponsor", citizenship, clearance and export-control language marks a job as no-sponsorship and hides it from students who need one (`lib/jd-signals.ts`).
- **Jobs** come from public Greenhouse / Lever / Ashby APIs (no scraping), seeded from the top sponsoring employers; Lever/Ashby boards are verified against the employer's filing states (`scripts/verify-boards.mts`).

## Stack

Next.js 16 · InsForge (Postgres + RLS, auth, Stripe payments, schedules) · AI SDK v7 + Claude via OpenRouter (zero-data-retention routing) · Vercel.

Privacy: the uploaded file is parsed in memory and dropped; the parsed profile and chat history are AES-256-GCM encrypted (`lib/crypto.ts`). Users can read only their own rows; every write goes through server routes after auth + quota checks. "Delete all my data" cascades everything.

## Commands

```bash
npm run dev -- --port 3102     # app
npm run verify                 # typecheck + lint + 81 unit tests
npx tsx scripts/import-lca.mts data/raw/LCA_Disclosure_Data_FY2026_Q3.xlsx 2026   # DOL xlsx → data/out
npx tsx --env-file=.env.local scripts/load-sponsors.mts 2026                       # → companies
npx tsx --env-file=.env.local scripts/resolve-boards.mts 3000                      # find job boards
npx tsx --env-file=.env.local scripts/verify-boards.mts --apply                    # drop mismatches
npx tsx --env-file=.env.local scripts/refresh-jobs.mts                             # pull jobs
```

Daily in production (InsForge schedules, `Authorization: Bearer $CRON_SECRET`): `POST /api/cron/refresh-jobs`, `POST /api/cron/nudges`.

## Free vs Pro

Free: 10 matched jobs, resume reviews on 5 of them (15 rounds). Pro ($12/mo, ₹399 in India): unlimited matches, cold emails with contact finding (Hunter), interview plans, tailoring, follow-up emails. Limits live in `lib/quota.ts`; Pro is granted only by the Stripe webhook trigger (`migrations/*_billing.sql`).
