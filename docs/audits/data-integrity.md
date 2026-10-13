# Metric definitions and data integrity

Reviewed 2026-10-13 against the original repository baseline and this repair branch. This is a source-level metric-family register plus targeted verification, not a field-by-field certification of every deployed report.

## Evidence classes and required display contract

Every value should carry its source, evidence window, capture time, scope, and availability. Distinguish observed first-party data, provider estimates, internally calculated heuristics, restored/stale observations, and missing evidence. These are design requirements beyond the specific Opportunities changes implemented here.

A suggested shared envelope contains `value`, `unit`, `source`, `observedFrom`, `observedTo`, `fetchedAt`, `projectId`, `target`, `country`, `device`, `coverage`, `availability`, and `methodVersion`. Use null for unknown; zero requires successful applicable observation. Show restored data's original capture date, not the time its tab reopened. Do not interpolate missing historical samples into invented observations.

## Metric-family register

- GSC clicks and impressions: observed Search Console data from `gscClient.ts`, GscService, and `serverFunctions/searchPerformance.ts`. The inspected report requests current/previous daily data, up to 1,000 query-page rows, 2,500 property-query rows, and 25 countries. These are requested subsets, not a complete keyword census. Preserve aggregation type and filtering context.
- GSC CTR and average position: use the report's aggregation helpers and underlying impressions, not an unweighted average of row percentages/ranks. Position is an observed average in that report's context, not necessarily today's universal rank. Google documents top-row limitations and omission of dates without data [G1].
- Opportunity click scenarios: internal, uncalibrated assumptions in `opportunityModel.ts`; ranking scenarios use an assumed 11% target CTR and consolidation assumes 30% recovery of split share. They are not forecasts, measured losses, or additive traffic. The branch labels scenarios, shows the evidence window, rejects invalid numeric inputs, and uses the largest single scenario as the headline rather than a sum.
- Opportunity counts: detector output after overlap merging and project-profile exclusions, not an external SEO fact. Preserve separate action types and disclose omitted profile matches. Counts remain unknown when required GSC evidence is unavailable.
- Keyword volume, difficulty, CPC, and competition: provider-derived values through DataForSEO keyword/Labs adapters and research mapping. Keep market, language, provider unit/scale, and capture time. Do not relabel advertising competition as organic ranking difficulty or compare different vendors' difficulty scales as equivalent.
- Organic domain traffic and keyword counts: DataForSEO Labs estimates (`DomainService.ts`, `domainRankHistory.ts`), not analytics visits. Historical points are mapped from valid returned year/month records. The continuation preserves missing/partial top-three buckets as unknown and versions mapped cache contracts; fixture verification is described below.
- Backlinks, referring domains, link history, and provider rank: DataForSEO backlink services/mappers. Index coverage is provider-specific. The continuation repairs absent new/lost event fields, unsupported pre-May-2021 placeholders and invalid values to null, while preserving genuine reported zero. Live entitlement remains unverified.
- Ahrefs Domain Rating: `server/lib/ahrefsDomainRating.ts` and `shared/ahrefsRating.ts`. Keep it named as Ahrefs DR, distinct from provider domain rank and Google signals. The existing mapper deliberately preserves returned DR 0 while null means no usable answer. Availability of this free endpoint is not an API service-level guarantee.
- Backlink spam score: `client/lib/spamScore.ts` treats it as a review signal, not proof that disavowal is appropriate. No disavowal automation was introduced.
- Rank tracking and fluctuation: stored run observations and configured search depth/market/device, not a backfilled history. Missing/failed checks and outside-depth results must remain distinguishable. Existing scheduler/run guards and billing were not altered.
- Audit findings and affected pages: captured crawl records in AuditService/repositories and workflow output. This branch checks missing/loading/empty evidence explicitly and counts exact distinct affected URLs. Recorded 200 responses are required for these metadata checks; absent or failed capture does not prove missing metadata. A successful HTTP fetch still does not prove indexability or a complete rendered page.
- Audit health, Lighthouse, and on-page scores: crawler/provider/lab checks, not guarantees of rankings or field user experience. Each chart must identify which engine and captured pages produced it. Word count and multiple H1 elements alone are not automatic ranking failures [G2]. This branch corrects the Opportunities wording, not every other scoring model.
- AI visibility, mentions, and share of voice: provider sample results and the tracked snapshot service. Existing brand history excludes entirely empty results and filters snapshots to the project's current target. The measured universe is the provider's sampled prompts/results, not all AI answers or all users.
- Internal-link recommendations and content suggestions: derived candidates from GSC/crawl/content plus optional model interpretation. Verify source text, destination relevance, existing links, and capture freshness before recommending an anchor. A model explanation is not a measurement.
- Local listings, GBP metrics, and rank-grid cells: distinguish connected GBP first-party records, third-party business/search observations, and internal map summaries. OAuth scope, geography, cell failures, and scan times need explicit reporting. Expiry/availability data from domain providers is a separate specialist dataset.

## Freshness, isolation, and spend

`buildCacheKey` hashes sorted top-level parameters; each caller must still include organization/project, target, market, device, and detector version when applicable. The inspected domain history cache includes organization/project/domain/location/language. This is not proof that every other cache key is complete.

