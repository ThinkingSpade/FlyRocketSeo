# Phase 2 — Honest states and visible coherence (design)

Date: 2026-07-30
Status: design accepted; implementation starting with the state resolver

## Provenance and review

The component APIs below were designed by a Codex pass briefed with the real call sites, then reviewed
here. Every proposed prop is backed by at least two existing usages with `path:line` evidence, because
the brief rejected any prop no current caller needs.

Three properties of this design are the reason it was accepted, and they should survive any revision:

1. **`QueryStateBoundary` is a pure renderer.** It never accepts a `UseQueryResult`, never calls
   `refetch`, and never changes query options. That is what preserves `useMeteredQuery`'s
   no-auto-refetch guarantee — the single protection against paid calls firing on page restore.
2. **The state union makes the Phase 1 bug unrepresentable.** "Error" and "empty" cannot both be true,
   because they are variants of a discriminated union rather than two booleans. Phase 1 spent most of
   its effort on pages that rendered a failure as an empty result.
3. **Sampling is per-pull, never a combined boolean.** A truncated pull overrides the caller's absence
   sentence entirely, so a genuine zero and a truncated zero cannot take the same render path. Phase 1
   had to fix exactly that conflation twice.

The riskiest step is called out at the end, and its mitigation — build and test a PURE state resolver
before writing any JSX — is what this branch implements first.

---

# FlyRocketSEO Phase 2 shared component design

## Scope and fixed decisions

This design covers live application surfaces only. Static reading found:

- 8 pages already use the same `max-w-screen-2xl`, `gap-3`, `p-4` shell.
- 6 pages use the older outer scrolling wrapper and 7 use a nested `max-w-7xl` wrapper.
- The canonical live card classes occur 65 times across 43 files.
- Dashed empty-state surfaces occur 28 times across 21 files.
- `InsightIcon` appears 51 times across 33 files.
- Existing shared components remain: `InsightTile` (46 callers), `InlineQueryError` (12), `AppDataTable` (19), `TablePagination`, `SortableHeader`, `Modal` (14), `SegmentedToggle`, and `TrendSparkline`.

All proposed live components use DaisyUI palette classes such as `bg-base-100`, `border-base-300`, and `text-base-content/*`. They introduce no fixed live colours. Both themes and the chart variables already exist in `src/client/styles/app.css:9-16`, `src/client/styles/app.css:24-93`, and `src/client/styles/app.css:350-357`.

No files were modified and no `pnpm`, `tsc`, `vitest`, or `oxlint` command was run.

---

## 1. Component APIs

### `AppPageShell`

```ts
import type { ReactNode } from "react";

export type AppPageShellProps = Readonly<{
  children: ReactNode;
}>;
```

`AppPageShell` replaces the duplicated live-page layout wrappers. It should render one `<main>` with `mx-auto flex w-full max-w-screen-2xl flex-col gap-3 p-4 pb-24 md:pb-8`. The `max-w-screen-2xl` and `gap-3` version wins because it is the newer density decision already used by the major research pages; the older `max-w-7xl`, `space-y-4`, `md:p-6` composition migrates without a compatibility prop. It must not add `overflow-auto`: `AuthenticatedAppLayout` already owns scrolling at `src/client/layout/AppShell.tsx:129-140`, and several pages currently create a redundant second scroll container.

Prop evidence:

| Prop       | Existing callers requiring it                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `children` | The complete page content is currently nested under the shell at `src/client/features/opportunities/OpportunitiesPage.tsx:117-343` and `src/client/features/trends/TrendsPage.tsx:362-544`; the older two-wrapper equivalent is at `src/client/features/search-performance/SearchPerformancePage.tsx:209-217` and `src/client/features/domain/DomainOverviewPage.tsx:740-755`. |

No `className`, `maxWidth`, `spacing`, `density`, or `padding` prop is justified. Those differences are cosmetic drift. Narrow account forms such as project settings remain outside this project-feature shell.

**Disposition:** new component replacing live project-page wrappers. It does not replace `AuthPageShell`, `LoadingShell`, or report layout components.

---

### `PageHeader`

```ts
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type PageHeaderProps = Readonly<{
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
}>;
```

`PageHeader` replaces inline `<h1>` blocks. It renders an `h1` at `text-xl font-semibold`, an optional bare `size-5` icon, descriptive copy at `text-sm text-base-content/60`, and an action area aligned to the upper right. The compact `text-xl` header wins over the older `text-2xl` version; no `size` prop preserves both. `description` is `ReactNode` because existing descriptions interpolate limits and project values. `actions` is intentionally a slot because the real controls have substantial domain behavior—scope selection and freshness—not generic button behavior.

Prop evidence:

