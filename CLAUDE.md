# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

H1Bound: a chat-first job buddy for international students on F-1 OPT who need an H-1B sponsor. The user talks to **Maya**, an AI that is always labeled as AI. Maya reads a resume, matches open US jobs at employers with a real Dept. of Labor H-1B filing record, and reviews the resume against each job. On Pro, Maya also drafts cold emails, interview plans and tailoring tips.

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

Data pipeline scripts live in `scripts/*.mts` and run with `npx tsx --env-file=.env.local …`. The README lists them in order: import LCA, load sponsors, resolve boards, verify boards, refresh jobs.

Migrations live in `migrations/`. Apply one with `npx -y @insforge/cli db migrations up <filename>`, which needs the explicit filename. After a schema change, run `npx -y @insforge/cli advisor scan`. It should stay at 0 critical and 0 warnings.

## Architecture

**Data flow.**
- DOL LCA disclosures are imported once by `lib/ingest/lca.ts` into the `companies` table. Counts are per employer and role family, with median wage and last filed date.
- Public Greenhouse, Lever and Ashby boards are found for the top sponsors (`lib/ingest/ats.ts`, `slugs.ts`). Their jobs are refreshed daily into `jobs` by `lib/ingest/refresh.ts`.
- The refresh is called from `POST /api/cron/refresh-jobs?shard=i&of=4`. Four InsForge schedules call it, with `Authorization: Bearer $CRON_SECRET`.
- `lib/jd-signals.ts` reads each posting's own text, such as "can't sponsor", citizenship or clearance. That text overrides the employer's filing history.

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

**Maya (`lib/ai/`).**
- **`maya.ts`:** builds the system prompt from a `MayaContext`, assembled in `app/api/chat/route.ts`. The context covers profile, quota, Pro or trial state and OPT days left.
- **`tools.ts`:** the AI SDK tools, such as findJobs, review, coldEmail and setOptClock.
- **`models.ts`:** `chatModel` (Haiku) for conversation and `smartModel` (Sonnet, low reasoning effort) for long-form output. Both go through OpenRouter with zero-data-retention routing.

**Entitlements.**
- The `is_pro` SQL RPC returns true for a paid entitlement or an unexpired `profiles.trial_ends_at`. Paid entitlements are granted only by the Stripe webhook trigger in `migrations/*_billing.sql`.
- Use `hasPaidPlan` (`lib/server/growth.ts`), not `isPro`, when the question is "has this person paid" (checkout, account deletion).
- Free limits and referral bonuses are in `lib/quota.ts`. A referral adds +5 jobs once the friend uploads a resume, for at most 3 friends.

**Privacy.**
- The uploaded resume is parsed in memory and dropped.
- The profile details (`ProfileDetails`, including the OPT clock) and chat history are AES-256-GCM encrypted with `PROFILE_DATA_KEY` (`lib/crypto.ts`). Losing that key makes stored profiles unreadable.

**Landing page.**
- `app/(home)/page.tsx` is an ISR server component that composes `components/landing/sections/*`. Data-shaped copy (FAQ, comparison table) is in `lib/landing-content.ts`.
- `app/(home)/loading.tsx` is the rocket loader. It is scoped to the route group so it only shows when navigating home.
- Sponsor SEO pages live at `/sponsors/[slug]`. OG images use `lib/og/card.tsx`.

## Rules that are easy to break

- **Sponsorship claims:**
  - Always cite filings ("filed N certified H-1B LCAs").
  - Never say an employer "will sponsor".
  - Never invent numbers or testimonials on the site; stats come from the DB.
- **No scraping:** no LinkedIn or Indeed scraping. Jobs come only from public ATS APIs.
- **Messages:** nothing is sent in the user's name. Maya drafts and the user sends from their own inbox.
- **Model limits:** Anthropic structured output through OpenRouter fails on zod `.max()` / `maxItems`, so enforce array limits in code instead. When `smartModel` output looks cut off, check `finishReason`.
- **Lever and Ashby boards:** a board slug can belong to a different company. `scripts/verify-boards.mts` checks it against the employer's filing states.
- **Design tokens:** Tailwind v4 tokens in `app/globals.css`: `night`, `sodium`, `mist`, `moon`, `haze`, plus `btn-light`, `btn-ghost` and `glass`. Don't put `tabular-nums` on comma-formatted numbers, because Schibsted Grotesk spaces the commas.
- **Test credentials:** they are in the gitignored `.env.e2e.local`. Use them on localhost only, never on production.
