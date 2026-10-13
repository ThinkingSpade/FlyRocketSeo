# Metric definitions and data integrity

Reviewed 2026-10-13 against the original repository baseline and this repair branch. This metric-family register is supplemented by consumed-field contracts for the existing application. It does not certify deployed reports or live provider entitlement.

## Current contract coverage

The remaining-roadmap continuation from `bb93af37` closes the identified consumed-field gaps in existing keyword/Labs, Trends, competitor/gap/bulk, SERP/rank, local/grid/review/citation, AI/Prompt and page/content paths. Refer to `keyword-contract-coverage.md`, `rank-local-contract-coverage.md`, `ai-backlinks-contract-coverage.md` and `page-content-contract-coverage.md` for implemented fields, cache/saved/legacy handling, derived claims, source/scope/capture exports and primary provider definitions. Final source head `1096bcf0` passes 3,780 native tests in 396 files, static checks and the production build. The integrated browser execution status is recorded separately in `verification-results.md`; actual application operations across all 24 destinations are mapped in `tool-operation-coverage.md`.

Requested SEO hostnames now remain intact independently of provider subdomain flags. Domain registration/WHOIS/availability intentionally use an explicit registrable-domain helper, retaining parent-domain semantics and batch deduplication. These are separate dataset contracts. Provider endpoints that cannot honor a requested exclusion disclose their actual scope.

All 50 D1 migrations and 24 PostgreSQL migrations are exercised with isolated data. Rank observations and keyword estimates retain captured scope instead of inheriting later configuration changes. Queued task collection verifies task identity and declared scope before persistence. Local review tasks require an organization/project-owned durable receipt before free collection. Missing/partial evidence never authorizes global competitor leaders, network conclusions or a newly dated historical observation.

Backlinks, audit and Search Performance exports now retain original source/scope/capture and persistent coverage/truncation; precise values and formula safeguards are preserved. Focused native/download checks and the integrated native suite pass; refer to `verification-results.md` for actual application export execution. Live OAuth/providers, GBP/Sheets authorization, deployed job recovery, Hyperdrive/R2 configuration and production migration/release remain blocked or approval-gated. The named consumed fields are fixture verified; unused SDK fields, future export controls and optional P3 datasets require their own contracts.

## Evidence classes and required display contract

Values must retain their source, evidence window, capture time, scope, and availability. Distinguish observed first-party data, provider estimates, internally calculated heuristics, restored/stale observations, and missing evidence. The family registers specify the implemented contracts and their finite verification boundaries.

A suggested shared envelope contains `value`, `unit`, `source`, `observedFrom`, `observedTo`, `fetchedAt`, `projectId`, `target`, `country`, `device`, `coverage`, `availability`, and `methodVersion`. Use null for unknown; zero requires successful applicable observation. Show restored data's original capture date, not the time its tab reopened. Do not interpolate missing historical samples into invented observations.

## Metric-family register