| Prop          | Existing callers requiring it                                                                                                                                                                                                                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`       | `src/client/features/opportunities/OpportunitiesPage.tsx:119-122`; `src/client/features/competitors/CompetitorsPage.tsx:176-179`; dynamic project title at `src/client/features/dashboard/ProjectDashboardPage.tsx:35-40`.                                                                                                             |
| `description` | `src/client/features/opportunities/OpportunitiesPage.tsx:123-127`; interpolated keyword limit at `src/client/features/trends/TrendsPage.tsx:369-373`; `src/client/features/domain/DomainOverviewPage.tsx:745-748`.                                                                                                                     |
| `icon`        | `src/client/features/opportunities/OpportunitiesPage.tsx:119-122`; `src/client/features/serp/SerpOverviewPage.tsx:625-628`. It remains optional because Domain and Backlinks currently have no page icon at `src/client/features/domain/DomainOverviewPage.tsx:742-749` and `src/client/features/backlinks/BacklinksPage.tsx:306-312`. |
| `actions`     | Scope controls at `src/client/features/trends/TrendsPage.tsx:363-380` and `src/client/features/topic-clusters/TopicClustersPage.tsx:239-256`; freshness actions at `src/client/features/domain/DomainOverviewPage.tsx:742-754` and `src/client/features/competitors/CompetitorsPage.tsx:174-189`.                                      |

No `tone`, alignment, title size, or arbitrary `className` prop should be added.

**Disposition:** new component replacing inline page headings. It composes existing controls such as `ScopeControl` and the extended `DataFreshness`.

---

### `AppCard`

```ts
import type { ReactNode } from "react";

export type AppCardProps = Readonly<{
  children: ReactNode;
  flush?: boolean;
}>;
```

`AppCard` replaces raw live card wrappers. The normal form renders `card border border-base-300 bg-base-100 overflow-hidden` with one `card-body gap-3 p-4`. That single body spacing wins over the current `gap-2`, `gap-3`, `p-4`, and `p-5` variants. `flush` is the only variant because it is structural rather than cosmetic: table and list surfaces must reach the card edges and supply their own header, border, and scrolling regions. It must not accept padding, radius, border, background, tone, shadow, or `className` props.

Prop evidence:

| Prop       | Existing callers requiring it                                                                                                                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `children` | Form card at `src/client/features/trends/TrendsPage.tsx:387-449`; analysis card at `src/client/features/opportunities/OpportunitiesPage.tsx:165-253`; section card at `src/client/features/serp/SerpOverviewPage.tsx:779-791`.                                                                                |
| `flush`    | Edge-to-edge SERP table at `src/client/features/serp/SerpOverviewPage.tsx:830-832`; Page Explorer table at `src/client/features/page-explorer/PageExplorerResults.tsx:91-93`; tracked-domain list with its own header and dividers at `src/client/features/rank-tracking/RankTrackingDomainList.tsx:128-150`. |

`DashboardCard`, `AnalyzeDomainPrompt`, and feature-specific card adapters should be reimplemented on top of `AppCard`, not deleted merely to expose large slot APIs on `AppCard`.

**Disposition:** replaces raw card/body wrappers; extends feature adapters through composition.

---

### `SectionHeader`

```ts
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type SectionHeaderProps = Readonly<{
  headingLevel: 2 | 3;
  title: ReactNode;
  icon?: LucideIcon;
  description?: ReactNode;
  actions?: ReactNode;
}>;
```

`SectionHeader` replaces repeated card-heading rows and internally uses the existing `InsightIcon`. `headingLevel` is required because the current hierarchy genuinely contains both page-level card sections (`h2`) and nested dashboard/analysis sections (`h3`); this is accessibility structure, not a visual variant. All headings use the same `text-sm font-semibold` presentation. Icons use the existing neutral native treatment. Existing primary/info/warning icon tones in headings are cosmetic drift and migrate to neutral; no `tone` prop preserves them.

Prop evidence:

| Prop           | Existing callers requiring it                                                                                                                                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `headingLevel` | `h2` callers at `src/client/features/trends/TrendsInsightsTable.tsx:85-88` and `src/client/features/opportunities/OpportunitiesPage.tsx:167-170`; `h3` callers at `src/client/features/backlinks/BacklinksProfileSections.tsx:65-68` and `src/client/features/rank-tracking/VisibilityTrendChart.tsx:75-78`.       |
| `title`        | Static title at `src/client/features/serp/SerpOverviewPage.tsx:781-784`; prop-driven title at `src/client/features/backlinks/BacklinksProfileSections.tsx:65-68`; dynamic model title at `src/client/features/ai-search/components/PromptExplorerResults.tsx:165`.                                                 |
| `icon`         | `src/client/features/page-explorer/PageInsightsCards.tsx:30-33`; `src/client/features/local-seo/ReviewAnalyticsCards.tsx:83-86`. It is optional because plain headings are real at `src/client/features/content/CompetitorOutlines.tsx:16` and `src/client/features/rank-tracking/RankTrackingDomainList.tsx:131`. |
| `description`  | Sampling/action-list explanation at `src/client/features/opportunities/OpportunitiesPage.tsx:171-177`; citation limitations and cost at `src/client/features/citations/CitationTrackerSection.tsx:287-294`.                                                                                                        |
| `actions`      | Audit link at `src/client/features/opportunities/OpportunitiesPage.tsx:258-269`; brand-term input at `src/client/features/search-performance/BrandedSplitCard.tsx:58-75`; scheduled-post controls at `src/client/features/local-seo/GbpScheduledPostsList.tsx:120-145`.                                            |

**Disposition:** replaces inline `h2`/`h3` header rows and extends `InsightIcon`; it does not replace `InsightTile`.

---

### `AppEmptyState`

```ts
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type AppEmptyStateProps = Readonly<{
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
}>;
```

`AppEmptyState` replaces dashed cards, table-only empty labels, and `dashboardShared.CardEmpty`. It renders one centered, dashed, theme-token surface with a restrained icon, title, optional explanatory copy, and optional action. It has no visual variants: idle, zero, filtered, and not-connected are semantic states selected by `QueryStateBoundary`, not colour or density variants. Provider-specific connection UI can remain a custom `not-connected` node rather than forcing OAuth behavior into this component.

Prop evidence:

| Prop          | Existing callers requiring it                                                                                                                                                                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`       | “Connect Search Console” at `src/client/features/opportunities/OpportunitiesPage.tsx:201-203`; “No site audit yet” at `src/client/features/opportunities/OpportunitiesPage.tsx:294-296`; “Enter a keyword…” at `src/client/features/serp/SerpOverviewPage.tsx:721-724`.                                   |
| `description` | `src/client/features/opportunities/OpportunitiesPage.tsx:203-205`; `src/client/features/link-insights/LinkOpportunitiesPage.tsx:117-119`; `src/client/features/keywords/page/KeywordResearchEmptyState.tsx:135-137`.                                                                                      |
| `icon`        | Keyword empty state at `src/client/features/keywords/page/KeywordResearchEmptyState.tsx:130-132`; tracked-domain empty state at `src/client/features/rank-tracking/RankTrackingDomainList.tsx:151-154`; saved-keyword empty state at `src/client/features/saved-keywords/SavedKeywordsTable.tsx:194-200`. |
| `action`      | Search Console link at `src/client/features/opportunities/OpportunitiesPage.tsx:207-213`; audit action at `src/client/features/opportunities/OpportunitiesPage.tsx:300-306`; GSC action at `src/client/features/link-insights/LinkOpportunitiesPage.tsx:120-126`.                                         |

