# Overhaul Phase 1 — Correctness and Money

Date: 2026-07-29
Status: approved for planning

## Why this exists

The app reports wrong numbers, spends money it should not, and renders failures as if they were
empty results. Three read-only Codex passes over the repository (correctness, UI consistency,
structural health) returned roughly sixty findings between them. The important result is not the
count: the findings collapse into about eight root causes. Fixing the GSC data-access layer once
resolves six separate user-visible defects. Fixing the error-vs-empty pattern once resolves six more.

This spec covers **Phase 1 only** — the defects that make the app print a wrong number or spend
money. Phases 2 through 4 are sketched here for context and will each get their own spec.

### Evidence provenance

Findings come from three Codex `--sandbox read-only` passes. Codex **cannot execute this
repository's toolchain** on this machine: `pnpm` dies under the PowerShell execution policy, so
`tsc`, `oxlint`, `vitest` and `knip` were unavailable to it. Every Codex finding is static reading
and must be treated as unverified until checked here.

Five headline claims were spot-checked by hand before this spec was written. All five hold, and one
turned out to be worse than reported:

- `GSC_MAX_ROW_LIMIT = 1000` in `src/server/features/gsc/searchAnalytics.ts:35`, with a comment
  stating it exists to protect the MCP context window.
- `subtractRange` subtracts a full `N` days from an inclusive end date, so "last 28 days" spans 29
  dates, and `src/server/features/gsc/searchAnalytics.test.ts:19` asserts the incorrect value as
  expected behaviour.
- `src/server/lib/dataforseo/core.ts:79` retries any 5xx twice and never inspects `init.method`,
  while its own comment describes the operation as an idempotent read.
- `src/serverFunctions/link-insights.ts:120` passes `redirect: "follow"` behind an origin-only
  hostname check, so redirect targets are never revalidated.
- The cross-dialect timestamp defect is **not one bad comparison** but a schema-wide format
  divergence across ~35–40 columns, guarded by a parity test that compares `hasDefault` as a boolean
  while its name claims it checks defaults. See 1.4; this reclassified the workstream from a
  one-line fix to a data migration.

The last of these is the argument for the verification protocol at the end of this document: Codex's
findings are reliable enough to act on and specific enough to check, but their _scope_ has to be
re-derived here.

## Phase map

| Phase             | Covers                                                                                                                                               | Done when                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 (this spec)** | GSC pagination and truncation honesty, GSC aggregation semantics, paid-retry safety, cross-dialect timestamps, date ranges, SSRF, unsupported claims | Every number on screen is correct or explicitly labelled a sample, and no path can bill twice for one click                                  |
| 2                 | Honest loading/error/empty/zero states, plus the visible design consolidation: one page shell, `PageHeader`, `AppCard`, KPI tiles, `SectionHeader`   | Every page distinguishes loading / error / not-connected / genuinely-zero / filtered-to-zero, and pages are assembled from shared primitives |
| 3                 | Chart tokens and dark mode, table + sort + pagination consolidation, dialog and keyboard accessibility, URL-backed filters                           | A new feature page is composed, not copy-pasted                                                                                              |
| 4                 | Domain normalization (13 implementations to one), the four god pages, metric semantics, dead exports                                                 | Changing a metric means editing one file                                                                                                     |

## Phase 1 workstreams

Each workstream is one pull request. The order matters: 1.1 and 1.2 establish the data contracts
that later work reads.

### 1.1 Split the GSC row cap by caller, then paginate

**Problem.** `GSC_MAX_ROW_LIMIT = 1000` was chosen to protect the MCP agent's context window, and
that constraint is legitimate for the MCP path. The analytics UI inherited it silently.
`src/serverFunctions/trendingOpportunities.ts:51` requests 5,000 rows and tests
`rows.length >= 5000` to detect truncation — a condition the clamp makes unreachable. The UI
therefore receives 1,000 click-sorted rows and reports that nothing was truncated.

**Concrete failing input.** A property with 1,500 query rows where the first 1,000 all have clicks.
A high-impression, zero-click query sitting at row 1,001 never reaches Trending Opportunities, which
then tells the user Search Console has no queries with enough impressions yet.

**Downstream defects this single cause explains.** False "no striking-distance queries"
(`searchPerformance.ts:26`); false "no cannibalization detected" (`link-insights.ts:20`); period
comparisons that report movement created purely by sample membership changing between two
independently truncated top-1,000 pulls (`searchPerformance.ts:207`); CSV exports described as the
full dataset that stop at 1,000 rows (`searchPerformance.ts:179`); page-attribution shares computed
against a denominator containing only returned rows, which can invert a consolidate-versus-optimize
recommendation (`trendingOpportunities.ts:105`); and a country selector hard-capped at 25 that hides
every country ranked lower by clicks (`searchPerformance.ts:30`).