- GSC clicks and impressions: observed Search Console data from `gscClient.ts`, GscService, and `serverFunctions/searchPerformance.ts`. The inspected report requests current/previous daily data, up to 1,000 query-page rows, 2,500 property-query rows, and 25 countries. These are requested subsets, not a complete keyword census. Preserve aggregation type and filtering context.
- GSC CTR and average position: use the report's aggregation helpers and underlying impressions, not an unweighted average of row percentages/ranks. Position is an observed average in that report's context, not necessarily today's universal rank. Google documents top-row limitations and omission of dates without data [G1].
- Opportunity click scenarios: internal, uncalibrated assumptions in `opportunityModel.ts`; ranking scenarios use an assumed 11% target CTR and consolidation assumes 30% recovery of split share. They are not forecasts, measured losses, or additive traffic. The branch labels scenarios, shows the evidence window, rejects invalid numeric inputs, and uses the largest single scenario as the headline rather than a sum.
- Opportunity counts: detector output after overlap merging and project-profile exclusions, not an external SEO fact. Preserve separate action types and disclose omitted profile matches. Counts remain unknown when required GSC evidence is unavailable.
- Keyword volume, difficulty, CPC, and competition: provider-derived values through DataForSEO keyword/Labs adapters and research mapping. Keep market, language, provider unit/scale, and capture time. Do not relabel advertising competition as organic ranking difficulty or compare different vendors' difficulty scales as equivalent.
- Trends interest: DataForSEO Google Trends relative interest on a 0–100 scale, not search volume. A reported zero means insufficient data under this provider contract; explicit missing observations stay gaps. Reported averages require their applicable coverage before derived momentum or verdicts are shown. Captured source, region/language and exact date window survive restoration; legacy curves retain useful observations with unverified provenance.
- Organic domain traffic and keyword counts: DataForSEO Labs estimates (`DomainService.ts`, `domainRankHistory.ts`), not analytics visits. Historical points are mapped from valid returned year/month records. The continuation preserves missing/partial top-three buckets as unknown and versions mapped cache contracts; fixture verification is described below.
- Backlinks, referring domains, link history, and provider rank: DataForSEO backlink services/mappers. Index coverage is provider-specific. The continuation repairs absent new/lost event fields, unsupported pre-May-2021 placeholders and invalid values to null, while preserving genuine reported zero. Live entitlement remains unverified.
- Ahrefs Domain Rating: `server/lib/ahrefsDomainRating.ts` and `shared/ahrefsRating.ts`. Keep it named as Ahrefs DR, distinct from provider domain rank and Google signals. The existing mapper deliberately preserves returned DR 0 while null means no usable answer. Availability of this free endpoint is not an API service-level guarantee.
- Backlink spam score: `client/lib/spamScore.ts` treats it as a review signal, not proof that disavowal is appropriate. No disavowal automation was introduced.
- Rank tracking and fluctuation: stored run observations and captured search depth/market/device, not a backfilled history. Missing/failed checks and outside-depth results remain distinguishable. Existing scheduler/run guards and billing safeguards remain; partial workflow failures preserve valid device observations, while entirely failed runs do not advance the last successful check.
- Audit findings and affected pages: captured crawl records in AuditService/repositories and workflow output. This branch checks missing/loading/empty evidence explicitly and counts exact distinct affected URLs. Recorded 200 responses are required for these metadata checks; absent or failed capture does not prove missing metadata. A successful HTTP fetch still does not prove indexability or a complete rendered page.
- Audit health, Lighthouse, and on-page scores: crawler/provider/lab checks, not guarantees of rankings or field user experience. Each chart must identify which engine and captured pages produced it. Word count and multiple H1 elements alone are not automatic ranking failures [G2]. This branch corrects the Opportunities wording, not every other scoring model.
- AI visibility, mentions, and share of voice: provider sample results and the tracked snapshot service. Current history checks target/market/competitor-set scope and original capture, suppressing uncertified legacy totals and incomplete sampled shares. The measured universe is the provider's sampled prompts/results, not all AI answers or all users.
- Internal-link recommendations and content suggestions: derived candidates from GSC/crawl/content plus optional model interpretation. Verify source text, destination relevance, existing links, and capture freshness before recommending an anchor. A model explanation is not a measurement.
- Page Explorer and content briefs: Labs keyword rows are a bounded hostname/path sample, while backlinks use the captured full URL. Unknown provider totals do not become sample size, and missing traffic prevents a complete aggregate or concentration claim. Briefs retain separate original SERP and related-term captures; unknown word counts and missing heading capture do not become zeros. Outline consent belongs to the selected brief and is never carried into a different restored capture.
- Local listings, GBP metrics, and rank-grid cells: distinguish connected GBP first-party records, third-party business/search observations, and internal map summaries. OAuth scope, geography, cell failures, and scan times need explicit reporting. Expiry/availability data from domain providers is a separate specialist dataset.
- Citation discovery: an explicitly authorized organic SERP search scoped to the captured business/disambiguator and market. A directory not observed in the returned search is unconfirmed, rather than proof that no listing exists. Scoped cache reuse and saved results preserve the original capture; failed writes do not copy stale history.

## Freshness, isolation, and spend

`buildCacheKey` hashes sorted top-level parameters; identity must still contain organization/project, target, market, device, window and contract version where applicable. The coverage registers document these fields for the named existing paths. Versioned cache reads verify captured scope; saved restoration preserves original metadata, and uncertifiable legacy derived claims are suppressed while useful rows remain readable.

Saved analysis payloads can be restored past soft TTL without a new paid call. Preserve that behavior while displaying staleness. DataForSEO's core transport avoids automatic replay of billable POSTs. Audit any UI-level Retry or Refresh separately: a retry label alone does not prove it is free. Scheduled checks must remain tied to explicitly configured schedules and budgets.

## Provider plan and current cost checks