**Disposition:** replaces raw empty surfaces, `BacklinksPageEmptyTableState.EmptyTableState`, and `dashboardShared.CardEmpty`. It does not replace `AnalyzeDomainPrompt`, which is a pre-spend idle prompt rather than an empty result.

---

### Skeleton primitives

```ts
export type SkeletonTextProps = Readonly<{
  lines: number;
}>;

export type TableSkeletonProps = Readonly<{
  rows: number;
  columns: number;
}>;

export function SkeletonText(props: SkeletonTextProps): JSX.Element;
export function InsightTileSkeleton(): JSX.Element;
export function TableSkeleton(props: TableSkeletonProps): JSX.Element;
```

These replace raw repeated `className="skeleton …"` shapes while leaving each feature responsible for composing a loader that resembles its loaded layout. `SkeletonText` produces alternating full, 11/12, and 10/12-width lines without exposing arbitrary widths. `InsightTileSkeleton` mirrors the canonical two-line `InsightTile`; hint/no-hint differences are cosmetic and do not create a prop. `TableSkeleton` uses a wider leading column automatically and accepts only row and column counts because those correspond to real table structure. Chart, map, editor, and model-answer skeletons remain feature-specific.

Prop and primitive evidence:

| API                     | Existing callers requiring it                                                                                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SkeletonText.lines`    | Four answer lines at `src/client/features/ai-search/components/PromptExplorerLoadingState.tsx:22-27`; two local-context lines at `src/client/features/local-seo/LocalProjectContext.tsx:124-125`.                                                                                                |
| `InsightTileSkeleton()` | Four Search Performance tiles at `src/client/features/search-performance/SearchPerformanceLoadingState.tsx:8-17`; four dashboard tiles at `src/client/features/dashboard/DashboardLoadingState.tsx:8-16`; eight Backlinks tiles at `src/client/features/backlinks/BacklinksPageStates.tsx:6-14`. |
| `TableSkeleton.rows`    | 8 rows at `src/client/features/search-performance/SearchPerformanceLoadingState.tsx:35-42`; 6 rows at `src/client/features/ai-search/components/AiSearchLoadingState.tsx:17-24`; 10 rows at `src/client/features/keywords/page/KeywordResearchLoadingState.tsx:15-27`.                           |
| `TableSkeleton.columns` | 5-column grid at `src/client/features/search-performance/SearchPerformanceLoadingState.tsx:35-41`; 7-column grid at `src/client/features/domain/components/DomainOverviewLoadingState.tsx:27-35`; 9-column grid at `src/client/features/saved-keywords/SavedKeywordsTable.tsx:172-182`.          |

`LoadingShell` is not one of these primitives; it has a separate edge-served, pre-React responsibility.

**Disposition:** replaces raw skeleton rows/tiles, while existing feature loading components become small compositions of these primitives.

---

### `QueryStateBoundary`

```ts
import type { ReactNode } from "react";
import type { AppEmptyStateProps } from "./AppEmptyState";

