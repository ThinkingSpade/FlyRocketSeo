# Keyword Trends: open with the keywords, not with a form

Date: 2026-08-10
Status: proposed

## Problem

The Keyword Trends tab opens as a form. Above it sits "What to work on next", which on
`americavending.com` renders exactly three rows — 17, 12 and 10 impressions. Below it, a
prefilled keyword field and the message "Keywords are prefilled. Click Compare to fetch
paid trend data." The user's summary: it should "show like a list of 50-100 keywords to be
targeting, current ranking, and location".

Two distinct causes, and only one of them is a UI problem.

**The list is thin because of its source, not its design.** `TrendingOpportunitiesCard`
is built entirely on Google Search Console (`useTrendingOpportunities.ts:47`). GSC only
contains queries the site was _shown_ for, and `queryMomentum.ts:64` withholds a verdict
below ten impressions. For a young site that ceiling is a handful of rows, and no amount
of layout work raises it. GSC also cannot answer "keywords to be targeting" at all — by
construction it lists only what already ranks.

**The capability already exists, one tab over.** `getKeywordsPage`
(`domainKeywordsPage.ts:40`) returns a domain's ranked keywords with real SERP position,
search volume, traffic, CPC, difficulty and ranking URL — paginated, sortable, filterable,
R2-cached — via `fetchRankedKeywords` (`labs.ts:205`). `DomainKeywordsTable.tsx` already
renders that as a sortable table. Both are wired to Domain Overview and nowhere else. This
work is mostly assembly.

## Scope

- **Part A** — the tab's primary content becomes one merged keyword table.
- **Part B** — a paid discovery run that fires at most once per project, then restores free.
- **Part C** — the manual Compare form and Trends chart move below, unchanged.

Non-goals: no new vendor endpoint; no change to how Domain Overview works; no new
migration beyond one `RUN_FEATURES` value; the Trends chart's own behaviour is untouched.

## Decisions taken with the user

1. **Free and paid on open.** Paid data runs automatically, but only once per project;
   thereafter it is served from history until the user explicitly clicks re-run. This is a
   deliberate, user-affirmed narrowing of the app's no-auto-spend rule, which elsewhere
   requires a click before _any_ spend. It is recorded here because a later reader will
   otherwise read the auto-run as the bug that rule exists to prevent.
2. **One table, rank source labeled per row.** Not two stacked sections, and not
   SERP-rank-only.
3. **Location is a scope line, not a column.** See "Location" below.

## Part A — the merged table

`KeywordTargetsTable` replaces `TrendingOpportunitiesCard` as the tab's primary surface.
The action list is not deleted; it becomes the Action column and a filter, so the page
holds one list rather than two.

Columns: **Keyword · Rank · Volume · KD · Trend · Your URL · Action**.

Reuses `AppDataTable`, `SortableHeader`, `DifficultyBadge` and `ExternalUrlCell`
(`DomainKeywordsTable.tsx:1-22`) rather than introducing a second table idiom.

### Two sources, merged by keyword

|             | Google Search Console                                     | Labs `ranked_keywords`                                   |
| ----------- | --------------------------------------------------------- | -------------------------------------------------------- |
| Cost        | free, every mount                                         | paid, once (Part B)                                      |
| Via         | `getQueryMomentum` (`trendingOpportunities.ts:179`)       | `getDomainKeywordsPage` (`domain.ts:70`)                 |
| Contributes | impressions, momentum, GSC average position, dominant URL | SERP rank, volume, difficulty, CPC, traffic, ranking URL |

Merge is a pure function, `mergeKeywordRows(gscRows, labsRows)`, keyed on the trimmed
lowercased keyword. A keyword present in both produces one row.

For _display_ the table drops `MIN_IMPRESSIONS_FOR_VERDICT`, so thin sites show every GSC
query rather than three. The floor stays where it is for verdict text: a row below ten
impressions shows its numbers and no trend claim, which is what `queryMomentum.ts:56-64`
already means by `direction: "unknown"`.

### Rank must not blend the two numbers

