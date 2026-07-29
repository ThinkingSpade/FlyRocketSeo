# GSC Data Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Search Console-derived number either correct or explicitly labelled as a sample, by fixing the row-limit clamp that disables existing truncation reporting and by giving GSC aggregation a single module that knows the difference between property-level demand and page-level attribution.

**Architecture:** The row ceiling becomes a parameter of the request builder instead of a module constant, so the MCP path keeps its context-window limit while analytics callers get their own. That alone re-enables truncation flags the code already computes but can never set. A new `gscAggregation` module then owns the property-versus-page rule: query-dimension rows are the only source of demand totals, query×page rows serve attribution only.

**Tech Stack:** TypeScript, Vitest, TanStack Start server functions, Drizzle, Cloudflare Workers, Google Search Console Search Analytics API.

This plan implements workstreams **1.1 and 1.2** of `docs/superpowers/specs/2026-07-29-correctness-and-money-overhaul-design.md`. They share a plan because 1.2's aggregates consume 1.1's truncation flags. Workstreams 1.3–1.7 get their own plans.

## What reading the code changed about the spec

The spec assumed truncation reporting had to be built. It does not — it exists and is disabled.

`src/serverFunctions/trendingOpportunities.ts` sets `QUERY_ROW_LIMIT = 5000` and documents the intent directly: the limit stays "well short of response sizes that would strain a Worker; when it is still not enough, `currentTruncated` says so rather than pretending." The same file already refuses to treat a missing page row as proof that no page ranks, and already notes that per-query impression comparisons are immune to the page-aggregation difference.

That machinery cannot fire, because `buildSearchAnalyticsRequest` clamps every caller to `GSC_MAX_ROW_LIMIT = 1000` — a constant chosen to protect the MCP agent's context window. The request asks for 5,000, receives at most 1,000, and `rows.length >= 5000` is never true.

**Consequence for this plan:** Task 1 is small and unblocks most of workstream 1.1 on its own. It also partly resolves the spec's open question about the app ceiling — 5,000 was already chosen deliberately for Worker response size. Task 2 measures whether that number holds for CPU as well as payload, rather than picking a fresh one.

**Consequence for Task 6:** the min-position behaviour the spec calls a defect is a _documented deliberate decision_. `buildQueryTotals` states "Position is the site's BEST page for the query — the honest answer to 'where do I rank for this'", and `buildStrikingDistanceRows` argues that if any page already ranks above 5, improving a secondary page will not move traffic. That reasoning is defensible; the implementation is not, because min-of-page-averages lets a single-impression fluke outrank a page carrying all the traffic. Task 6 changes a deliberate decision and is flagged for sign-off rather than treated as a bugfix.

## Global Constraints

- Do not bypass `createDataforseoClient`; it is the hosted metering boundary per `specs/0002-hosted-dataforseo-metering-with-autumn.md`.
- Do not eagerly import the DataForSEO SDK graph — `src/server/lib/dataforseo/client.ts` lazy-loads fetchers deliberately.
- Do not re-enable automatic paid-query refetching in `src/client/lib/useMeteredQuery.ts`.
- Do not hand-edit `src/routeTree.gen.ts`.
- Do not change the MCP tool path's effective row limit. `GSC_DEFAULT_ROW_LIMIT` stays 1000.
- GSC is a free provider. Extra GSC calls cost latency and quota, never money. Do not add cost warnings to GSC-only paths.
- Every user-facing claim of absence must be conditional on established completeness.
- Verification per task: `npx vitest run <path>` for the task's tests, and `pnpm ci:check` before the final commit of each task.
- No `pnpm`-based claim may come from a Codex report; Codex cannot run this toolchain.

---

## File Structure

**Created:**

- `src/server/features/gsc/gscAggregation.ts` — the single owner of GSC row semantics. Exports `buildPropertyQueryTotals`, `attributePagesToQueries`, `representativePageForQuery`. No I/O.
- `src/server/features/gsc/gscAggregation.test.ts` — unit tests for the four failing inputs in the spec.
- `src/server/features/gsc/fetchAllRows.ts` — pagination helper wrapping `startRow`. Returns `{ rows, rowsExamined, truncated }`.
- `src/server/features/gsc/fetchAllRows.test.ts`
- `scripts/measure-gsc-aggregation.mjs` — CPU measurement against synthetic payloads (Task 2).

**Modified:**

