# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

Sponsorbound (formerly H1Bound; the name lives in `SITE_NAME`, `lib/site.ts`): a chat-first job buddy for international students who want a job in the **UK, Netherlands or Ireland**, or a remote role open to them. They talk to **Maya**, an AI that is always labeled as AI. Maya reads a CV and works out where the student can work freely and where they need a sponsor. She matches jobs they can legally take, checks each employer against the official sponsor registers, and summarizes company culture from public sources. On Pro, she drafts outreach that the user sends from their own Gmail.

The original US H-1B product still exists (US sponsor pages under `/sponsors/<slug>`, `/opt-clock`, and US-visa users get the US prompt). It's kept for SEO, not the pitch.

Live at https://h1bound.vercel.app. A push to `main` deploys through Vercel. Backend is InsForge project `h1bound`.

## Commands

```bash
npm run dev -- --port 3102          # dev server (launch config "h1bound-dev")
npm run verify                      # tsc --noEmit + eslint + vitest
npx vitest run tests/opt.test.ts    # one test file
npx vitest run -t "STEM"            # tests matching a name
npm run build                       # run before pushing; catches route-type errors tsc misses
npx next typegen                    # regenerate route types after adding or moving a route
```

Data pipeline scripts live in `scripts/*.mts` and run with `npx tsx --env-file=.env.local …`:
- `scripts/import-registers.mts [GB] [NL] [IE] [--dry]` loads the UK, Dutch and Irish sponsor registers into `sponsor_licences`.
- `scripts/refresh-jobs.mts [--feeds]` pulls all boards, or with `--feeds` the remote feeds.
- The US pipeline (import LCA, load sponsors, resolve and verify boards) is in the README.

Migrations live in `migrations/`. Apply one with `npx -y @insforge/cli db migrations up <filename>`, which needs the explicit filename. After a schema change, run `npx -y @insforge/cli advisor scan`. It should stay at 0 critical and 0 warnings.

## Architecture

**Data flow.**
- **Registers:** `lib/ingest/registers.ts` parses the official registers into `sponsor_licences`, keyed `(country, licenceKey(name))`:
  - UK Home Office sponsor CSV;
  - Dutch IND recognised-sponsor HTML;
  - Irish permits-by-company xlsx.
- **Register refresh:** UK and NL weekly via `POST /api/cron/registers?country=GB|NL`; Ireland via the script.
- **Job sources:**
  - ATS boards from both `companies` (US sponsors) and `sponsor_licences`: Greenhouse, Lever, Ashby, Recruitee;
  - remote feeds from `lib/ingest/feeds.ts`: Himalayas and Remote OK. Their terms require a visible credit link; Remotive is excluded because its terms forbid sign-up gating.
- **Refresh:** `lib/ingest/refresh.ts` keeps US, GB/NL/IE and Europe-or-worldwide remote jobs. It sets `country`, `remote_scope` and `seniority`, and links `licence_id` by name match. Stale jobs are deactivated per board (`source_id` prefix).
- **Cron:** the refresh runs from `POST /api/cron/refresh-jobs?shard=i&of=4` (plus `?feeds=1`), called by InsForge schedules with `Authorization: Bearer $CRON_SECRET`.
- **Posting text:** `lib/jd-signals.ts` reads US and UK/EU wording such as "unable to offer sponsorship" or "Skilled Worker visa". That text overrides the register.

**Visa logic (`lib/visa.ts`, pure).**
- `workRights` gives each country one of: free, `post_study` (UK Graduate visa, Stamp 1G, Dutch orientation year) or `sponsor`. It's based on citizenship, current visa country and visa situation (profile columns).
- `jobVisaFit` drops jobs the person can't legally take. UK and NL employers must be licensed; for Ireland a missing permit history is risky rather than blocked.

**Pure logic vs server code.**
- `lib/*.ts` at the top level is pure and unit-tested: matching, quota, OPT clock, sponsor scoring, slugs.
- Anything touching the DB, secrets or cookies lives in `lib/server/` and imports `"server-only"`. Vitest stubs `server-only` (see `vitest.config.mts`), so tests target the pure modules.

**InsForge clients.**
- **`lib/insforge/client.ts`:** browser client.
- **`lib/insforge/server.ts`:** session-aware server client; also provides `getSessionUser`.
- **`lib/insforge/admin.ts`:** full-access admin client.
- RLS makes personal tables **SELECT-only** for users. Every write goes through a server route or action that checks auth and quota first, then uses the admin client.
- `proxy.ts` (the Next 16 replacement for middleware) refreshes the InsForge session.

**Store abstraction (`lib/server/store.ts`).**
- Maya serves two kinds of people: signed-in users and cookie-identified guests. Guests use the signed `h1b_guest` cookie and a `guest_sessions` row.
- Routes and AI tools only ever see a `Store`, so quota, persistence and privacy rules live in one place. Add new per-person behavior there, not in routes.
- `claimGuest()` moves a guest's chat and profile to the account on sign-in, sign-up or OAuth callback.

**Matching (`lib/server/jobs.ts`).** `findJobs` branches:
- UK/NL/IE users (or anyone without a US `visa_status`) go to `findMarketJobs`:
  1. a deterministic score with a visa-fit factor (`lib/match.ts`);
  2. diversity;
  3. a fast-model rerank of the top ~20 against the full CV (`lib/server/rerank.ts`), which returns why and gap per job.
- US users keep the original H-1B path.