export type ActionCost = "free" | "credits";

export type QueryRetryAction = Readonly<{
  onRetry: () => void;
  pending: boolean;
  cost: ActionCost;
}>;

export type QuerySamplingEvidence = Readonly<{
  /**
   * Complete subject phrase, for example:
   * "Search Console query-and-page pull".
   */
  label: string;
  truncated: boolean;
  rowsExamined: number;
}>;

export type QueryBoundaryState =
  | Readonly<{
      kind: "loading";
      skeleton: ReactNode;
    }>
  | Readonly<{
      kind: "error";
      message: string;
      retry: QueryRetryAction;
    }>
  | Readonly<{
      kind: "not-connected";
      content: ReactNode;
    }>
  | Readonly<{
      kind: "empty";
      reason: "genuine-zero" | "filtered-zero";
      content: AppEmptyStateProps;
    }>
  | Readonly<{
      kind: "ready";
    }>;

export type QueryStateBoundaryProps = Readonly<{
  state: QueryBoundaryState;
  sampling?: readonly QuerySamplingEvidence[];
  children: ReactNode;
}>;
```

`QueryStateBoundary` is a pure renderer. It never accepts a `UseQueryResult`, never calls `refetch` during render or an effect, and never changes query options. A caller must explicitly classify the state and provide the retry callback reached only by the button. This preserves `useMeteredQuery`’s `staleTime: Infinity` and disabled mount/focus/reconnect refetch behavior at `src/client/lib/useMeteredQuery.ts:54-63`. It renders `InlineQueryError` for errors and `AppEmptyState` for empty states. The discriminated union prevents simultaneous “error” and “empty” booleans and fixes precedence at the type boundary.

Field evidence:

| Field                               | Existing callers requiring it                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loading.skeleton`                  | `SearchPerformanceLoadingState` at `src/client/features/search-performance/SearchPerformancePage.tsx:219-220`; `DomainOverviewLoadingState` beginning at `src/client/features/domain/DomainOverviewPage.tsx:769`; table spinner branches at `src/client/features/opportunities/OpportunitiesPage.tsx:196-199` and `src/client/features/opportunities/OpportunitiesPage.tsx:289-292`.               |
| `error.message`                     | `src/client/features/opportunities/OpportunitiesPage.tsx:182-193`; `src/client/features/saved-keywords/SavedKeywordsQueryContent.tsx:21-27`.                                                                                                                                                                                                                                                       |
| `retry.onRetry` and `retry.pending` | `src/client/features/opportunities/OpportunitiesPage.tsx:182-192`; `src/client/features/domain/components/DomainCompetitorsCard.tsx:63-67`; `src/client/features/backlinks/BacklinksTimelineSection.tsx:102-107`.                                                                                                                                                                                  |
| `retry.cost`                        | Paid retries are real at `src/client/features/domain/components/DomainCompetitorsCard.tsx:27-32,63-67` and `src/client/features/backlinks/BacklinksTimelineSection.tsx:59-68,102-107`; free retries are real at `src/client/features/opportunities/OpportunitiesPage.tsx:182-193` and `src/client/features/saved-keywords/SavedKeywordsQueryContent.tsx:21-27`.                                    |
| `not-connected.content`             | Full GSC connection component at `src/client/features/search-performance/SearchPerformancePage.tsx:227-233`; CTA-based connection states at `src/client/features/link-insights/LinkOpportunitiesPage.tsx:113-128` and `src/client/features/link-insights/CannibalizationPage.tsx:78-95`.                                                                                                           |
| `empty.reason`                      | Genuine zero at `src/client/features/opportunities/OpportunitiesPage.tsx:215-220` and `src/client/features/link-insights/LinkOpportunitiesPage.tsx:131-155`; filtered zero at `src/client/features/saved-keywords/SavedKeywordsTable.tsx:188-200` and `src/client/features/search-performance/ContentPerformanceTab.tsx:177-181`.                                                                  |
| `empty.content`                     | The paired title/description states at `src/client/features/link-insights/CannibalizationPage.tsx:100-120` and `src/client/features/link-insights/LinkOpportunitiesPage.tsx:134-155`.                                                                                                                                                                                                              |
| `sampling`                          | Query-page completeness at `src/client/features/search-performance/SearchPerformancePage.tsx:338-350`; query-total completeness at `src/client/features/dashboard/ProjectKeywordsCard.tsx:136-166`; current/previous page pulls at `src/client/features/search-performance/ContentPerformanceTab.tsx:164-181`.                                                                                     |
| `sampling[].label`                  | The server explicitly requires per-pull identity at `src/serverFunctions/searchPerformance.ts:65-76` and names the pulls at `src/serverFunctions/searchPerformance.ts:187-192`; the UI already distinguishes “query-and-page rows” at `src/client/features/search-performance/SearchPerformancePage.tsx:345-349` and “queries” at `src/client/features/dashboard/ProjectKeywordsCard.tsx:163-166`. |
| `children`                          | Ready content at `src/client/features/opportunities/OpportunitiesPage.tsx:221-251` and `src/client/features/search-performance/ContentPerformanceTab.tsx:116-203`.                                                                                                                                                                                                                                 |

