# 0018 — Keyword relevance, tab auto-run, and city/state locations

Keyword Research on deliotx.com returned 46 keywords about the _meaning of
names_ — "Obnoxious Meaning", "Aria Name Meaning", "Zella Name Meaning". Nothing
to do with the site. At the same time Keyword Trends, SERP Overview and Content
Optimizer all opened as blank forms with invented placeholder text.

Both are the same failure in different clothes: the product knows things about
the project and doesn't use them.

## Why the keywords were wrong

Two independent defects compounded.

**The seed was the brand name.** `useSeedSuggestions` sorts Search Console
queries by impressions descending and pre-fills the top one. For every site on
earth the top-impression query is the brand, so it seeded `delio`.

**Auto walked a 3-hop semantic graph with no relevance test.** `fetchAutoRows`
tries `related` first and `fetchRelatedRows` hardcodes `depth: 3`, which follows
Google's "searches related to" chain three levels out:
`delio` → `delio meaning` → `lia name meaning` → `obnoxious meaning`. Auto then
stopped, because its only acceptance test is `hasSufficientCoverage` — "did we
get ≥5 keywords that aren't the seed." Forty-six junk rows pass that perfectly.

## Seeds (part A)

`useSeedSuggestions` gains the project domain and partitions GSC queries with
the existing, already-tested `isBrandedQuery` / `defaultBrandTerms` from
`search-performance/brandedSplit.ts`. Non-branded queries rank first. Branded
ones are still offered, sorted last and labelled `brand`, so choosing one is a
decision rather than an accident.

Fallback chain: non-branded GSC → saved keywords → ranked keywords from a stored
Domain Overview run → **no pre-fill plus a line explaining why**. Seeding
something useless silently is worse than seeding nothing.

## Relevance (part B)

1. `AUTO_KEYWORD_SOURCES` reorders to `suggestions → ideas → related`.
   `keyword_suggestions` returns keywords _containing_ the seed phrase, so it
   cannot drift by construction. `related` becomes the lateral fallback it
   should always have been.
2. `depth: 3` → `depth: 1`. One hop is Google's actual related searches; hops
   two and three are where `delio` becomes `obnoxious meaning`.
3. New pure `keywordRelevance.ts` scores each row against the seed (token
   containment, stem overlap, source provenance). Low-relevance rows are **not
   deleted** — they collapse behind an `N off-topic keywords hidden` toggle in
   the results table. Nothing vanishes silently and the judgement stays
   auditable.
4. `hasSufficientCoverage` counts _relevant_ non-seed keywords, so Auto keeps
   falling through sources instead of stopping on junk.

## Auto-run (part C)

`useSeedSuggestions` and `SeedKeywordField` move out of `dashboard/` into a
shared `keywords/seed/` module. A new `useTabAutoRun` wraps `useAutoRestoredRun`:
restore when a run exists (free), otherwise fire that tab's run **once** with the
best seed and record it.

Wired into Keyword Trends, SERP Overview, Content Optimizer and Topic Clusters.
Page Explorer gets top-GSC-_page_ chips instead of keyword chips.

Guards: requires a domain and a seed, fires once per `(project, feature)` ever,
never while another auto-run is in flight.

## Cost

**This reverses the standing no-auto-spend rule, deliberately and narrowly.**
Auto-run is bounded to the first ever visit to a tab for a project; every later
visit is free. Restores need no new storage: `analysis_runs` rows are permanent,
the 24h `CACHE_TTL` is soft app-level metadata in R2 custom metadata,
`getCachedRawIgnoringTtl` already bypasses it, and the bucket has no lifecycle
rule.

One-time cost of the fix: correcting the seed changes the research cache key, so
existing projects re-pay once per tab on first visit after deploy.

## The run control (part D)

The full-width `RestoredRunBanner` plus primary button becomes an inline control
in the results header — last-run timestamp and a ghost icon refresh.
`RestoreRail` keeps the history list and drops the banner.

## Locations (part E)

`keyword-locations.ts` gains the 50 US states and the ~300 largest US cities as
DataForSEO geotarget codes, each typed `kind: "country" | "state" | "city"` with
a `parentCode`. `LocationSelect` groups the three and searches across all of
them.

The split that matters: **SERP-bound calls pass the precise city code; Labs-bound
calls resolve up to `parentCode`.** Content Optimizer's brief is SERP-derived and
therefore genuinely city-accurate, while its related-terms leg is Labs and stays
country-level. The UI says so rather than implying precision that isn't there.

## Testing

Pure modules get unit tests beside them per repo convention: `keywordRelevance`,
brand-aware seed ranking, location parent resolution.

Auto-run is verified in the browser against the network log, not from types —
the same method that proved `analyzeContentCompetitor` never fires on a restore.
A spend regression here is invisible to `tsc` and expensive in production, so the
network log is the only acceptable evidence.