**Maya (`lib/ai/`).**
- **`maya.ts`:** `mayaSystem` picks `marketSystem` or `usSystem` from `MayaContext`, assembled in `app/api/chat/route.ts`.
- **`tools.ts`:** the AI SDK tools, including findJobs (with `country`), companySponsorship (registers, US optional), companyInsight and coldEmail.
- **`models.ts`:**
  - `chatModel` (Haiku) for conversation and reranking;
  - `smartModel` (Sonnet, low reasoning effort) for long-form output;
  - `researchModel` (Haiku plus the OpenRouter web plugin) for culture insights;
  - all routed through OpenRouter with zero data retention.

**Outreach and push.**
- **Culture insights:** `lib/server/insight.ts` runs research with web search, then a structured pass. Results are cached 30 days in `company_insights`, capped at `DAILY_RESEARCH_CAP` per day.
- **Gmail:** `lib/server/gmail.ts` uses the `gmail.send` scope only, so it can never read the inbox; tokens are encrypted. `POST /api/outreach/send` sends one approved draft once. A follow-up row unlocks 4 days after the first email.
- **Telegram:** `lib/server/telegram.ts` and `/api/telegram` link a chat through a one-time `/start` token.
- **Daily picks:** `POST /api/cron/daily-picks` calls `findJobs` per opted-in user. Picks count as shown, so it skips users with no deliverable channel.

**Entitlements.**
- The `is_pro` SQL RPC returns true for a paid entitlement or an unexpired `profiles.trial_ends_at`. Paid entitlements are granted only by the Stripe webhook trigger in `migrations/*_billing.sql`.
- Use `hasPaidPlan` (`lib/server/growth.ts`), not `isPro`, when the question is "has this person paid" (checkout, account deletion).
- Free limits and referral bonuses are in `lib/quota.ts`. A referral adds +5 jobs once the friend uploads a CV, for at most 3 friends.
- Prices: $12 / €10 (UK and EU) / ₹399 (India), chosen by `priceForCountry` in `lib/billing.ts`. A currency falls back to USD until its Stripe price env var is set.

**Privacy.**
- The uploaded resume is parsed in memory and dropped.
- The profile details (`ProfileDetails`, including the OPT clock) and chat history are AES-256-GCM encrypted with `PROFILE_DATA_KEY` (`lib/crypto.ts`). Losing that key makes stored profiles unreadable.

**Landing page.**
- `app/(home)/page.tsx` is an ISR server component composing `components/landing/sections/*`. Its data comes from `landingLicences()` in `lib/server/licences.ts`.
- The night map plots register employers by city (`lib/eu-geo.ts`: coordinates and coastlines).
- Data-shaped copy (FAQ, comparison table) is in `lib/landing-content.ts`.
- Register pages live at `/sponsors/{uk,nl,ie}/<slug>`, all served by `app/sponsors/_components/licence-page.tsx`. US pages stay at `/sponsors/<slug>`. Sitemap ids: 0+ US, 100+ UK, 200+ NL, 300+ IE.

### Signed-in workspace (`app/(app)/`)
- Sign-in lands on `/pipeline`. The `(app)` layout requires a session and renders `components/app/workspace.tsx`: a rail (visa clock, last-24h meter, Gmail prompt), the page, and Maya docked on the right (Cmd/Ctrl+K). `useMaya().ask(text)` opens the dock with a prefilled question, which is never auto-sent. Each page re-checks the session itself, because layout and page render in parallel.
- `lib/pipeline.ts` (pure, tested) holds the board logic: `stageOf`, `nextAction` (follow-up 4 days after a tracked send, "any reply?" weekly), `groupRows` (sponsors first when the visa clock is under 90 days), `replyStats` (hidden under 5 sends, never estimated) and `caseStrength`. `lib/server/pipeline.ts` loads matches, jobs, licences and the latest outreach (decrypted for the owner only), and `loadShell` holds request-time `now`.
- Server actions live in `app/(app)/actions.ts`: stage, reply, notes (encrypted), Your case, settings, and the JSON data export. `/account` redirects to `/settings`; `/privacy` and `/terms` live in `app/(legal)/`.
- Daily picks run hourly and only send to users whose local `picks_hour` it is (`localHour`). The count is `picks_per_day` (3–15) for paid Pro and is capped at 3 on the trial (`picksToday`).

## Rules that are easy to break
- Always set `maxOutputTokens` on AI calls. Without it, providers reserve their maximum, which fails once the OpenRouter key is near its limit.

- **Sponsorship claims:**
  - Always cite the source: "on the UK Home Office sponsor register (A-rated)", "issued 92 Irish permits", or "filed N H-1B LCAs".
  - Never say an employer "will sponsor".
  - Never quote success or reply rates we haven't measured.
  - Never invent numbers or testimonials on the site; stats come from the DB.
- **Glassdoor:** never scrape it or quote its ratings; link to it instead.
- **No scraping:** no LinkedIn or Indeed scraping. Jobs come only from public ATS APIs and feeds whose terms allow it.
- **Messages:** nothing is sent in the user's name without their tap. Gmail sends only a draft the user approved; picks only reach people who opted in.
- **Model limits:** Anthropic structured output through OpenRouter fails on zod `.max()` / `maxItems`, so enforce array limits in code instead. When `smartModel` output looks cut off, check `finishReason`.
- **Lever and Ashby boards:** a board slug can belong to a different company. `scripts/verify-boards.mts` checks it against the employer's filing states.
- **Design tokens:** Tailwind v4 tokens in `app/globals.css`: `night`, `sodium`, `mist`, `moon`, `haze`, plus `btn-light`, `btn-ghost` and `glass`. Don't put `tabular-nums` on comma-formatted numbers, because Schibsted Grotesk spaces the commas.
- **Test credentials:** they are in the gitignored `.env.e2e.local`. Use them on localhost only, never on production.