- `src/server/features/gsc/searchAnalytics.ts:35-39,133-175` — ceiling becomes a parameter.
- `src/server/features/gsc/searchAnalytics.test.ts` — ceiling tests.
- `src/serverFunctions/trendingOpportunities.ts:51,105` — consume the real truncation flag.
- `src/server/features/gsc/searchPerformanceReport.ts:84,152` — delegate to `gscAggregation`.
- `src/server/features/gsc/linkInsights.ts:103,153` — property totals for demand.
- `src/client/features/opportunities/opportunityModel.ts:92` — merge overlapping signals.
- `src/serverFunctions/searchPerformance.ts:26,30,179` — truncation flags, country pagination, export pagination.

---

## Task 1: Make the row ceiling a parameter of the request builder

**Files:**

- Modify: `src/server/features/gsc/searchAnalytics.ts:35-39,133-175`
- Test: `src/server/features/gsc/searchAnalytics.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `GSC_MCP_ROW_CEILING = 1000`, `GSC_ANALYTICS_ROW_CEILING = 5000`, and `buildSearchAnalyticsRequest(input: GscPerformanceInput, today?: Date, ceiling?: number): GscSearchAnalyticsRequest`. Tasks 2–5 depend on `GSC_ANALYTICS_ROW_CEILING`.

- [ ] **Step 1: Write the failing test**

Add to `src/server/features/gsc/searchAnalytics.test.ts`:

```ts
describe("row ceiling", () => {
  it("clamps to the MCP ceiling by default", () => {
    const request = buildSearchAnalyticsRequest({
      projectId: "p1",
      rowLimit: 5000,
    });
    expect(request.rowLimit).toBe(1000);
  });

  it("honours an explicit analytics ceiling", () => {
    const request = buildSearchAnalyticsRequest(
      { projectId: "p1", rowLimit: 5000 },
      undefined,
      GSC_ANALYTICS_ROW_CEILING,
    );
    expect(request.rowLimit).toBe(5000);
  });

  it("still clamps a request above the supplied ceiling", () => {
    const request = buildSearchAnalyticsRequest(
      { projectId: "p1", rowLimit: 99_000 },
      undefined,
      GSC_ANALYTICS_ROW_CEILING,
    );
    expect(request.rowLimit).toBe(GSC_ANALYTICS_ROW_CEILING);
  });
});
```

Add `GSC_ANALYTICS_ROW_CEILING` to the existing import from `./searchAnalytics`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/server/features/gsc/searchAnalytics.test.ts -t "row ceiling"`
Expected: FAIL — `GSC_ANALYTICS_ROW_CEILING` is not exported, and the second case returns 1000.

- [ ] **Step 3: Implement**

In `src/server/features/gsc/searchAnalytics.ts`, replace the two constants at lines 35–39:

```ts
export const GSC_DEFAULT_ROW_LIMIT = 1000;
// The MCP tool path caps rows-per-call to protect the agent's context window.
// The analytics UI has no such constraint and sets its own ceiling below.
export const GSC_MCP_ROW_CEILING = 1000;
// Chosen to stay well short of response sizes that would strain a Worker, and
// verified against aggregation CPU by scripts/measure-gsc-aggregation.mjs.
// GSC itself permits 25000 per request; going higher needs pagination, not a
// bigger single call.
export const GSC_ANALYTICS_ROW_CEILING = 5000;
```

Keep `GSC_MAX_ROW_LIMIT` as a deprecated alias of `GSC_MCP_ROW_CEILING` so existing importers keep compiling; Task 5 removes it.

Change the signature and the clamp in `buildSearchAnalyticsRequest`:

```ts
export function buildSearchAnalyticsRequest(
  input: GscPerformanceInput,
  today: Date = new Date(),
  ceiling: number = GSC_MCP_ROW_CEILING,
): GscSearchAnalyticsRequest {
```

and

```ts
    rowLimit: clamp(input.rowLimit ?? GSC_DEFAULT_ROW_LIMIT, 1, ceiling),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/server/features/gsc/searchAnalytics.test.ts`
Expected: PASS, including the pre-existing cases.

- [ ] **Step 5: Commit**

```bash
git add src/server/features/gsc/searchAnalytics.ts src/server/features/gsc/searchAnalytics.test.ts
git commit -m "Let each caller set its own GSC row ceiling"
```

---

## Task 2: Measure aggregation CPU before raising any caller

**Files:**

- Create: `scripts/measure-gsc-aggregation.mjs`

**Interfaces:**