Saved analysis payloads can be restored past soft TTL without a new paid call. Preserve that behavior while displaying staleness. DataForSEO's core transport avoids automatic replay of billable POSTs. Audit any UI-level Retry or Refresh separately: a retry label alone does not prove it is free. Scheduled checks must remain tied to explicitly configured schedules and budgets.

## Provider plan and current cost checks

Reuse the existing Google Search Console connection and crawl records for the first-party opportunity engine; do not acquire a second keyword/backlink stack as a prerequisite. Infrastructure and optional model costs still exist even where no SEO-provider request is made.

DataForSEO's official SERP page lists starting rates of $0.0006 per standard-queue SERP and $0.002 per live SERP for the default ten-result unit [P1]. Illustrative arithmetic only: 100 keywords checked daily for 30 days, one location/device and one such unit each, is 3,000 units: $1.80 standard or $6 live before deeper results, optional parameters, retries, or other endpoints. This is not a quote for the application's actual configured depth. General minimum account payment is listed as $50 [P2].

The official Backlinks pricing index lists a starting $0.024 per task plus $0.000036 per row [P3]. Confirm endpoint details, account entitlement/minimums, row counts, and add-ons before enabling new usage. Do not assume the SERP unit price covers keyword databases, backlinks, AI mentions, or on-page analysis. No subscription or paid provider change was made.

Additional providers should require a demonstrated unmet dataset need, documented marginal cost, explicit user authorization, fixture-backed mapping, and clear unavailable states. Optional AI should explain provided evidence, not generate substitute metrics.

## Open integrity work

Expand the register into field-level contracts and golden fixtures for every provider envelope. Test null/zero/partial/truncated/stale/invalid states, missing date buckets, current-target changes, and two-organization isolation. Add source/freshness metadata consistently to exports as well as screens.

### Exact-page and persisted evidence continuation

Page Investigation requests independent current/prior exact-page final-data observations and supporting query rows. Property/connector changes, invalid values, unrelated targets and provider-clamped date windows fail their contract. Missing daily observations display Unknown; genuine observed zero remains zero. Partial daily coverage and top-query limits are visible.

Saved work retains the full evidence scope and capture time in content-addressed snapshots. Pacific GSC calendar dates govern baseline exclusion and observation lag. Comparable sufficient results record observed changes with seasonality/concurrent-work limitations; missing or incomparable observations remain pending. Reruns preserve human progress and past comparisons. Complete captured existing-link evidence can reconcile one pair without calling it fixed; partial/failed captures cannot.

These contracts passed native/service/real SQLite checks and are exercised through the isolated authenticated application. Live Google/provider responses, PostgreSQL runtime and storage deletion/retention cleanup remain unverified release gates. See `verification-results.md` and `../product/implementation-checklist.md`.

### History contract repair, continuation on 2026-10-13

Backlinks monthly `referring_domains`, `new_referring_domains` (including the
provider's misspelled alias), `lost_referring_domains`, `new_backlinks` and
`lost_backlinks` now accept only nonnegative safe integer observations. Missing,
invalid and negative fields map to null; reported zero remains zero. Invalid
calendar observations are omitted, without adding replacement months. The
chart preserves null gaps and shows unavailable event coverage. A velocity
average requires reported gain and loss counts in every returned month.
DataForSEO documents event counts before May 2021 as unsupported placeholders;
those historical zeros remain null. Aggregate counts also reject overflow.
See the [provider's history field contract](https://docs.dataforseo.com/v3/backlinks/history/live/).

Domain rank history `count`, `pos_1` and `pos_2_3` require nonnegative integer
observations; `etv` permits nonnegative finite estimates. Top-three keywords
are known only when both component buckets are known. Missing buckets and
invalid dates remain unknown. These values remain DataForSEO estimates, with
the original capture date visible in the screen.
See [historical rank fields](https://docs.dataforseo.com/v3/dataforseo_labs/google/historical_rank_overview/live/).

Both ephemeral history cache envelopes use `contractVersion: 2`; older mapped
zeros cannot reveal whether the source field was present, so they are not
certified observations. A correct cached result retains its original capture
time and scopes. Refresh remains explicitly metered. The saved Backlinks
overview payload and existing row CSV exports use their existing separate
contracts; no historical values or synthetic observations are added to them.
Golden provider fixtures and cache/UI/export regressions exercise this repair.
Live entitlement and responses remain blocked without approved test access.

## Primary references

[G1] Google Search Analytics query documentation, accessed 2026-10-13: https://developers.google.com/webmaster-tools/v1/searchanalytics/query

[G2] Google SEO Starter Guide, accessed 2026-10-13: https://developers.google.com/search/docs/fundamentals/seo-starter-guide

[P1] DataForSEO SERP API, accessed 2026-10-13: https://dataforseo.com/apis/serp-api

[P2] DataForSEO general pricing, accessed 2026-10-13: https://dataforseo.com/pricing

[P3] DataForSEO Backlinks pricing index and endpoint detail, accessed 2026-10-13: https://dataforseo.com/pricing/backlinks and https://dataforseo.com/pricing/backlinks/backlinks
