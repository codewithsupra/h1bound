# Incident log

One entry per real failure: what happened, how it was detected, what changed, and what stops it recurring. Newest first. Entries are written from what was observed; fields not known are marked "not recorded" rather than guessed. Add an entry every time something breaks, however small.

How to read the **Detected by** line: *monitoring* means the system told us; *manual* means a person or a test run noticed. The honest state today is that most detection is manual. `scripts/ops-report.mts` and `/api/cron/ops-check` (see `docs/OPERATIONS.md`) exist to change that, and each entry says what would have caught it.

---

## 2026-11-01: "We can't offer visa sponsorship" shown as an offer

- **Impact:** the vacancy matcher read postings that say "We can't offer visa sponsorship" (curly apostrophe) or "We are not currently able to sponsor visas" as *offering* sponsorship. In the labeled sample, 3 of 8 "yes" answers were wrong. A false "yes" lets a role from an unlicensed employer through as "risky" instead of blocking it, so a student could be told a role sponsors when it does not. Number of real users affected: not recorded (no users yet); at least 8 live UK postings carried the Kaluza sentence.
- **Detected by:** manual, while labeling the evaluation set (`docs/EVAL.md`). No alert could have caught it: the matcher returns a confident wrong answer without an error.
- **Root cause:** the "no" patterns only matched a straight apostrophe, and the "yes" patterns had no negation guard, so "…can't offer visa sponsorship" fell through to the "yes" rule "offer visa sponsorship".
- **Fix:** normalise curly apostrophes; add "not (currently) able to sponsor", "sponsorship: not available", "not eligible for employment visa sponsorship" and the Dutch "niet van toepassing"; a "yes" phrase in a sentence that also negates is ignored; add the missing "yes" phrasings ("we sponsor work visas", "we can sponsor your visa", benefits-list "Skilled Worker visa sponsorship").
- **Result:** held-out set (labeled before the matcher ran on it): 0 wrong answers in either direction; recall 73% (yes) and 72% (no). The tuned set is 100% but optimistic.
- **Prevention:** the labeled sets are regression-gated in `tests/eval.test.ts`; a new held-out draw is needed before the next tuning round.
- **Still open:** 8 held-out misses ("we don't provide visa sponsorship", "not eligible for immigration/work visa sponsorship", "benefits … visa sponsorship and allowance", etc.).

## 2026-11-01: Board links attach the wrong company (found by the evaluation)

- **Impact:** a job board is attached to a register entry when the board's company name is a *prefix* of the entry's name, and every job on the board then shows "Licensed sponsor". Example: the Dutch `howden` board holds Howden Nederland (insurance broker) jobs but is linked to "Howden Thomassen Compressors B.V."; 28 active jobs carry that link. In the random sample 1 of 68 board links was wrong (99%, 95% CI 92–100%); in the stress set of brand collisions, 26 of 105 were. 441 of 882 board links are prefix-only, 137 of those have rival register entries.
- **Detected by:** manual, while drawing and labeling the evaluation sample.
- **Root cause:** `brandMatches` accepts any prefix, and one board is stored against *every* register entry it matched (for example the `ace` board is attached to six unrelated "ACE …" companies), so which entry a job links to depends on probe order.
- **Fix:** not yet. Measured in `docs/EVAL.md`. Candidate fixes: attach a board to a single best entry; skip a prefix match when several unrelated entries share the brand; mark such links as lower confidence and word the badge accordingly.
- **Status:** open.

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