- Consumes: `GSC_ANALYTICS_ROW_CEILING` from Task 1.
- Produces: a measured verdict recorded in the plan. No runtime code depends on this task.

This resolves the spec's open question. It needs no API credentials — payload shape is known, so synthetic rows measure aggregation cost directly.

- [ ] **Step 1: Write the measurement script**

```js
// Measures aggregation CPU against synthetic GSC payloads, to justify
// GSC_ANALYTICS_ROW_CEILING against the Cloudflare CPU limit rather than
// guessing. Run: node scripts/measure-gsc-aggregation.mjs
const SIZES = [1000, 2500, 5000, 10000, 25000];

function syntheticRows(n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      keys: [`query ${i % (n / 2)}`, `https://example.com/page-${i % 400}`],
      clicks: i % 37,
      impressions: (i % 991) + 1,
      ctr: (i % 37) / ((i % 991) + 1),
      position: 1 + (i % 90) / 3,
    });
  }
  return rows;
}

// Mirrors the grouping shape of buildQueryTotals / dominantPageByQuery: one
// Map pass keyed by query, one nested page tally, one sort.
function aggregate(rows) {
  const byQuery = new Map();
  for (const row of rows) {
    const q = row.keys?.[0];
    if (!q) continue;
    let e = byQuery.get(q);
    if (!e)
      byQuery.set(q, (e = { clicks: 0, impressions: 0, pages: new Map() }));
    e.clicks += row.clicks;
    e.impressions += row.impressions;
    const p = row.keys[1];
    e.pages.set(p, (e.pages.get(p) ?? 0) + row.impressions);
  }
  return [...byQuery.entries()].sort(
    (a, b) => b[1].impressions - a[1].impressions,
  );
}

for (const size of SIZES) {
  const rows = syntheticRows(size);
  const start = performance.now();
  const out = aggregate(rows);
  const ms = performance.now() - start;
  console.log(
    `${String(size).padStart(6)} rows  ${ms.toFixed(1).padStart(7)} ms  ${out.length} queries`,
  );
}
```

- [ ] **Step 2: Run it and record the numbers**

Run: `node scripts/measure-gsc-aggregation.mjs`
Expected: five timing lines. Record them in this task's commit message.

- [ ] **Step 3: Decide the ceiling against the CPU budget**

Cloudflare Workers Free allows 10ms of CPU time per invocation; Workers Paid allows far more. Confirm which plan this deployment is on before judging the numbers — the audit crawl has already been throttled by the free-plan limit, so assume Free unless verified otherwise. Compare the measured cost at 5,000 rows against that budget, remembering aggregation shares the invocation with request handling, JSON parsing and serialization rather than getting the whole allowance.

- If 5,000 rows aggregates comfortably inside budget, leave `GSC_ANALYTICS_ROW_CEILING` at 5,000 and note the measured figure in the constant's comment.
- If it does not, lower the constant to the largest measured size that does, and record why.

Do not raise the ceiling above 5,000 in this plan even if CPU allows — beyond that, Task 3's pagination is the correct instrument.

- [ ] **Step 4: Commit**

```bash
git add scripts/measure-gsc-aggregation.mjs src/server/features/gsc/searchAnalytics.ts
git commit -m "Measure aggregation cost behind the analytics row ceiling"
```

---

## Task 3: Add a paginating fetch that reports what it examined

**Files:**

- Create: `src/server/features/gsc/fetchAllRows.ts`
- Test: `src/server/features/gsc/fetchAllRows.test.ts`

**Interfaces:**

- Consumes: `GscSearchAnalyticsRequest`, `GscSearchAnalyticsRow` from `src/server/lib/gscClient.ts`.
- Produces: `type GscRowResult = { rows: GscSearchAnalyticsRow[]; rowsExamined: number; truncated: boolean }` and `fetchAllRows(query, request, ceiling): Promise<GscRowResult>`. Tasks 4, 5 and 7 consume `GscRowResult`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { fetchAllRows } from "./fetchAllRows";
import type { GscSearchAnalyticsRow } from "@/server/lib/gscClient";

function rows(n: number, offset = 0): GscSearchAnalyticsRow[] {
  return Array.from({ length: n }, (_, i) => ({
    keys: [`q${offset + i}`],
    clicks: 1,
    impressions: 10,
    ctr: 0.1,
    position: 5,
  }));
}

describe("fetchAllRows", () => {
  it("stops when a page returns fewer rows than requested", async () => {
    const pages = [rows(1000), rows(400, 1000)];
    const query = async (req: { startRow?: number; rowLimit?: number }) =>
      pages[(req.startRow ?? 0) / 1000] ?? [];

    const result = await fetchAllRows(query, { rowLimit: 1000 }, 5000);

    expect(result.rows).toHaveLength(1400);
    expect(result.rowsExamined).toBe(1400);
    expect(result.truncated).toBe(false);
  });

  it("reports truncation when the ceiling is reached", async () => {
    const query = async () => rows(1000);

    const result = await fetchAllRows(query, { rowLimit: 1000 }, 3000);

    expect(result.rows).toHaveLength(3000);
    expect(result.truncated).toBe(true);
  });

  it("does not duplicate or drop rows across page boundaries", async () => {
    const query = async (req: { startRow?: number }) =>
      rows(1000, req.startRow ?? 0);

    const result = await fetchAllRows(query, { rowLimit: 1000 }, 2000);
    const keys = result.rows.map((r) => r.keys?.[0]);

    expect(new Set(keys).size).toBe(2000);
    expect(keys[0]).toBe("q0");
    expect(keys[1999]).toBe("q1999");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/server/features/gsc/fetchAllRows.test.ts`