**Disposition:** new state orchestrator that extends `InlineQueryError`, `AppEmptyState`, and feature skeletons. It replaces page-local state ternaries, `BacklinksErrorState`, and equivalent one-off error/empty wrappers. It does not replace `AppDataTable`; table content remains its child.

---

## Required extensions to existing shared controls

These are necessary because the same visual action currently has different cost semantics.

### `InlineQueryError`

```ts
export type InlineQueryErrorProps = Readonly<{
  message: string;
  onRetry: () => void;
  retrying: boolean;
  cost: ActionCost;
}>;
```

`cost="credits"` renders `Retry · uses credits`; `cost="free"` renders `Retry`. There is no default, so every one of the 12 callers must be classified. The existing `className` prop should be removed: only `BacklinksTimelineSection` uses it at `src/client/features/backlinks/BacklinksTimelineSection.tsx:102-104`; that one caller can wrap the component for margin. The paid evidence is `DomainCompetitorsCard` and `BacklinksTimelineSection` above; free evidence is the two Opportunities retries at `src/client/features/opportunities/OpportunitiesPage.tsx:182-193` and saved keywords at `src/client/features/saved-keywords/SavedKeywordsQueryContent.tsx:21-27`.

### `DataFreshness`

```ts
export type DataFreshnessProps = Readonly<{
  fetchedAt: string | null | undefined;
  onRefresh: () => void;
  refreshing: boolean;
  refreshCost: ActionCost;
}>;
```

The component has exactly two current callers, and both use `fetchedAt`, `onRefresh`, and `refreshing`: Domain at `src/client/features/domain/DomainOverviewPage.tsx:750-754` and Competitors at `src/client/features/competitors/CompetitorsPage.tsx:185-189`. Domain passes `refreshCost="free"` and retains `Refresh`; Competitors passes `refreshCost="credits"` and renders `Run again · uses credits`. Competitors currently calls `run.authorize()` at `CompetitorsPage.tsx:187`, whereas Domain calls the existing query’s `refetchOverview()` at `DomainOverviewPage.tsx:752`. Remove the unused `className` escape hatch and narrow `fetchedAt` to the string shape these two server results actually supply.

---

## 2. State contract

### Resolution order

`QueryStateBoundary` renders exactly one primary state:

| Order | State           | Contract                                                                                                                              |
| ----: | --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
|     1 | `loading`       | Initial pending state only. Background `isFetching` with usable data remains `ready`.                                                 |
|     2 | `error`         | A failed query is never interpreted as an empty result. Retry is user-triggered and explicitly classified as free or credit-spending. |
|     3 | `not-connected` | Only after a successful response explicitly says the provider is unavailable or disconnected. Missing `data` is not sufficient.       |
|     4 | `empty`         | The caller explicitly selects `genuine-zero` or `filtered-zero`. Sampling may override the ordinary empty copy.                       |
|     5 | `ready`         | Children render. Truncated sampling evidence produces a standard completeness notice before the content.                              |

### Sampling behavior

The `sampling` prop accepts per-pull evidence, never a combined boolean. This follows the server warning that a truncation flag and a count from different requests cannot produce an honest sentence at `src/serverFunctions/searchPerformance.ts:65-76`.

When every supplied entry has `truncated: false`:

