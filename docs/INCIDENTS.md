# Incident log

One entry per real failure: what happened, how it was detected, what changed, and what stops it recurring. Newest first. Entries are written from what was observed; fields not known are marked "not recorded" rather than guessed. Add an entry every time something breaks, however small.

How to read the **Detected by** line: *monitoring* means the system told us; *manual* means a person or a test run noticed. The honest state today is that most detection is manual. `scripts/ops-report.mts` and `/api/cron/ops-check` (see `docs/OPERATIONS.md`) exist to change that, and each entry says what would have caught it.

---

## 2026-11-08: Backend paused at the free plan's database limit (found a week later)

- **Impact:** every database-backed feature stopped: sign-in, chat, the pipeline, search, the sponsor pages (which returned 404 instead of an error), the daily jobs and the ops telemetry. Cached pages such as the home page kept loading. `lull`, on the same account, stopped too. Start date: not recorded (the schedule history sits on the paused backend); it was working on 2026-11-02 and down on 2026-11-08. The site could also not be redeployed: the build fetched live data and failed. Real users affected: none (no users yet).
- **Detected by:** manual, while generating the first weekly ops report. Nothing alerted: the health check ran on the same backend that was down.
- **Root cause:** the InsForge free plan allows 512 MB of database across the organization. `h1bound` (about 481 MB) plus `lull` (about 17 MB) reached it, InsForge blocked the organization, and restoring required upgrading to a paid plan. The size came mostly from storing every posting's full description, including about 42,000 legacy US jobs. Nothing measured or capped the database size.
- **Fix:** moved the app to Supabase (free plan, 500 MB). To keep it from recurring: stored job text is capped (4,000 characters for UK/NL/IE and remote, 600 for legacy US jobs; the sponsorship signals are computed before the cut); expired, unsaved jobs are purged after 30 days (`purge_stale_jobs`, which never deletes anything a user saved); the health check warns at 80% of the database limit; scheduled jobs moved to GitHub Actions, where a failed run emails the repo owner independently of the app; the build and the public pages now survive a database outage (an honest "temporarily unavailable" page, and a 503-style error, never a 404).
- **Found while fixing:** Supabase silently caps any API read at 1,000 rows, so the three reads that could exceed that now page (`fetchAll`), and a regression test pins it.
- **Prevention:** `tests/supabase-page.test.ts`, the size alert in `lib/ops.ts`, the migration check `scripts/check-migrations.sh`, and the cron workflow.
- **Not fixed:** paid checkout, which ran on InsForge's managed Stripe integration, is not live (a direct Stripe integration is still to be built). The old project's data stays downloadable from the InsForge dashboard for up to 90 days after the pause; the application data is rebuilt from public sources.
- **Status:** code complete and tested; live after the Supabase project is created, the migrations applied, the data loaded and the environment variables set.

## 2026-11-02: A sent email could be sent again if recording it failed (found while writing tests)