Expected: FAIL — module `./fetchAllRows` does not exist.

- [ ] **Step 3: Implement**

```ts
import type {
  GscSearchAnalyticsRequest,
  GscSearchAnalyticsRow,
} from "@/server/lib/gscClient";

/** What a GSC pull actually examined.
 *
 *  `truncated` means the ceiling stopped us, so absence of a row is NOT
 *  evidence the row does not exist. Callers that render "none found" MUST
 *  branch on it — Google orders rows by clicks and does not guarantee
 *  returning every row for a request. */
export type GscRowResult = {
  rows: GscSearchAnalyticsRow[];
  rowsExamined: number;
  truncated: boolean;
};

type QueryFn = (
  request: GscSearchAnalyticsRequest,
) => Promise<GscSearchAnalyticsRow[]>;

/** Walk `startRow` until the API runs out of rows or we hit `ceiling`.
 *
 *  A short page means exhaustion: GSC returns fewer rows than `rowLimit` only
 *  when there are no more. Reaching the ceiling instead is reported, never
 *  silently swallowed. */
export async function fetchAllRows(
  query: QueryFn,
  request: GscSearchAnalyticsRequest,
  ceiling: number,
): Promise<GscRowResult> {
  const pageSize = Math.min(request.rowLimit ?? 1000, ceiling);
  const collected: GscSearchAnalyticsRow[] = [];

  while (collected.length < ceiling) {
    const remaining = ceiling - collected.length;
    const page = await query({
      ...request,
      rowLimit: Math.min(pageSize, remaining),
      startRow: collected.length,
    });

    collected.push(...page);

    if (page.length < Math.min(pageSize, remaining)) {
      return {
        rows: collected,
        rowsExamined: collected.length,
        truncated: false,
      };
    }
  }

  return {
    rows: collected,
    rowsExamined: collected.length,
    truncated: true,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/server/features/gsc/fetchAllRows.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/features/gsc/fetchAllRows.ts src/server/features/gsc/fetchAllRows.test.ts
git commit -m "Paginate GSC pulls and report what was examined"
```

---

## Task 4: Give property totals their own query-dimension pull

**Files:**

- Create: `src/server/features/gsc/gscAggregation.ts`
- Test: `src/server/features/gsc/gscAggregation.test.ts`
- Modify: `src/server/features/gsc/searchPerformanceReport.ts:84`

**Interfaces:**

- Consumes: `GscRowResult` from Task 3.
- Produces: `buildPropertyQueryTotals(rows: GscSearchAnalyticsRow[]): QueryTotalsRow[]` — sums query-dimension rows only — and `attributePagesToQueries(rows): Map<string, PageAttribution[]>` for query×page rows. Tasks 5 and 6 consume both.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  attributePagesToQueries,
  buildPropertyQueryTotals,
} from "./gscAggregation";