**Design.**

- Keep the MCP ceiling where it is. Give the app path its own, separately named ceiling.
- Add a paginating fetch that walks `startRow` until exhaustion or the ceiling. Google permits
  25,000 rows per request and further pagination beyond that.
- Every GSC fetch returns `{ rows, rowsExamined, truncated }`. `truncated` is derived from the
  ceiling that was actually applied — never from a hardcoded literal compared against a requested
  value.
- Aggregates propagate the flag rather than dropping it.
- Empty states become conditional on it: "no striking-distance queries" only when completeness was
  established, otherwise "none among the N queries examined". Exports carry the applied limit.

**Open question, to be resolved by measurement before implementation.** Where to set the app
ceiling. Fetching more rows is I/O, which is cheap on Workers; aggregating them is CPU, and this
deployment has already hit the Cloudflare free-plan CPU limit during the audit crawl. The ceiling
must bound post-processing cost, not just request count. Measure against real payloads and take a
Codex second opinion before committing to a number. Note that GSC is a free provider — extra calls
cost latency and quota, not money.

**Tests.** Truncation flag true when the ceiling is reached and false when the result set is
genuinely exhausted; pagination assembles pages in order without duplicating or dropping boundary
rows; empty-state copy switches on the flag.

### 1.2 One module owns GSC aggregation semantics

**Problem.** Page-dimension rows are summed as though they were property-level counts. Google counts
a property once when several of its URLs appear for one query; page aggregation counts each URL
displayed. Summing page rows is valid as "URL appearances" and invalid as query demand.

**Concrete failing inputs.**

- One result set shows both `/widgets` and `/sale/widgets` for query `widgets`. GSC returns two
  query×page rows of one impression each. `buildQueryTotals`
  (`src/server/features/gsc/searchPerformanceReport.ts:84`) reports two impressions; the property
  received one. Branded and non-branded splits inherit the inflation.
- Across 100 searches where URLs A and B both appear, `src/server/features/gsc/linkInsights.ts:153`
  reports 200 impressions and derives a 50% "traffic off the leader" split, feeding an inflated
  severity and clicks-at-stake estimate. The property received 100 impressions.
- For one query, URL A averages position 1.0 from a single impression and URL B averages 8.0 from
  1,000. `searchPerformanceReport.ts:152` takes the minimum, names A the best page, excludes the
  query from striking-distance work, and picks A as the internal-link target. GSC position is an
  average over impressions per dimension row; a minimum across separately averaged rows reconstructs
  nothing.
- `/widgets` at position 8 with 1,000 impressions and zero clicks appears in both `strikingDistance`
  and `ctrOpportunities`. `src/client/features/opportunities/opportunityModel.ts:92` appends both
  and displays their sum — 80 + 30 = 110 "clicks at stake" — as if they were independent gains over
  the same impressions.

**Design.** A single `gscAggregation` module encoding the rule once:

- **Query-dimension rows are the only source of demand totals** (impressions, clicks, CTR).
- **Query×page rows are for attribution and distribution only**, never totals.
- Ranking bands use query-dimension position. A representative page is chosen by impression or click
  ownership; where no page dominates, the query is represented as split rather than given an
  invented winner.
- Opportunities merge by query and page into one incremental scenario before display. At minimum,
  overlapping estimates take the maximum rather than the sum.

Fetching a second GSC call per view to obtain query-dimension totals is acceptable: GSC is free.

**Tests.** The four failing inputs above, as unit tests against the aggregation module, written
before the implementation.

### 1.3 Stop paid calls being retried as reads

**Problem.** `src/server/lib/dataforseo/core.ts:79` retries every 5xx twice without checking
`init.method`, while the surrounding comments assert the operation is an idempotent read. The
DataForSEO live endpoints reached through it are predominantly POSTs across 60 SDK calls in 15
provider modules. `src/server/lib/audit/lighthouse.ts:18` adds three application-level attempts on
top, so one strategy can reach nine HTTP attempts. `src/server/workflows/siteAuditWorkflowPhases.ts:235`
places up to 20 Lighthouse calls in a single unconfigured workflow step; an R2 or persistence
failure after the provider calls succeed can replay the whole paid batch.

**Design.** Retries become opt-in per operation with the default off, and genuinely idempotent reads
declare themselves explicitly. The Lighthouse workflow batch is set to zero retries, matching the
convention already established in `siteAuditWorkflowFallback.ts:21`. The four client `retry: 1`
settings on paid paths (`BacklinksTimelineSection.tsx:65`, `ContentOptimizerPage.tsx:374`,
`PageExplorerPage.tsx:137`, `LocalRankGridPage.tsx:194`) drop to zero.