- `reason: "genuine-zero"` renders the caller’s genuine-zero copy.
- `reason: "filtered-zero"` renders the caller’s filtered-zero copy.
- `ready` renders children without a completeness notice.

When any entry has `truncated: true`:

- An empty state ignores the caller’s ordinary absence sentence.
- For `genuine-zero`, the canonical title is **“No matches in the returned rows.”**
- For `filtered-zero`, the canonical title is **“No filtered matches in the returned rows.”**
- The description is generated from the paired evidence, for example:  
  **“Search Console query-and-page pull was capped after 1,000 rows. Rows outside that pull may still contain a match, so this is not a complete absence.”**
- Multiple capped pulls are listed independently as `label: rowsExamined`; flags are never ORed while displaying one unrelated count.
- A ready result receives a standard sampled-result notice listing each capped pull. Domain-specific warnings—such as independently sampled current/previous periods producing directional comparisons—remain beside the relevant analysis.

This makes it impossible for a normal genuine-zero sentence and a truncated empty result to take the same render path.

### Call site 1: Search Performance query-page state

```ts
const strikingState: QueryBoundaryState = reportQuery.isPending
  ? {
      kind: "loading",
      skeleton: <SearchPerformanceLoadingState />,
    }
  : reportQuery.isError
    ? {
        kind: "error",
        message: getStandardErrorMessage(reportQuery.error),
        retry: {
          onRetry: () => void reportQuery.refetch(),
          pending: reportQuery.isFetching,
          cost: "free",
        },
      }
    : !report?.connected
      ? {
          kind: "not-connected",
          content: (
            <SearchConsoleConnectionCard
              projectId={projectId}
              failureReason={accessFailureReason}
            />
          ),
        }
      : report.strikingDistance.length === 0
        ? {
            kind: "empty",
            reason: "genuine-zero",
            content: {
              title: "No striking-distance queries",
              description:
                "Nothing currently ranks just off page one with meaningful demand.",
            },
          }
        : { kind: "ready" };

<QueryStateBoundary
  state={strikingState}
  sampling={
    report?.connected
      ? [
          {
            label: "Search Console query-and-page pull",
            ...report.sampling.queryPages,
          },
        ]
      : undefined
  }
>
  <StrikingDistanceTable
    projectId={projectId}
    rows={report?.connected ? report.strikingDistance : []}
  />
</QueryStateBoundary>;
```

This replaces the current panel notice and the lossy `sampled: boolean` passed at `src/client/features/search-performance/SearchPerformancePage.tsx:343-363`. The evidence comes directly from `report.sampling.queryPages`, returned at `src/serverFunctions/searchPerformance.ts:189-191`.

### Call site 2: Content Performance filtered state

```ts
const groupsState: QueryBoundaryState = contentQuery.isPending
  ? {
      kind: "loading",
      skeleton: <TableSkeleton rows={6} columns={4} />,
    }
  : contentQuery.isError
    ? {
        kind: "error",
        message: getStandardErrorMessage(contentQuery.error),
        retry: {
          onRetry: () => void contentQuery.refetch(),
          pending: contentQuery.isFetching,
          cost: "free",
        },
      }
    : !connected
      ? {
          kind: "not-connected",
          content: (
            <AppEmptyState
              title="Connect Search Console"
              description="Connect Search Console to compare your content groups."
            />
          ),
        }
      : filteredGroups.length === 0
        ? {
            kind: "empty",
            reason: trendFilter === "all" ? "genuine-zero" : "filtered-zero",
            content: {
              title:
                trendFilter === "all"
                  ? "No content groups in this period"
                  : `No ${trendFilter} content groups`,
              description:
                trendFilter === "all"
                  ? "Search Console has no page groups for this period."
                  : "Try another content-group filter.",
            },
          }
        : { kind: "ready" };

<QueryStateBoundary
  state={groupsState}
  sampling={
    connected
      ? [
          {
            label: "Current-period Search Console page pull",
            ...data.sampling.current,
          },
          {
            label: "Previous-period Search Console page pull",
            ...data.sampling.previous,
          },
        ]
      : undefined
  }
>
  <ContentGroupsTable rows={filteredGroups} />
</QueryStateBoundary>;
```

This consumes both per-period entries returned at `src/serverFunctions/searchPerformance.ts:348-355`. It replaces the current nested copy switch at `src/client/features/search-performance/ContentPerformanceTab.tsx:168-181` and adds the missing error branch after the current loading branch at `ContentPerformanceTab.tsx:99-113`.

---

## 3. Dependency-ordered migration