GSC average position and Labs `rank_absolute` are different measurements. GSC's is a
property-level average across every impression and names no URL — `trendingOpportunities.ts:83-89`
already warns it "must never be presented as 'that page ranks #N'". Labs' is a
point-in-time SERP position for a specific URL.

So the Rank cell renders the Labs position where one exists, and otherwise the GSC average
with a muted `avg` marker and a tooltip naming the difference. There is no arithmetic
between them anywhere — no averaging, no "best of", no fallback that hides which one is
being shown.

Trend is blank for a Labs-only keyword. GSC has nothing to say about a term the site gets
no impressions for, and an empty cell states that more honestly than a zero.

Action applies only to rows carrying GSC data, since every verdict in `opportunityActions.ts`
is derived from impressions and position together.

## Part B — the run-once guard

New `RUN_FEATURES` entry: `keywordDiscovery: "keyword_discovery"`
(`analysis-run-features.ts:9`). Values are a storage format, so this is append-only.

On mount `useAutoRestoredRun` looks for a saved run for that feature:

- **`ready`** → render it. Free, and it can never reach a metered fetch
  (`analysisRuns.ts:11-14`).
- **`none`** → fire the paid call exactly once, then record it.
- **`expired` / `unreadable`** → **do not auto-run.** Show "your saved keyword list is no
  longer available — refresh it" with a button. See "Retention" below; this branch is
  reachable in normal operation, not an edge case.

### Which server function fires

Not `getDomainKeywordsPage` directly. That endpoint belongs to Domain Overview: it takes
that tab's pagination, sort and filter arguments, records no run, and is consumed through
`useMeteredQuery`'s authorize gate (`useDomainKeywordsQuery.ts:93`) — a gate this tab
deliberately opens without a click, and which must not be loosened for the tab that still
needs it.

So: a new `getKeywordDiscovery` server function, thin, which calls the existing
`getKeywordsPage` service (`domainKeywordsPage.ts:40`) once with `pageSize: 100` ordered by
traffic, and then records the run the way `DomainService.ts:101` already does. The paid
service itself is reused unchanged; only the caller and the recording are new. Its 12-hour
R2 cache stays useful for the re-run path but is _not_ the once-only guard — a 12-hour
cache would re-bill on the next visit tomorrow, which is exactly what the user asked not
to happen.

Three properties make the auto-run safe:

**The guard is the persisted record.** Not component state, not a session flag, not a ref.
Anything in memory re-fires on every mount and bills repeatedly.

**A failed attempt is recorded too.** Otherwise a project with no credits, or a vendor 5xx,
re-fires on every single mount forever. DataForSEO can charge for a task that then errors —
this repo already carries `DataforseoChargedTaskError` (`client.ts:12`) — so "it failed" does
not mean "it was free". After a failure the tab shows a retry button and does not auto-retry.

Mechanically, `AnalysisRunService.record` records a row pointing at an R2 key holding a
result (`analysisRuns.ts:33-65`), so a failure needs a payload of its own rather than a
second storage path. The stored result schema is therefore a discriminated union:

```ts
keywordDiscoveryResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"),     keywords: [...], geo, fetchedAt }),
  z.object({ status: z.literal("failed"), reason: z.string(), attemptedAt: z.string() }),
])
```

This is deliberate rather than incidental: it makes "have we already tried?" and "what did
we get?" the _same_ question, answered by the one restore call the tab already makes. A
separate flag table or KV key would let the two answers drift, and the drifted state — a
recorded failure the guard cannot see — is an unbounded billing loop.

`status: "failed"` renders the retry state. The user's explicit click writes a fresh run and
supersedes it.

**Preconditions are checked first.** No auto-run when the project has no domain, or the org
has no usage credits (`assertUsageCreditsAvailable`, `client.ts:7`). Both show the
click-to-run state, which is the honest thing to render and costs nothing.

### Accepted risk: the two-tab race

Two browser tabs opened at once both observe `none` and both fire, billing twice. The user
has accepted this rather than add a KV lock. Recorded so a future duplicate-charge report
is diagnosed in seconds instead of investigated from scratch.