**Tests.** `core.ts` currently has no test importing it. Add retry-count and method-classification
tests as part of this workstream: a POST that receives 5xx is attempted exactly once; a declared
read is attempted three times; the shared timeout signal is not restarted per attempt.

### 1.4 Cross-dialect timestamps and snapshot determinism

Codex reported this as a single wrong comparison in rank tracking. Verifying it here showed the
defect is systemic, and that the test which should have caught it cannot.

**Problem, as verified.** The two dialects store **different text formats in the same column**.
Timestamps are `text` on both sides (`src/db/pg/app.schema.ts:27` defines
`timestampColumn = (name) => text(name)`), but the defaults diverge:

|             | Default expression                                      | Stored value               |
| ----------- | ------------------------------------------------------- | -------------------------- |
| D1 / SQLite | `sql`(current_timestamp)`` (`src/db/app.schema.ts:332`) | `2026-07-22 12:00:00`      |
| Postgres    | `isoNow` (`src/db/pg/app.schema.ts:26`)                 | `2026-07-22T10:00:00.000Z` |

This affects roughly 35 columns on D1 and 40 on Postgres across the four schema pairs (`app`,
`billing`, `gsc`, `sam`). **Any string comparison against any of them is dialect-dependent.**

`src/server/features/rank-tracking/services/rankTrackingResults.ts:30` is the confirmed instance:
`toSqliteTimestamp` (`rankTrackingTimestamps.ts:2`) produces the space-separated SQLite form, and
that value is used in a dialect-independent repository call. Character comparison sorts `T` (0x54)
above a space (0x20), so on Postgres `lte(checkedAt, cutoff)` rejects **every** ISO row on the cutoff
date regardless of its actual time. A seven-day rank comparison silently reads an older snapshot and
reports the wrong delta.

**The guard that should have caught this does not.** `src/db/schema-parity.test.ts:154` is named
"has matching columns (name, nullability, type, default, enum)", but `columnsOf` records
`hasDefault: col.hasDefault` — a boolean. It asserts both sides _have_ a default and never compares
what the defaults produce. The test passes today while the two databases hold incompatible values.

**Also in scope.** `src/server/features/rank-tracking/repositories/snapshotQueries.ts:168` joins
against `MAX(checked_at)` with no tie-breaker. SQLite's `current_timestamp` has one-second
precision, so two completed runs in the same second leave the displayed "latest" position dependent
on row return order.

**Design.**

- Pick one canonical stored format (ISO-8601 UTC, matching the Postgres side) and migrate the D1
  defaults and existing rows to it. Both dialects then sort and compare identically as text.
- Remove `toSqliteTimestamp` from dialect-independent call paths; comparisons format to the
  canonical form.
- Strengthen the parity test to compare the _rendered default value_, not `hasDefault`, and correct
  its name if it still does not check everything the name claims.
- Add deterministic ordering (`checked_at DESC, run_id DESC, id DESC`) for latest-snapshot selection.

**Sequencing risk.** The D1 format migration rewrites stored timestamps, so it needs a migration
against production D1 and must land before any code that assumes the canonical format — the same
ordering constraint that applied to migration 0037 during the geo work.

**Tests.** A parity assertion comparing default _values_ across dialects, which must fail against
today's schemas before the fix; the seven-day comparison against ISO-formatted rows; a same-second
two-snapshot fixture asserting a stable result.

### 1.5 Date ranges

**Problem.** `subtractRange` subtracts a full `N` days from an inclusive end date, so "last 28 days"
covers 29 dates and "last 7 days" covers 8. `searchAnalytics.test.ts:19` asserts the wrong start
date as correct. Separately, "today" is resolved in UTC, but Google defines Search Analytics
`startDate` and `endDate` in Pacific Time, so for part of each day the range is shifted by a
calendar day before the 3-day lag offset is applied.

**Design.** Subtract `N-1` for inclusive ranges. Resolve "today" in `America/Los_Angeles` before
applying the lag.

**Tests.** Replace the bug-pinning assertion with an inclusive-day-count assertion that fails if the
window is ever off by one again. Add a case at a UTC time that falls on the previous Pacific date.

### 1.6 SSRF in the live link checker

**Problem.** `src/serverFunctions/link-insights.ts:81` validates that the source and target
hostnames match, then fetches with `redirect: "follow"`. A submitted URL that responds
`302 Location: http://127.0.0.1:8787/...` causes the Worker to issue a server-side request to a
private address, bypassing the private-address protections already implemented in
`src/server/lib/audit/url-policy.ts`. Requires an authenticated project member.