- **Impact:** none observed (Gmail sending has never been used in production). In principle: if Gmail accepted the message and the database write that records it then failed, the route released the draft's "sent" claim, so a retry would have emailed the hiring manager a second time.
- **Detected by:** manual, in an audit of the send route; no test existed for the route at all.
- **Root cause:** the claim release lived in the same `catch` as the Gmail call, so any later error (recording the message id, updating the job's status) was treated as "nothing was sent".
- **Fix:** the Gmail call has its own `try`; a failure there releases the claim, but once the message is out the claim is never released and a bookkeeping failure is only logged.
- **Prevention:** `tests/outreach-send.test.ts` (16 tests) covers authentication, ownership, one-send-per-draft under a simultaneous double click, release-on-failure and retry, the 4-day follow-up rule, and this case; the double-send test was confirmed to fail against the old code.
- **Status:** fixed in code; live after the next deploy.

## 2026-11-01: "We can't offer visa sponsorship" shown as an offer

- **Impact:** the vacancy matcher read postings that say "We can't offer visa sponsorship" (curly apostrophe) or "We are not currently able to sponsor visas" as *offering* sponsorship. In the labeled sample, 3 of 8 "yes" answers were wrong. A false "yes" lets a role from an unlicensed employer through as "risky" instead of blocking it, so a student could be told a role sponsors when it does not. Number of real users affected: not recorded (no users yet); at least 8 live UK postings carried the Kaluza sentence.
- **Detected by:** manual, while labeling the evaluation set (`docs/EVAL.md`). No alert could have caught it: the matcher returns a confident wrong answer without an error.
- **Root cause:** the "no" patterns only matched a straight apostrophe, and the "yes" patterns had no negation guard, so "…can't offer visa sponsorship" fell through to the "yes" rule "offer visa sponsorship".
- **Fix:** normalise curly apostrophes; add "not (currently) able to sponsor", "sponsorship: not available", "not eligible for employment visa sponsorship" and the Dutch "niet van toepassing"; a "yes" phrase in a sentence that also negates is ignored; add the missing "yes" phrasings ("we sponsor work visas", "we can sponsor your visa", benefits-list "Skilled Worker visa sponsorship").
- **Result:** held-out set (labeled before the matcher ran on it): 0 wrong answers in either direction; recall 73% (yes) and 72% (no). The tuned set is 100% but optimistic.
- **Prevention:** the labeled sets are regression-gated in `tests/eval.test.ts`; a new held-out draw is needed before the next tuning round.
- **Still open:** 8 held-out misses ("we don't provide visa sponsorship", "not eligible for immigration/work visa sponsorship", "benefits … visa sponsorship and allowance", etc.).

## 2026-11-01: Board links attach the wrong company (found by the evaluation)

- **Impact:** a job board is attached to a register entry when the board's company name is a *prefix* of the entry's name, and every job on the board then showed "Licensed sponsor". Example: the Dutch `howden` board holds Howden Nederland (insurance broker) jobs but was linked to "Howden Thomassen Compressors B.V." (28 active jobs). In the random sample 1 of 68 board links was wrong (98.5%, 95% CI 92-100%); in the stress set of brand collisions, 26 of 105 were. 441 of 882 board links were prefix-only, 137 of those have rival register entries; 1,094 active jobs sat behind those 137.
- **Detected by:** manual, while drawing and labeling the evaluation sample.
- **Root cause:** `brandMatches` accepts any prefix, and one board was stored against *every* register entry it matched (for example the `ace` board on six unrelated "ACE ..." companies), so which entry a job linked to depended on probe order. Nothing recorded how sure the link was.
- **Fix:** each link now carries a confidence (`exact` | `unique` | `ambiguous`, `linkMatch` in `lib/ingest/boards.ts`). A board keeps one entry per country (the exact one, else the closest name). Only exact or unique links are shown as "Licensed sponsor"; ambiguous ones show "Possible sponsor: check which entity hires you", are not counted as a sponsor for the visa clock, are never treated as licensed in the visa-fit rules, and are not listed on the register entry's public page.
- **Result (measured on the labeled sets):** confirmed claims 65/65 correct on the random sample (was 67/68); 0 wrong organisations confirmed in the stress set (was 26 of 105). Cost: 104 pairs become "possible", 77 of which are really the same organisation (sister entities), and production-wise about 1,094 jobs (15% of board-linked jobs) move from "Licensed sponsor" to "Possible sponsor".
- **Prevention:** `tests/eval.test.ts` fails if a wrong organisation is confirmed; `scripts/resolve-licence-boards.mts` now records the confidence when it attaches a board.
- **Still open:** a "unique" link can still be wrong if the only look-alike is a different company (none in the random sample, but the sample is small). Sister-entity groups are demoted along with true collisions because the name alone cannot tell them apart.
- **Status:** fixed in code and tests; not live until migration `20261101140000_licence-link-confidence.sql` is applied, `scripts/classify-board-links.mts --apply` is run, and the next refresh stamps `jobs.licence_match`. Until then jobs have no confidence and show as before.

## 2026-10-31: AI requests failing with 402 "can only afford 60715 tokens"

- **Impact:** CV parsing (`parseResume`) returned 500 in local testing, which would block onboarding for every new user. Production impact: not recorded; the key was close to its spending limit and production was not checked while it happened.
- **Detected by:** manual. Found by chance during an end-to-end test; nothing alerted. OpenRouter's response was: "This request requires more credits, or fewer max_tokens. You requested up to 65536 tokens, but can only afford 60715."
- **Root cause:** AI calls set no `maxOutputTokens`, so the provider reserved the model's maximum and rejected the request as unaffordable once the key's remaining credit fell below that reservation.
- **Fix:** an explicit output cap on every AI call (resume 6000, rerank 3000, insight 1500/1600, chat 700, coach per call).
- **Prevention:** every AI call is now recorded with latency, tokens, provider-reported cost and error text (`ai_calls`), and `ops-check` alerts when an AI kind's error rate passes 5%. Raising the key's limit is still a manual step; a cost threshold exists (`maxDailyCostUsd`) but is off until a budget is chosen.
- **Not fixed by code:** the OpenRouter key limit itself.

## 2026-10-31: Company culture summaries returned "not found"

- **Impact:** asking Maya about a company's culture returned no result for every company tried.
- **Detected by:** manual, in local end-to-end testing.
- **Root cause:** one model call both searched the web and produced strictly structured JSON; the model ignored length limits, the output was cut off and the JSON did not parse.
- **Fix:** two steps: research as free-form notes with the web plugin, then a separate structured pass with an explicit token cap; Glassdoor ratings are dropped from the output; a bad cached row was deleted.
- **Prevention:** `parseInsight` requires cited sources and enforces limits in code; insight calls are recorded as `insight_research` / `insight_structure` so a failure rate shows up.

## Template

```
## YYYY-MM-DD: short title
- Impact: who or what was affected, for how long, how many (or "not recorded")
- Detected by: monitoring | manual (say how) | user report
- Root cause:
- Fix:
- Prevention: what now stops or catches it
- Status: open | fixed
```