describe("property-versus-page aggregation", () => {
  it("does not double-count a property showing two URLs for one query", () => {
    // Google counts the property ONCE per impression even when two of its
    // URLs appear; page-dimension rows count each displayed URL.
    const queryRows = [
      { keys: ["widgets"], clicks: 0, impressions: 1, ctr: 0, position: 4 },
    ];

    const totals = buildPropertyQueryTotals(queryRows);

    expect(totals).toHaveLength(1);
    expect(totals[0].impressions).toBe(1);
  });

  it("keeps page rows as attribution, not as demand", () => {
    const pageRows = [
      {
        keys: ["widgets", "https://e.com/widgets"],
        clicks: 0,
        impressions: 100,
        ctr: 0,
        position: 4,
      },
      {
        keys: ["widgets", "https://e.com/sale/widgets"],
        clicks: 0,
        impressions: 100,
        ctr: 0,
        position: 9,
      },
    ];

    const attribution = attributePagesToQueries(pageRows);
    const pages = attribution.get("widgets") ?? [];

    expect(pages).toHaveLength(2);
    // Shares are relative to the pages of THIS query, never a demand total.
    expect(pages[0].shareOfQueryPageImpressions).toBeCloseTo(0.5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/server/features/gsc/gscAggregation.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
import type { GscSearchAnalyticsRow } from "@/server/lib/gscClient";

export type QueryTotalsRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type PageAttribution = {
  page: string;
  impressions: number;
  clicks: number;
  position: number;
  /** Share of this QUERY'S page-row impressions. Page rows overlap when
   *  several URLs of one property appear for one search, so this is a
   *  distribution across URLs — never a share of property demand. */
  shareOfQueryPageImpressions: number;
};

/** Demand totals. Input MUST be `dimensions: ["query"]` rows.
 *
 *  Passing query x page rows here double-counts: Google counts a property once
 *  per impression regardless of how many of its URLs appear, while page rows
 *  count each displayed URL. Position arrives already averaged over
 *  impressions for the query, which is why it is taken rather than recomputed. */
export function buildPropertyQueryTotals(
  rows: GscSearchAnalyticsRow[],
): QueryTotalsRow[] {
  const out: QueryTotalsRow[] = [];
  for (const row of rows) {
    const query = row.keys?.[0];
    if (!query) continue;
    out.push({
      query,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    });
  }
  return out.sort((a, b) => b.impressions - a.impressions);
}

/** Distribution of a query across the URLs that surfaced for it.
 *  Input MUST be `dimensions: ["query","page"]` rows. */
export function attributePagesToQueries(
  rows: GscSearchAnalyticsRow[],
): Map<string, PageAttribution[]> {
  const byQuery = new Map<string, PageAttribution[]>();

  for (const row of rows) {
    const query = row.keys?.[0];
    const page = row.keys?.[1];
    if (!query || !page) continue;
    const list = byQuery.get(query) ?? [];
    list.push({
      page,
      impressions: row.impressions,
      clicks: row.clicks,
      position: row.position,
      shareOfQueryPageImpressions: 0,
    });
    byQuery.set(query, list);
  }

  for (const list of byQuery.values()) {
    const total = list.reduce((sum, p) => sum + p.impressions, 0);
    for (const page of list) {
      page.shareOfQueryPageImpressions =
        total > 0 ? page.impressions / total : 0;
    }
    list.sort((a, b) => b.impressions - a.impressions);
  }

  return byQuery;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/server/features/gsc/gscAggregation.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Point the one production caller at a query-dimension pull**

`buildQueryTotals` has exactly one production caller —
`src/serverFunctions/searchPerformance.ts:120` — and it currently passes
query×page rows, which is the bug. `QueryTotalsRow` is a module-local type at
`searchPerformanceReport.ts:67` and is not exported, so nothing else breaks.

Add a fourth pull to the existing `Promise.all` in `searchPerformance.ts`
(alongside the striking-distance and country pulls, around line 95):

```ts
        GscService.getPerformance({
          projectId,
          startDate,
          endDate,
          dimensions: ["query"],
          filters: deviceFilters,
          rowLimit: GSC_ANALYTICS_ROW_CEILING,
        }),
```

Destructure it as `queryOnly` alongside `queryPages` and `countries`, then
change line 120:

```ts
        queryTotals: buildPropertyQueryTotals(queryOnly.rows),
```

Import `buildPropertyQueryTotals` from `@/server/features/gsc/gscAggregation`
and `GSC_ANALYTICS_ROW_CEILING` from `@/server/features/gsc/searchAnalytics`.

Delete `buildQueryTotals` and its local `QueryTotalsRow` from
`searchPerformanceReport.ts`. The query×page pull stays exactly as it is — it
still feeds striking distance, CTR opportunities and `toQueryPageRows`. Both
pulls are free.

- [ ] **Step 6: Run the affected suites**

Run: `npx vitest run src/server/features/gsc/`
Expected: PASS. Any pre-existing test asserting summed page impressions as a
query total should now fail — those tests encode the bug and must be rewritten
to assert the property total.

- [ ] **Step 7: Commit**

```bash
git add src/server/features/gsc/
git commit -m "Take query demand from query rows, not summed page rows"
```

---

## Task 5: Replace min-position with impression-weighted representation

**Files:**

- Modify: `src/server/features/gsc/gscAggregation.ts`
- Modify: `src/server/features/gsc/searchPerformanceReport.ts:152`
- Modify: `src/server/features/gsc/linkInsights.ts:103`
- Test: `src/server/features/gsc/gscAggregation.test.ts`

> **DECISION REQUIRED BEFORE STARTING.** This overturns a documented deliberate
> choice. `buildQueryTotals` currently states that the site's best page is "the
> honest answer to 'where do I rank for this'", and `buildStrikingDistanceRows`
> argues a query with any page above position 5 should be excluded from
> striking-distance work. The intent is sound; the implementation lets a page
> with one impression at position 1.0 outrank a page with 1,000 impressions at
> position 8.0, which both hides a real opportunity and picks the wrong internal
> link target. Confirm the semantic change before implementing.

**Interfaces:**

- Consumes: `PageAttribution` from Task 4.
- Produces: `representativePageForQuery(pages: PageAttribution[]): { page: string; position: number; split: boolean }`. Task 6 consumes it.

- [ ] **Step 1: Write the failing test**

```ts
describe("representative page", () => {
  it("does not let a one-impression page outrank the traffic-carrying page", () => {
    const pages = [
      {
        page: "/a",
        impressions: 1,
        clicks: 0,
        position: 1,
        shareOfQueryPageImpressions: 0.001,
      },
      {
        page: "/b",
        impressions: 1000,
        clicks: 20,
        position: 8,
        shareOfQueryPageImpressions: 0.999,
      },
    ];

    const result = representativePageForQuery(pages);

    expect(result.page).toBe("/b");
    expect(result.position).toBeCloseTo(8, 1);
    expect(result.split).toBe(false);
  });

  it("reports a split when no page owns the query", () => {
    const pages = [
      {
        page: "/a",
        impressions: 500,
        clicks: 10,
        position: 6,
        shareOfQueryPageImpressions: 0.5,
      },
      {
        page: "/b",
        impressions: 500,
        clicks: 10,
        position: 7,
        shareOfQueryPageImpressions: 0.5,
      },
    ];

    expect(representativePageForQuery(pages).split).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/server/features/gsc/gscAggregation.test.ts -t "representative page"`
Expected: FAIL — `representativePageForQuery` is not exported.

- [ ] **Step 3: Implement**

```ts
/** Ownership threshold above which one URL is treated as the query's page.
 *  Matches the 0.6 share already used by trending opportunities. */
const PAGE_OWNERSHIP_THRESHOLD = 0.6;

/** Pick the URL that actually represents a query.
 *
 *  NOT the minimum position: GSC averages position over impressions per row,
 *  so min-of-averages lets a single-impression fluke beat the page carrying
 *  the traffic. Ownership is by impressions; when no URL owns the query we say
 *  so instead of inventing a winner. */
export function representativePageForQuery(pages: PageAttribution[]): {
  page: string;
  position: number;
  split: boolean;
} {
  if (pages.length === 0) return { page: "", position: 0, split: false };

  const leader = pages.reduce((best, p) =>
    p.impressions > best.impressions ? p : best,
  );

  return {
    page: leader.page,
    position: leader.position,
    split:
      pages.length > 1 &&
      leader.shareOfQueryPageImpressions < PAGE_OWNERSHIP_THRESHOLD,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/server/features/gsc/gscAggregation.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Replace both min-position call sites**

In `searchPerformanceReport.ts:152` and `linkInsights.ts:103`, replace the
lowest-position reduction with `representativePageForQuery`. Where `split` is
true, do not emit a consolidation or internal-link recommendation — carry the
flag to the UI instead. Update the doc comments, which currently argue for the
old behaviour.

- [ ] **Step 6: Remove the deprecated alias**

Delete `GSC_MAX_ROW_LIMIT` from `searchAnalytics.ts` and update its importers to
`GSC_MCP_ROW_CEILING` or `GSC_ANALYTICS_ROW_CEILING` as appropriate.

- [ ] **Step 7: Verify the whole suite and the gate**

Run: `npx vitest run` then `pnpm ci:check`
Expected: both PASS.

- [ ] **Step 8: Commit**

```bash
git add src/server/features/gsc/
git commit -m "Represent a query by the page that carries it, not its best rank"
```

---

## Task 6: Stop counting one opportunity twice

**Files:**

- Modify: `src/client/features/opportunities/opportunityModel.ts:85-140`
- Test: `src/client/features/opportunities/opportunityModel.test.ts`

**Interfaces:**

- Consumes: existing `StrikingDistanceRow`, `CtrOpportunityRow`, `CannibalizationRow`.
- Produces: unchanged `buildOpportunities` signature; behaviour changes only.

- [ ] **Step 1: Write the failing test**

```ts
it("does not add quick-win and CTR estimates for the same query and page", () => {
  const row = {
    query: "widgets",
    page: "https://e.com/widgets",
    position: 8,
    impressions: 1000,
    clicks: 0,
  };

  const opportunities = buildOpportunities({
    strikingDistance: [row as never],
    ctrOpportunities: [row as never],
    cannibalization: [],
  });

  const forRow = opportunities.filter(
    (o) => o.query === "widgets" && o.page === "https://e.com/widgets",
  );

  expect(forRow).toHaveLength(1);
  // Both signals describe the same impressions reaching the top three, so the
  // combined estimate is the larger scenario, never the sum.
  expect(forRow[0].clicksAtStake).toBeLessThanOrEqual(
    Math.max(quickWinClicks(1000, 8), ctrGapClicks(1000, 8, 0)),
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/client/features/opportunities/opportunityModel.test.ts -t "same query and page"`
Expected: FAIL — two entries returned, and their estimates sum.

- [ ] **Step 3: Implement**

Replace the two independent `opportunities.push` loops with a merge keyed by
query and page. Collect signals first, then emit one opportunity per key whose
`clicksAtStake` is the maximum of the overlapping estimates, and whose `detail`
names every contributing signal. Cannibalization keeps its own entries only
where its key does not already exist.

```ts
const byKey = new Map<string, Opportunity>();
const keyOf = (query: string, page: string) => `${query} ${page}`;

function merge(candidate: Opportunity): void {
  const key = keyOf(candidate.query, candidate.page);
  const existing = byKey.get(key);
  if (!existing) {
    byKey.set(key, candidate);
    return;
  }
  // Overlapping scenarios over the SAME impressions: reaching the top three
  // already subsumes part of the title-rewrite gain, so summing would
  // overstate the headline "clicks at stake".
  byKey.set(key, {
    ...existing,
    clicksAtStake: Math.max(existing.clicksAtStake, candidate.clicksAtStake),
    detail: `${existing.detail}; also ${candidate.detail}`,
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/client/features/opportunities/opportunityModel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client/features/opportunities/
git commit -m "Merge overlapping opportunities instead of summing them"
```

---

## Task 7: Make every claim of absence conditional on completeness

**Files:**

- Modify: `src/serverFunctions/trendingOpportunities.ts:51,105`
- Modify: `src/serverFunctions/searchPerformance.ts:26,30,179`
- Modify: `src/client/features/link-insights/CannibalizationPage.tsx:89`
- Test: `src/serverFunctions/trendingOpportunities.test.ts`

**Interfaces:**

- Consumes: `GscRowResult` from Task 3, `GSC_ANALYTICS_ROW_CEILING` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

```ts
it("reports truncation once the analytics ceiling is actually reachable", async () => {
  // Regression guard for the clamp that made `currentTruncated` unreachable:
  // the request asked for 5000 and silently received at most 1000, so
  // rows.length >= 5000 could never be true.
  const result = await runTrendingOpportunities({
    rows: syntheticRows(GSC_ANALYTICS_ROW_CEILING),
  });

  expect(result.currentTruncated).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/serverFunctions/trendingOpportunities.test.ts -t "truncation"`
Expected: FAIL — flag stays false.

- [ ] **Step 3: Derive truncation from the applied ceiling**

Replace `rows.length >= QUERY_ROW_LIMIT` with the `truncated` field returned by
Task 3's fetch. Delete `QUERY_ROW_LIMIT` in favour of `GSC_ANALYTICS_ROW_CEILING`
so the requested and applied values can never diverge again.

Apply the same change to the striking-distance and cannibalization pulls in
`searchPerformance.ts:26` and `link-insights.ts:20`.

- [ ] **Step 4: Paginate countries and exports**

`searchPerformance.ts:30` caps countries at 25 with no pagination, hiding every
country ranked lower by clicks. `searchPerformance.ts:179` caps exports at 1,000
while describing them as the full dataset. Route both through `fetchAllRows`.
Include the applied limit in the export metadata when truncation occurred.

- [ ] **Step 5: Make empty-state copy branch on the flag**

Where the UI currently asserts absence, branch on `truncated`:

- Not truncated: keep the existing wording.
- Truncated: state the sample instead — for example "No striking-distance
  queries among the {rowsExamined} queries examined", and for cannibalization
  "No competing pages found in the queries examined" rather than declaring the
  site healthy.

Do not claim completeness anywhere `truncated` can be true.

- [ ] **Step 6: Verify**

Run: `npx vitest run` then `pnpm ci:check`
Expected: both PASS.

- [ ] **Step 7: Browser-verify the changed empty states**

Load Trending Opportunities, Search Performance and Cannibalization against a
connected property. Confirm the copy reflects the sample when truncated and
reads normally when not. Capture a screenshot of each.

- [ ] **Step 8: Commit**

```bash
git add src/serverFunctions/ src/client/features/
git commit -m "Say what was examined instead of claiming nothing exists"
```

---

## Task 8: Adversarial review before the PR

**Files:** none modified.

- [ ] **Step 1: Run the gate**

Run: `pnpm ci:check && npx vitest run`
Expected: both PASS. Record the output.

- [ ] **Step 2: Hand the diff to Codex**

```bash
git diff main...HEAD > /tmp/gsc-correctness.diff
```

Brief Codex to refute the change, not to approve it. Require a concrete failing
input per finding. Ask specifically whether any remaining arithmetic still treats
page-dimension rows as property demand, whether any empty state can still assert
absence while `truncated` is true, and whether pagination can duplicate or drop
boundary rows under a short final page.

Codex cannot run this toolchain — treat any "verified" claim in its report as
unverified and re-check here.

- [ ] **Step 3: Triage findings**

Separate real defects from domain-rationale disagreements. Fix the former. For
the latter, record the reasoning rather than silently changing behaviour.

- [ ] **Step 4: Open the PR**

Title: `Fix GSC row limits and aggregation semantics`. Body should state which
of the spec's findings this closes, the measured ceiling justification from
Task 2, and the Task 5 semantic change with its rationale.

---

## Self-Review

**Spec coverage (workstreams 1.1 and 1.2):**

| Spec item                                       | Task |
| ----------------------------------------------- | ---- |
| Row cap split by caller                         | 1    |
| Ceiling justified by measurement                | 2    |
| `startRow` pagination                           | 3    |
| `{ rows, rowsExamined, truncated }` contract    | 3    |
| Truncation derived from applied limit           | 1, 7 |
| Query-dimension rows for demand totals          | 4    |
| Page rows for attribution only                  | 4    |
| Cannibalization demand no longer inflated       | 4, 7 |
| Min-position removed                            | 5    |
| Split represented rather than a winner invented | 5    |
| Opportunity double-count merged                 | 6    |
| Empty-state copy conditional on completeness    | 7    |
| Export truncation surfaced                      | 7    |
| Country selector pagination                     | 7    |
| Codex adversarial pass                          | 8    |

**Not covered here, by design:** workstreams 1.3 (retry safety), 1.4 (cross-dialect timestamps), 1.5 (date ranges), 1.6 (SSRF), 1.7 (unsupported claims). Each gets its own plan. Note that 1.5's off-by-one affects the same `resolveDateRange` this plan touches in Task 1 — sequence 1.5 after this plan to avoid a conflicting edit, or fold it in if both land together.

**Blast radius, verified:** `buildQueryTotals` has one production caller (`src/serverFunctions/searchPerformance.ts:120`) and one test file (`searchPerformanceReport.test.ts`). `QueryTotalsRow` is module-local and unexported. Task 4 is therefore contained to three files.

**Open risk:** `searchPerformanceReport.test.ts:13,45` currently asserts `buildQueryTotals` behaviour against query×page input — those cases encode the double-count and will fail once Task 4 lands. Rewrite them to assert property totals from query-dimension rows rather than deleting them; a passing test that asserts the old sums is exactly the failure mode this overhaul exists to remove.