**Design.** Follow redirects manually, validating every hop through the existing `url-policy.ts`
before issuing it. Require both URLs to belong to the project's verified property.

Do not merge `url-policy.ts` with `url-utils.ts`: they intentionally hold different rules
(SSRF/IP-literal policy versus crawl origin semantics).

**Tests.** A redirect chain terminating at a loopback, link-local, and private address is rejected
at the hop, not at the origin.

### 1.7 Claims the data cannot support

Four user-facing statements assert causes, completeness, or absences the underlying data does not
establish. These are corrected as defects:

| Statement                                                                                            | File                                                           | Why it is wrong                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A backlink profile is "built almost entirely from low-authority sites"                               | `src/client/features/backlinks/domainQuality.ts:55`            | Computed from one 100-row page while described as the whole profile; the remaining 900 rows can invert it                                                        |
| A profile is nofollow-heavy, so the headline count overstates authority reaching the site            | `src/client/features/backlinks/followSplit.ts:37`              | DataForSEO defines `referring_domains_nofollow` as domains with **at least one** nofollow link — an overlapping subset, not nofollow-only domains                |
| The keyword base is broad enough that "no single ranking loss should sink this domain's traffic"     | `src/client/features/insights/verdicts/domain.ts:133`          | Input holds keyword counts by position and one aggregate traffic total, with no per-keyword distribution; concentration is not calculable from it                |
| Pages "compete against each other, splitting clicks and rankings", with a consolidate recommendation | `src/client/features/link-insights/CannibalizationPage.tsx:50` | Dimensions requested are query and page only. Device, country, date and same-SERP coexistence are unobserved; multiple URLs establish plurality, not competition |

Separately, `src/client/features/search-performance/CtrOpportunitiesTable.tsx:20` states that low
CTR proves the title and meta need rewriting. This is conventional SEO guidance stated too strongly
rather than a false claim about the user's data; soften it to an investigation candidate and keep
the guidance.

## Non-goals for Phase 1

- All visual and component work (Phase 2 and 3).
- Domain normalization consolidation. Thirteen implementations with differing `www`, trailing-slash
  and punycode behaviour is real, but no concrete failing input was produced, so it stays in Phase 4.
- God-file splits, dead-export removal, metric-semantics unification (Phase 4).
- Schema reorganisation.

## Constraints — do not change these while doing the above

- Do not collapse the D1 and Postgres schemas into one cast-driven schema; keep dialect-native
  declarations and the `schema-parity.test.ts` contract.
- Do not bypass `createDataforseoClient`; it is the hosted metering boundary per
  `specs/0002-hosted-dataforseo-metering-with-autumn.md`.
- Do not eagerly import the DataForSEO SDK graph. `src/server/lib/dataforseo/client.ts` lazy-loads
  fetchers deliberately; a static barrel would undo the startup-bundle work.
- Do not re-enable automatic paid-query refetching in `src/client/lib/useMeteredQuery.ts`. Its 35
  call sites are the main protection against paid calls firing during page restoration.
- Do not turn cached analysis restoration into a live refetch; expired-object reads for
  already-paid runs are intentional.
- Do not add workflow retries to the DataForSEO audit fallback or rank task submission.
- Do not hand-edit `src/routeTree.gen.ts`.

## Verification protocol

Codex cannot run this toolchain, so **no "it passes" claim may originate from a Codex report.**

Per pull request:

1. A failing test encoding the correct behaviour is written before the fix. For 1.5 this means
   deleting an existing test that asserts the bug.
2. `pnpm ci:check` (prettier, knip, tsc, oxlint) and `vitest run` pass locally, with output shown.
3. Anything user-visible is verified in a browser before it is called done.
4. A Codex adversarial pass reviews the diff, briefed to supply a concrete failing input per finding.
   Findings are triaged into real defects versus domain rationale before anything is changed.
5. Provider-contract questions go to Codex against live provider documentation **before** arithmetic
   is written on the field, not after.

Workstream 1.4 additionally carries a schema migration. It must reach production D1 **before** the
code that assumes the canonical timestamp format deploys, and the rewrite of existing rows needs a
verified rollback path, since it changes stored values rather than adding a column.

## Open questions

1. The GSC app-path row ceiling (1.1). Resolve by measuring aggregation CPU against real payloads,
   with a Codex second opinion. Blocks only 1.1's final constant, not the surrounding design.
2. Whether GSC per-property quota limits make aggressive pagination impractical for large
   properties. Check provider documentation during 1.1.