### Retention — "cached forever" is not literally true

Run payloads are copied to the durable `analysis-runs/` prefix specifically so they outlive
the 7-day `dataforseo-cache-expiry` lifecycle rule that killed restores in production on
2026-07-31 (`r2-cache.ts:14-35`, `analysisRuns.ts:36-52`). But that prefix's own comment says
it "must be covered by its own 90-day lifecycle rule".

**Unverified assumption:** whether a 90-day rule is actually configured on the bucket today
is not determinable from this repo — R2 lifecycle rules live in the Cloudflare dashboard.
If it exists, a project untouched for 90 days silently loses its list and the next visit
lands in the `expired` branch. That is precisely why `expired` must not auto-re-run: it
would convert a retention policy into a recurring charge nobody asked for. Someone should
confirm the bucket's rules; the design is correct either way, but the honest promise to the
user is "until it expires", not "forever".

## Location

The literal request was a per-row location. That column would print the same value on every
row: `fetchRankedKeywords` takes one `location_code` per request (`labs.ts:205-215`), and the
GSC call uses `dimensions: ["query"]` with no country dimension at all
(`trendingOpportunities.ts:196`).

So location renders once, above the table, as a scope line — _"Rankings in Dallas–Fort Worth,
TX · English · fetched Aug 3"_ — driven by the `ScopeControl` already on the page. The run's
geography is captured at authorize-time through `resolveRunGeo` and persisted in the run's
params bundle, exactly as the Trends chart already does (`TrendsPage.tsx:152-157`, `:274-280`).

Changing the scope control **offers** a re-run; it never relabels existing rows. Silently
relabelling data fetched under a different scope is the specific failure `resolveRunGeo.ts:58-75`
exists to prevent.

## States

| Condition                       | Renders                                                      |
| ------------------------------- | ------------------------------------------------------------ |
| Restored run present            | Full table + scope line + "Refresh"                          |
| No run, preconditions met       | Table with GSC rows only, paid rows streaming in             |
| No run, no domain or no credits | GSC rows + "Analyze americavending.com" prompt               |
| Paid run failed                 | GSC rows + error banner + "Try again" (never auto-retries)   |
| Run expired/unreadable          | GSC rows + "saved list unavailable — refresh"                |
| GSC not connected, run present  | Table with Labs rows only, no Trend/Action columns populated |
| Neither source                  | Existing empty state, unchanged                              |

Every state renders _something_ — the GSC half is free and always available once connected,
so a paid failure degrades rather than blanks the page.

## Testing

Pure functions, unit tested:

- `mergeKeywordRows` — dedupe on normalized keyword; a keyword in both sources yields one
  row; Labs rank wins the Rank cell; GSC-only rows keep the `avg` marker; Labs-only rows
  have no Trend and no Action; **no test may assert a blended rank value, because producing
  one is the defect.**
- `shouldAutoRunDiscovery(outcome, hasDomain, hasCredits)` — returns true only for
  `outcome: "none"` with both preconditions met; explicitly false for `expired` and
  `unreadable`.

Browser verification per repo practice, against a seeded local D1 + R2 rather than a live
paid call.

**Mandatory pre-merge check — the sibling self-fetch trap.** Restoring a run has previously
leaked money in this codebase by a route that has nothing to do with the restoring component:
sibling components self-fetch metered data as soon as they see a non-empty target. Before
this ships, grep the whole rendered subtree for `useQuery` / `useMeteredQuery` and confirm
that populating the table's target cannot enable a paid query in any of them. The table now
puts a domain and 100 keywords into scope on mount, which is a larger surface for that bug
than the tab has ever had. Verify by seeding R2 + `analysis_runs` and watching for outbound
calls, not by reasoning about the code.

## Found in passing, not fixed here

`TrendsPage.tsx` carries `/* eslint-disable max-lines */` at line 1. This change adds a
table to that file. It should be split — the page shell, the discovery table and the
comparison chart are three separable concerns — but that split is not this spec's job to
specify beyond noting that the new table lands in its own module, not in `TrendsPage.tsx`.