| Step | Classification                | Work                                                                                                                                                                                                                        | Parallelism and conflicts                                                                                                                                                                                                                                                                                        |
| ---: | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | Mechanical                    | Add `AppPageShell`, `PageHeader`, `AppCard`, `SectionHeader`, `AppEmptyState`, and the three skeleton primitives. Add isolated rendering tests.                                                                             | One owner for `src/client/components/`; do not parallel-edit these foundation files. Individual new files can be authored separately only if ownership is assigned in advance.                                                                                                                                   |
|    2 | Judgment-heavy                | Extend `InlineQueryError` and `DataFreshness` with mandatory cost classification. Classify all 12 error callers and both freshness callers. Remove the one-use `className` escape hatches.                                  | `InlineQueryError` and `DataFreshness` can proceed in parallel because they are separate files, but their caller migrations must not overlap feature-file ownership.                                                                                                                                             |
|    3 | Judgment-heavy                | Implement `QueryStateBoundary` and its sampling resolver. Tests must cover all five states, filtered zero, truncated zero, multiple pulls, ready sampling notice, paid retry text, and “callback not called during render.” | Single owner until the state contract and tests are merged. This blocks all state migrations.                                                                                                                                                                                                                    |
|    4 | Judgment-heavy pilot          | Migrate one free sampled surface, one filtered sampled surface, and one paid retry surface: Search Performance striking distance, Content Performance groups, and `DomainCompetitorsCard`.                                  | Three separate files/directories can proceed in parallel after Step 3. Stop here for review before bulk migration.                                                                                                                                                                                               |
|    5 | Mechanical                    | Migrate the 8 existing wide-shell pages to `AppPageShell` and `PageHeader`: Opportunities, Trends, Competitors, Topic Clusters, Page Explorer, SERP, Local Rank Grid, and Local SEO.                                        | Assign one whole feature page per session. Do not split a large page between header and card owners.                                                                                                                                                                                                             |
|    6 | Mechanical with layout review | Migrate the older nested wrappers: Dashboard, Domain, Backlinks, Search Performance, Prompt Explorer, Brand Lookup, Keyword Research, Saved Keywords, Rank Tracking, Audit, and On-Page Fixes.                              | Can run in parallel by feature directory. The Rank Tracking route shell must be owned separately from its child detail components to avoid nested `main` elements.                                                                                                                                               |
|    7 | Mechanical                    | Replace raw live cards with `AppCard`; reimplement `DashboardCard`, `AnalyzeDomainPrompt`, and similar feature adapters on top of it. Replace card headings with `SectionHeader`.                                           | Parallel by feature directory. Keep `src/client/features/report/**` excluded from every search-and-replace.                                                                                                                                                                                                      |
|    8 | Judgment-heavy                | Migrate query state branches by semantic group: GSC/free, paid research, local/GBP, audit/rank tracking, saved/AI. Require explicit `ActionCost` and explicit empty reason at each call site.                               | Suggested lanes: (A) `search-performance`, `link-insights`, `opportunities`, `dashboard`; (B) `domain`, `competitors`, `backlinks`; (C) `trends`, `topic-clusters`, `page-explorer`, `serp`, `content`; (D) `local-*`, `rank-tracking`, `saved-keywords`, `audit`, `ai-search`. No file is shared between lanes. |
|    9 | Mechanical                    | Replace raw empty states and table empty nodes with `AppEmptyState`; route `AppDataTable.empty` through it.                                                                                                                 | Parallel by leaf component. Do not rewrite table logic, sorting, or pagination in this phase.                                                                                                                                                                                                                    |
|   10 | Mechanical                    | Rebuild feature loading states from `SkeletonText`, `InsightTileSkeleton`, and `TableSkeleton`. Delete feature-private duplicates only after their callers migrate.                                                         | Loading files are independent and can proceed in parallel. Chart/map/editor/model skeletons remain untouched.                                                                                                                                                                                                    |
|   11 | Judgment-heavy review         | Review all paid buttons and retries, all not-connected branches, and every absence sentence. Check both themes and the mobile bottom-clearance behavior.                                                                    | Review should be cross-lane. A reviewer should not approve the feature lane they migrated.                                                                                                                                                                                                                       |

`OpportunitiesPage.tsx` is already at its configured line ceiling. Its first state block spans `src/client/features/opportunities/OpportunitiesPage.tsx:179-252` and its second spans `OpportunitiesPage.tsx:272-340`. Each should collapse into a boundary state declaration plus one component invocation. Do not add state-builder helpers inside that page; if a helper is needed, place a feature-specific resolver in a sibling file.

---

## 4. What not to consolidate

### Printed reports

Everything under `src/client/features/report/**` remains outside the live component/token layer. `ReportChrome` explicitly says its colours are fixed so printed and emailed artifacts remain identical regardless of viewer theme at `src/client/features/report/ReportChrome.tsx:3-12`, with fixed palette constants at `ReportChrome.tsx:15-20`. Do not migrate its page frames, cards, stat blocks, headings, or colour literals to `AppPageShell`, `AppCard`, `InsightTile`, or live DaisyUI state components.