Reuse the existing Google Search Console connection and crawl records for the first-party opportunity engine; do not acquire a second keyword/backlink stack as a prerequisite. Infrastructure and optional model costs still exist even where no SEO-provider request is made.

DataForSEO's official SERP page lists starting rates of $0.0006 per standard-queue SERP and $0.002 per live SERP for the default ten-result unit [P1]. Illustrative arithmetic only: 100 keywords checked daily for 30 days, one location/device and one such unit each, is 3,000 units: $1.80 standard or $6 live before deeper results, optional parameters, retries, or other endpoints. This is not a quote for the application's actual configured depth. General minimum account payment is listed as $50 [P2].

The official Backlinks pricing index lists a starting $0.024 per task plus $0.000036 per row [P3]. Confirm endpoint details, account entitlement/minimums, row counts, and add-ons before enabling new usage. Do not assume the SERP unit price covers keyword databases, backlinks, AI mentions, or on-page analysis. No subscription or paid provider change was made.

Additional providers should require a demonstrated unmet dataset need, documented marginal cost, explicit user authorization, fixture-backed mapping, and clear unavailable states. Optional AI should explain provided evidence, not generate substitute metrics.

## Integrity coverage boundary

Consumed-field contracts and golden fixtures now cover the existing provider paths described in the coverage registers. Null/zero/partial/stale/invalid states, missing date buckets, scope changes and tenant isolation are tested at appropriate transport/service/consumer boundaries. This is finite coverage of consumed fields, not every unused SDK field or a substitute for live responses. New datasets, detector families and export controls need their own contracts when introduced.

### Exact-page and persisted evidence continuation

Page Investigation requests independent current/prior exact-page final-data observations and supporting query rows. Property/connector changes, invalid values, unrelated targets and provider-clamped date windows fail their contract. Missing daily observations display Unknown; genuine observed zero remains zero. Partial daily coverage and top-query limits are visible.

Saved work retains the full evidence scope and capture time in content-addressed snapshots. Pacific GSC calendar dates govern baseline exclusion and observation lag. Comparable sufficient results record observed changes with seasonality/concurrent-work limitations; missing or incomparable observations remain pending. Reruns preserve human progress and past comparisons. Complete captured existing-link evidence can reconcile one pair without calling it fixed; partial/failed captures cannot.

These contracts passed native/service/real SQLite checks and are exercised through the isolated authenticated application. Local PostgreSQL 17.11 migrations/repositories and isolated application R2 cleanup now execute successfully. Live Google/provider responses, Hyperdrive, deployed storage configuration and production migration remain unverified release gates. See `verification-results.md` and `../product/implementation-checklist.md`.

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

### Broader provider contracts and storage verification

Domain overview preserves safe integer counts, missing rank buckets, genuine zero and estimate precision through cache and saved-run restoration. Partial distributions produce neither shares nor concentration verdicts. Legacy ranking breakdowns that previously synthesized absence as zero are suppressed; useful headline data and original capture time remain. Overview explicitly discloses provider domain scope: the requested subdomain toggle does not constrain that endpoint's estimates. Cache writes settle before saved-run copying, including delayed puts and prior payloads.

Backlinks summary, four list mappers, saved overview/history, chart options, status fields, CSV and toxic-link/disavow consumers preserve unknown versus zero. Invalid calendar dates, unsupported counts/ranks and pre-May-2021 event placeholders remain unavailable. Null chart gaps stay visible; incomplete or overflowed disavow totals remain unknown. Scope mismatches and malformed successful SDK tasks reject data while retaining billed-task metadata; controlled metering tests confirm the error accounting path. These are fixture-backed contracts, not a paid-task or live entitlement pass.

Real SDK HTTP envelopes, services/cache/restoration, React/CSV consumers and actual persisted application browser views are exercised. The subsequent remaining-roadmap continuation closes the identified consumed-field gaps for keyword/Labs/Trends, competitor/bulk/comparison, local/rank/citation/AI, page/content and hostname normalization. The family registers define that coverage; browser execution status remains in `verification-results.md`, and live provider responses and unused fields remain outside it.

Storage cleanup protects all evidence/baseline/history references, fences writers through attachment, retires deleted keys and supports explicit retries after real R2 deletion followed by SQL failure. Production 24-hour grace is tested natively; only the guarded acceptance server substitutes zero grace for freshly seeded local R2 fixtures. Current real PostgreSQL verification applies/replays all 24 migrations and passes 17 runtime cases. See `postgresql-runtime.md` and the execution checklist for the local/live boundary.