### `SearchTabStrip`

Do not replace it with `SegmentedToggle` or ordinary tabs. It owns closable tabs and per-tab loading/error/unviewed state at `src/client/features/search-tabs/SearchTabStrip.tsx:17-24` and `SearchTabStrip.tsx:41-95`. Its state is restored from and persisted to `sessionStorage` at `src/client/features/search-tabs/useSearchTabs.ts:131-170`. Ordinary page-section tabs do not have those semantics.

### Google brand surfaces

Do not convert Google marks to theme colours. The auth button intentionally stays white with Google-compatible neutral text at `src/client/features/auth/AuthPage.tsx:43-52`; its glyph uses the four Google brand colours at `AuthPage.tsx:66-85`. The shared GSC glyph likewise fixes `#EA4335`, `#4285F4`, `#FBBC05`, and `#34A853` at `src/client/features/gsc/GoogleGlyph.tsx:19-33`. Only `GoogleGlyphMuted` is monochrome, specifically for navigation at `GoogleGlyph.tsx:39-41`.

### `AuthPageShell`

Do not migrate authentication pages to `AppPageShell`. `AuthPageShell` deliberately uses a `100dvh` scroll container and an auto-margin child so tall auth forms remain reachable at `src/client/features/auth/AuthPage.tsx:123-132`. The authenticated application’s parent already owns scrolling.

### `LoadingShell`

Do not fold the edge-served branded shell into React query skeletons. It must remain self-contained, without hooks or app CSS dependencies, because it paints before the application arrives at `src/client/components/LoadingShell.tsx:1-13`.

### Metered idle prompts

`AnalyzeDomainPrompt`, restored-run banners, and recent-run lists are not empty results. They represent “no paid action authorized in this mounted session.” `AnalyzeDomainPrompt` explicitly avoids fetching until the click at `src/client/components/AnalyzeDomainPrompt.tsx:11-15`; restored data likewise must not become a live refetch. These components may use `AppCard` internally but must not be replaced by a generic zero state.

### Provider connection flows

`SearchConsoleConnectionCard`, `GbpConnectionCard`, and `GbpNotConfiguredCard` have different OAuth/configuration behavior. `QueryStateBoundary` may render them through `not-connected.content`, but it must not combine them into one generic connector.

### Feature-specific charts and visualizations

Keep `TrendSparkline` separate from full charts: it is deliberately a hand-written, low-cost SVG for dense tables at `src/client/components/TrendSparkline.tsx:4-7`. Full Recharts views, Leaflet maps, heatmaps, treemaps, and local rank grids have different interaction and layout contracts. They should share theme variables, not a generic chart component.

### Existing structural shared components

Do not replace `Modal`, `SegmentedToggle`, `AppDataTable`, `TablePagination`, `SortableHeader`, or `TrendSparkline` during this phase. New cards and boundaries compose them. Phase 2 should not silently absorb Phase 3’s table, dialog, URL-filter, or chart consolidation.

---

## 5. Riskiest step and early-failure sequence

The riskiest step is `QueryStateBoundary`, specifically the combination of sampling completeness and retry cost. A wrong branch order can turn an error into a clean empty state; a flattened sampling boolean can restore the false-absence bug; and an unlabelled retry can spend credits behind the same control used for a free refetch.

Sequence it as follows:

1. Implement and test a pure state resolver before rendering JSX. Its test matrix must include:
   - pending;
   - error plus zero rows, with error winning;
   - not-connected plus zero rows, with not-connected winning;
   - complete genuine zero;
   - complete filtered zero;
   - one truncated empty pull;
   - two pulls where only one is truncated;
   - ready truncated data;
   - `cost="credits"` button copy;
   - confirmation that rendering never calls `onRetry`.

2. Pilot Search Performance’s query-page state. It exercises the named `sampling.queryPages` contract and replaces the current lossy `sampled` boolean.

3. Pilot Content Performance next. It exercises two independently sampled pulls and filtered-to-zero behavior. Its existing comparison-specific warning must remain after the generic completeness notice.

4. Pilot `DomainCompetitorsCard` and `BacklinksTimelineSection`. Both use `useMeteredQuery` and expose manual retries, so the review can verify that rendering causes no request and the only retry control says it uses credits.

5. Compare the two `DataFreshness` callers side by side: Domain must say `Refresh`; Competitors must say `Run again · uses credits`.

6. Review those pilots in both themes before any bulk page migration. Only after the state sentences, cost labels, and no-auto-refetch behavior are accepted should the remaining feature lanes proceed.

This catches the semantic failure in 3–5 representative files rather than after the same boundary has replaced branches across roughly 100 live TSX files.
