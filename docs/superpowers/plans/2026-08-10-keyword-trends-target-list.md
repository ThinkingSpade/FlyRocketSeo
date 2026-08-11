# Keyword Trends Target List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Keyword Trends tab open with a ranked table of up to 100 keywords showing current ranking, volume, difficulty, trend and next action, instead of opening with a form.

**Architecture:** A merged table over two sources — free Search Console rows (already loaded on every mount) and one paid DataForSEO Labs `ranked_keywords` run that fires at most once per project and is thereafter restored for free from `analysis_runs`. The paid service, the table primitives and the run-history machinery all already exist; this plan wires them to a new tab and adds the once-only guard.

**Tech Stack:** TypeScript, React 19, TanStack Router/Query/Table, Zod, Vitest (node environment), Cloudflare Workers + D1 + R2, DataForSEO Labs.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-10-keyword-trends-target-list-design.md`. Read it before Task 1.
- **Never blend the two rank numbers.** Labs `rank_absolute` and GSC average position are different measurements. No averaging, no "best of", no fallback that hides which is shown.
- **A failed paid attempt must be persisted**, or the guard becomes an unbounded billing loop.
- **`expired` and `unreadable` restores must NOT auto-re-run.**
- **`RUN_FEATURES` values are a storage format.** Append only; never rename in place.
- **Vitest runs in a `node` environment and cannot render hooks or components.** Every test in this plan is over a pure function. Do not add React Testing Library.
- Verification command: `pnpm ci:check` (runs tsc + lint + vitest; use this rather than the three separately).
- Comment style: this codebase explains _why_, not _what_, and records defects that were fixed so they are not reintroduced. Match it.

---

### Task 1: Result schema and run-feature slug

**Files:**

- Create: `src/types/schemas/keyword-discovery.ts`
- Modify: `src/shared/analysis-run-features.ts:9-20`

**Interfaces:**

- Consumes: `storedMetricGeoSchema`, `STORED_GEO_BUNDLE_VERSION` from `src/types/schemas/geo.ts`
- Produces:
  - `RUN_FEATURES.keywordDiscovery` — the string `"keyword_discovery"`
  - `keywordDiscoveryResultSchema` — Zod discriminated union on `status`
  - `type KeywordDiscoveryResult`
  - `type KeywordDiscoveryKeyword` — `{ keyword, position, searchVolume, traffic, cpc, url, relativeUrl, keywordDifficulty }`
  - `keywordDiscoveryGeoBundleSchema` — for `parseStoredGeo`

- [ ] **Step 1: Add the run-feature slug**

In `src/shared/analysis-run-features.ts`, add one entry to the `RUN_FEATURES` object, after `keywordTrends`:

```ts
  keywordTrends: "keyword_trends",
  keywordDiscovery: "keyword_discovery",
```

- [ ] **Step 2: Write the failing test**

Create `src/types/schemas/keyword-discovery.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { keywordDiscoveryResultSchema } from "./keyword-discovery";

describe("keywordDiscoveryResultSchema", () => {
  it("accepts a successful run", () => {
    const parsed = keywordDiscoveryResultSchema.safeParse({
      status: "ok",
      domain: "americavending.com",
      fetchedAt: "2026-08-10T00:00:00.000Z",
      keywords: [
        {
          keyword: "office coffee service dallas",
          position: 7,
          searchVolume: 320,
          traffic: 41.2,
          cpc: 6.5,
          url: "https://americavending.com/coffee",
          relativeUrl: "/coffee",
          keywordDifficulty: 34,
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a recorded failure, which is what stops the billing loop", () => {
    const parsed = keywordDiscoveryResultSchema.safeParse({
      status: "failed",
      reason: "insufficient_credits",
      attemptedAt: "2026-08-10T00:00:00.000Z",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a payload with no status discriminant", () => {
    const parsed = keywordDiscoveryResultSchema.safeParse({ keywords: [] });
    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/types/schemas/keyword-discovery.test.ts`
Expected: FAIL — cannot resolve `./keyword-discovery`.

- [ ] **Step 4: Write the schema**

Create `src/types/schemas/keyword-discovery.ts`:

```ts
import { z } from "zod";
import { storedMetricGeoSchema, STORED_GEO_BUNDLE_VERSION } from "./geo";

/**
 * One run of the Keyword Trends tab's paid keyword discovery.
 *
 * A DISCRIMINATED UNION rather than a plain result, and that is the whole
 * point of this file. The tab auto-runs the paid call once per project and
 * then never again, and the only durable record of "we already tried" is the
 * analysis_runs row. If a FAILED attempt had nowhere to live, every mount for
 * a project with no credits (or against a vendor 5xx) would re-fire the call
 * forever -- and DataForSEO can charge for a task that then errors, so those
 * retries are not free. Storing the failure here makes "have we tried?" and
 * "what did we get?" the same question, answered by the one restore call the
 * tab already makes.
 */

export const keywordDiscoveryKeywordSchema = z.object({
  keyword: z.string(),
  /** Labs `rank_absolute`: a point-in-time SERP position for `url`. NEVER
   *  merge this with Search Console's property-level average position. */
  position: z.number().nullable(),
  searchVolume: z.number().nullable(),
  traffic: z.number().nullable(),
  cpc: z.number().nullable(),
  url: z.string().nullable(),
  relativeUrl: z.string().nullable(),
  keywordDifficulty: z.number().nullable(),
});
export type KeywordDiscoveryKeyword = z.infer<
  typeof keywordDiscoveryKeywordSchema
>;

export const keywordDiscoveryResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    domain: z.string(),
    fetchedAt: z.string(),
    keywords: z.array(keywordDiscoveryKeywordSchema),
  }),
  z.object({
    status: z.literal("failed"),
    /** Short machine-ish tag, not a raw provider message: this is rendered. */
    reason: z.string(),
    attemptedAt: z.string(),
  }),
]);
export type KeywordDiscoveryResult = z.infer<
  typeof keywordDiscoveryResultSchema
>;

/**
 * The run's own persisted geography, read back by `parseStoredGeo` so a
 * restored table is labeled with the scope it was actually fetched under --
 * never with whatever the live ScopeControl happens to show now.
 */
export const keywordDiscoveryGeoBundleSchema = z.object({
  v: z.literal(STORED_GEO_BUNDLE_VERSION),
  rankings: storedMetricGeoSchema,
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/types/schemas/keyword-discovery.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/types/schemas/keyword-discovery.ts src/types/schemas/keyword-discovery.test.ts src/shared/analysis-run-features.ts
git commit -m "Keyword discovery: result schema that can hold a failed attempt"
```

---

### Task 2: The merge function

**Files:**

- Create: `src/client/features/trends/mergeKeywordRows.ts`
- Create: `src/client/features/trends/mergeKeywordRows.test.ts`

**Interfaces:**

- Consumes: `TrendingOpportunity` from `./opportunityActions`, `KeywordDiscoveryKeyword` from `@/types/schemas/keyword-discovery`
- Produces:
  - `type KeywordTargetRow`
  - `mergeKeywordRows(input: { gsc: readonly TrendingOpportunity[]; labs: readonly KeywordDiscoveryKeyword[] }): KeywordTargetRow[]`

- [ ] **Step 1: Write the failing test**

Create `src/client/features/trends/mergeKeywordRows.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mergeKeywordRows } from "./mergeKeywordRows";
import type { TrendingOpportunity } from "./opportunityActions";
import type { KeywordDiscoveryKeyword } from "@/types/schemas/keyword-discovery";

function gscRow(over: Partial<TrendingOpportunity> = {}): TrendingOpportunity {
  return {
    keyword: "vending machines dallas",
    action: "fix",
    reason: "You average #7.",
    position: 7.4,
    page: "https://americavending.com/dallas",
    pageShare: 0.9,
    momentum: {
      query: "vending machines dallas",
      impressions: 400,
      prevImpressions: 250,
      percent: 60,
      direction: "rising",
    },
    score: 640,
    ...over,
  };
}

function labsRow(
  over: Partial<KeywordDiscoveryKeyword> = {},
): KeywordDiscoveryKeyword {
  return {
    keyword: "vending machines dallas",
    position: 5,
    searchVolume: 1300,
    traffic: 88.1,
    cpc: 4.2,
    url: "https://americavending.com/dallas",
    relativeUrl: "/dallas",
    keywordDifficulty: 41,
    ...over,
  };
}

describe("mergeKeywordRows", () => {
  it("produces ONE row for a keyword both sources know", () => {
    const rows = mergeKeywordRows({ gsc: [gscRow()], labs: [labsRow()] });
    expect(rows).toHaveLength(1);
  });

  it("keeps the two rank numbers in separate fields and never blends them", () => {
    const [row] = mergeKeywordRows({ gsc: [gscRow()], labs: [labsRow()] });
    expect(row.serpRank).toBe(5);
    expect(row.gscAveragePosition).toBe(7.4);
    // The blended values a careless implementation would produce:
    expect(row.serpRank).not.toBe(6.2); // mean
    expect(row.serpRank).not.toBe(7.4); // GSC leaking into the SERP field
  });

  it("matches case-insensitively and on trimmed whitespace", () => {
    const rows = mergeKeywordRows({
      gsc: [gscRow({ keyword: "  Vending Machines Dallas " })],
      labs: [labsRow({ keyword: "vending machines dallas" })],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].serpRank).toBe(5);
    expect(rows[0].gscAveragePosition).toBe(7.4);
  });

  it("gives a Labs-only keyword no trend and no action", () => {
    const [row] = mergeKeywordRows({
      gsc: [],
      labs: [labsRow({ keyword: "breakroom supplies fort worth" })],
    });
    expect(row.momentum).toBeNull();
    expect(row.action).toBeNull();
    expect(row.impressions).toBeNull();
    expect(row.gscAveragePosition).toBeNull();
  });

  it("gives a GSC-only keyword no SERP rank and no volume", () => {
    const [row] = mergeKeywordRows({
      gsc: [gscRow({ keyword: "office snack refreshment program" })],
      labs: [],
    });
    expect(row.serpRank).toBeNull();
    expect(row.searchVolume).toBeNull();
    expect(row.keywordDifficulty).toBeNull();
    expect(row.gscAveragePosition).toBe(7.4);
    expect(row.action).toBe("fix");
  });

  it("keeps low-impression GSC rows, which the card used to hide entirely", () => {
    const rows = mergeKeywordRows({
      gsc: [
        gscRow({
          keyword: "dfw vending",
          action: "watch",
          momentum: {
            query: "dfw vending",
            impressions: 4,
            prevImpressions: null,
            percent: null,
            direction: "unknown",
          },
        }),
      ],
      labs: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].impressions).toBe(4);
  });

  it("sorts by search volume descending with unknown volume last", () => {
    const rows = mergeKeywordRows({
      gsc: [gscRow({ keyword: "gsc only" })],
      labs: [
        labsRow({ keyword: "small", searchVolume: 90 }),
        labsRow({ keyword: "big", searchVolume: 5000 }),
      ],
    });
    expect(rows.map((row) => row.keyword)).toEqual([
      "big",
      "small",
      "gsc only",
    ]);
  });

  it("returns an empty array when neither source has anything", () => {
    expect(mergeKeywordRows({ gsc: [], labs: [] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/client/features/trends/mergeKeywordRows.test.ts`
Expected: FAIL — cannot resolve `./mergeKeywordRows`.

- [ ] **Step 3: Write the implementation**

Create `src/client/features/trends/mergeKeywordRows.ts`:

```ts
import type { KeywordDiscoveryKeyword } from "@/types/schemas/keyword-discovery";
import type {
  OpportunityAction,
  TrendingOpportunity,
} from "./opportunityActions";
import type { QueryMomentum } from "./queryMomentum";

/**
 * Merges the tab's two keyword sources into one table.
 *
 * THE TWO RANK NUMBERS STAY IN SEPARATE FIELDS, and that is the load-bearing
 * property of this module. Search Console's `position` is a property-level
 * AVERAGE across every impression and names no URL -- trendingOpportunities.ts
 * already warns it "must never be presented as 'that page ranks #N'". Labs'
 * `rank_absolute` is a point-in-time SERP position for one specific URL.
 * Averaging them, or falling back from one to the other in a single field,
 * produces a number that describes nothing real. The UI picks which to show
 * and labels it; this function refuses to decide by blending.
 *
 * Low-impression GSC rows are KEPT here. They arrive with
 * `direction: "unknown"` and `action: "watch"` (see queryMomentum.ts's
 * MIN_IMPRESSIONS_FOR_VERDICT), which the old card filtered out via
 * `isActionable` -- that filter is why a real site showed three rows. The
 * floor still governs what we CLAIM about a row; it no longer governs whether
 * the row exists.
 */

export type KeywordTargetRow = {
  keyword: string;
  /** Labs `rank_absolute`, or null when only Search Console knows this term. */
  serpRank: number | null;
  /** GSC property-level average position, or null when GSC has no row. */
  gscAveragePosition: number | null;
  searchVolume: number | null;
  keywordDifficulty: number | null;
  cpc: number | null;
  traffic: number | null;
  url: string | null;
  impressions: number | null;
  /** Null for a Labs-only keyword: GSC has nothing to say about a term the
   *  site gets no impressions for, and an empty cell says so more honestly
   *  than a zero would. */
  momentum: QueryMomentum | null;
  /** Null for a Labs-only keyword -- every verdict in opportunityActions.ts
   *  is derived from impressions and position together. */
  action: OpportunityAction | null;
  reason: string | null;
};

/** Match key. Trimmed and lowercased because the two providers disagree about
 *  both: GSC returns queries as typed, Labs normalizes. */
function matchKey(keyword: string): string {
  return keyword.trim().toLowerCase();
}

export function mergeKeywordRows(input: {
  gsc: readonly TrendingOpportunity[];
  labs: readonly KeywordDiscoveryKeyword[];
}): KeywordTargetRow[] {
  const rows = new Map<string, KeywordTargetRow>();

  for (const item of input.labs) {
    const key = matchKey(item.keyword);
    if (key === "") continue;
    rows.set(key, {
      keyword: item.keyword.trim(),
      serpRank: item.position,
      gscAveragePosition: null,
      searchVolume: item.searchVolume,
      keywordDifficulty: item.keywordDifficulty,
      cpc: item.cpc,
      traffic: item.traffic,
      url: item.url,
      impressions: null,
      momentum: null,
      action: null,
      reason: null,
    });
  }

  for (const item of input.gsc) {
    const key = matchKey(item.keyword);
    if (key === "") continue;
    const existing = rows.get(key);
    rows.set(key, {
      keyword: existing?.keyword ?? item.keyword.trim(),
      serpRank: existing?.serpRank ?? null,
      gscAveragePosition: item.position,
      searchVolume: existing?.searchVolume ?? null,
      keywordDifficulty: existing?.keywordDifficulty ?? null,
      cpc: existing?.cpc ?? null,
      traffic: existing?.traffic ?? null,
      // Labs names the ranking URL exactly; GSC's dominant page is a share
      // estimate, so it is only used when Labs has no row at all.
      url: existing?.url ?? item.page,
      impressions: item.momentum.impressions,
      momentum: item.momentum,
      action: item.action,
      reason: item.reason,
    });
  }

  // Volume descending, unknown volume last: the table answers "what is worth
  // targeting", and volume is the only column here that describes the market
  // rather than this site. Rows with no volume are GSC-only -- an anonymised
  // or very fresh query Labs has not picked up -- and belong below the rows
  // we can actually size. Impressions break ties so two unsized rows still
  // order sensibly.
  return [...rows.values()].sort((a, b) => {
    const volumeA = a.searchVolume ?? -1;
    const volumeB = b.searchVolume ?? -1;
    if (volumeA !== volumeB) return volumeB - volumeA;
    return (b.impressions ?? 0) - (a.impressions ?? 0);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/client/features/trends/mergeKeywordRows.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/client/features/trends/mergeKeywordRows.ts src/client/features/trends/mergeKeywordRows.test.ts
git commit -m "Keyword targets: merge GSC and Labs rows without blending rank"
```

---

### Task 3: The auto-run guard

**Files:**

- Create: `src/client/features/trends/shouldAutoRunDiscovery.ts`
- Create: `src/client/features/trends/shouldAutoRunDiscovery.test.ts`

**Interfaces:**

- Produces: `shouldAutoRunDiscovery(input: { outcome: RestoreOutcomeName | null; hasDomain: boolean; hasCredits: boolean; alreadyAttempted: boolean }): boolean`, `type RestoreOutcomeName = "none" | "expired" | "unreadable" | "ready"`

- [ ] **Step 1: Write the failing test**

Create `src/client/features/trends/shouldAutoRunDiscovery.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { shouldAutoRunDiscovery } from "./shouldAutoRunDiscovery";

const base = {
  outcome: "none" as const,
  hasDomain: true,
  hasCredits: true,
  alreadyAttempted: false,
};

describe("shouldAutoRunDiscovery", () => {
  it("runs when there is no prior run and both preconditions hold", () => {
    expect(shouldAutoRunDiscovery(base)).toBe(true);
  });

  it("does not run while the restore is still resolving", () => {
    expect(shouldAutoRunDiscovery({ ...base, outcome: null })).toBe(false);
  });

  it("does not run when a run was already restored", () => {
    expect(shouldAutoRunDiscovery({ ...base, outcome: "ready" })).toBe(false);
  });

  it("does NOT auto-run an expired run: retention must not become a charge", () => {
    expect(shouldAutoRunDiscovery({ ...base, outcome: "expired" })).toBe(false);
  });

  it("does not auto-run an unreadable run", () => {
    expect(shouldAutoRunDiscovery({ ...base, outcome: "unreadable" })).toBe(
      false,
    );
  });

  it("does not run without a project domain", () => {
    expect(shouldAutoRunDiscovery({ ...base, hasDomain: false })).toBe(false);
  });

  it("does not run without credits", () => {
    expect(shouldAutoRunDiscovery({ ...base, hasCredits: false })).toBe(false);
  });

  it("does not run twice in one mounted session", () => {
    expect(shouldAutoRunDiscovery({ ...base, alreadyAttempted: true })).toBe(
      false,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/client/features/trends/shouldAutoRunDiscovery.test.ts`
Expected: FAIL — cannot resolve `./shouldAutoRunDiscovery`.

- [ ] **Step 3: Write the implementation**

Create `src/client/features/trends/shouldAutoRunDiscovery.ts`:

```ts
/**
 * Whether to spend money without being asked.
 *
 * This tab is the ONE place in this app that auto-runs a paid call, at the
 * user's explicit request: run once per project, then serve the stored copy
 * forever until they click re-run. Everything below exists to keep "once"
 * actually meaning once.
 *
 * The durable guard is the analysis_runs row, reached here as `outcome`.
 * `alreadyAttempted` is only a within-mount latch to stop a second render
 * firing before the first request resolves -- it is NOT the guard, and it must
 * never become the guard, because component state resets on every navigation
 * and would bill on every visit.
 */

export type RestoreOutcomeName = "none" | "expired" | "unreadable" | "ready";

export function shouldAutoRunDiscovery(input: {
  /** `useAutoRestoredRun`'s outcome; null while the restore is in flight. */
  outcome: RestoreOutcomeName | null;
  hasDomain: boolean;
  hasCredits: boolean;
  alreadyAttempted: boolean;
}): boolean {
  // Null means we do not yet know whether a run exists. Spending on a
  // maybe is exactly the bug this function prevents.
  if (input.outcome !== "none") return false;
  if (input.alreadyAttempted) return false;
  if (!input.hasDomain) return false;
  // No credits is not a transient error to retry through -- the call would
  // fail, and a failed DataForSEO task can still be billed.
  if (!input.hasCredits) return false;
  return true;
}
```

Note the single `input.outcome !== "none"` check covers `ready`, `expired`, `unreadable` and `null` at once. `expired` and `unreadable` are deliberately in that set: both mean a run HAPPENED, so re-running is a repeat charge, and the user is offered a button instead.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/client/features/trends/shouldAutoRunDiscovery.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/client/features/trends/shouldAutoRunDiscovery.ts src/client/features/trends/shouldAutoRunDiscovery.test.ts
git commit -m "Keyword discovery: guard that makes 'run once' mean once"
```

---

### Task 4: The server service

**Files:**

- Create: `src/server/features/keywords/services/keywordDiscovery.ts`

**Interfaces:**

- Consumes: `getKeywordsPage` (`src/server/features/domain/services/domainKeywordsPage.ts:40`), `AnalysisRunService.record`, `RUN_FEATURES.keywordDiscovery`, `KeywordDiscoveryResult`
- Produces: `runKeywordDiscovery(input, billingCustomer): Promise<KeywordDiscoveryResult>`

- [ ] **Step 1: Read the service being wrapped**

Read `src/server/features/domain/services/domainKeywordsPage.ts` in full, and `src/server/features/domain/services/DomainService.ts:96-121` for the `recordRun` pattern. `getKeywordsPage` already R2-caches for 12 hours and already returns exactly the fields this feature needs — do not reimplement it, and do not change it.

- [ ] **Step 2: Write the service**

Create `src/server/features/keywords/services/keywordDiscovery.ts`:

```ts
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { getKeywordsPage } from "@/server/features/domain/services/domainKeywordsPage";
import { AnalysisRunService } from "@/server/features/analysis-runs/services/analysisRuns";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { buildCacheKey, setCached } from "@/server/lib/r2-cache";
import type {
  KeywordDiscoveryResult,
  KeywordDiscoveryKeyword,
} from "@/types/schemas/keyword-discovery";
import type { StoredMetricGeo } from "@/types/schemas/geo";
import { STORED_GEO_BUNDLE_VERSION } from "@/types/schemas/geo";

/**
 * The Keyword Trends tab's one paid call.
 *
 * A thin caller rather than a new provider integration: `getKeywordsPage`
 * already fetches, maps, filters and caches Labs ranked_keywords for Domain
 * Overview. What is new here is (a) asking for one big page instead of a
 * paginated slice and (b) RECORDING the attempt, which is what lets the tab
 * auto-run exactly once.
 *
 * Deliberately not routed through Domain Overview's own server function: that
 * endpoint carries a tab's pagination/sort/filter arguments, records no run,
 * and is consumed behind `useMeteredQuery`'s authorize gate. This tab opens
 * that gate without a click, and widening the shared endpoint to allow it
 * would remove the protection from the tab that still needs it.
 */

/** One page, not a paginated table: the user asked for a list of 50-100.
 *  100 is already one of `DOMAIN_KEYWORDS_PAGE_SIZES` ([50, 100, 200]), so
 *  this asks the shared service for nothing it does not already serve. */
const DISCOVERY_PAGE_SIZE = 100;

export type KeywordDiscoveryInput = {
  projectId: string;
  domain: string;
  locationCode: number;
  languageCode: string;
  /** Captured at run time by the client and persisted verbatim, so a restored
   *  table is labeled with the scope it was fetched under. Never read back to
   *  decide anything about THIS request. */
  geo: StoredMetricGeo;
};

export async function runKeywordDiscovery(
  input: KeywordDiscoveryInput,
  billingCustomer: BillingCustomerContext,
): Promise<KeywordDiscoveryResult> {
  const params = {
    domain: input.domain,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    geo: { v: STORED_GEO_BUNDLE_VERSION, rankings: input.geo },
  };

  try {
    const page = await getKeywordsPage(
      {
        projectId: input.projectId,
        domain: input.domain,
        includeSubdomains: false,
        locationCode: input.locationCode,
        languageCode: input.languageCode,
        page: 1,
        pageSize: DISCOVERY_PAGE_SIZE,
        sortMode: "traffic",
        sortOrder: "desc",
        filters: {},
      },
      billingCustomer,
    );

    const keywords: KeywordDiscoveryKeyword[] = page.keywords.map((row) => ({
      keyword: row.keyword,
      position: row.position,
      searchVolume: row.searchVolume,
      traffic: row.traffic,
      cpc: row.cpc,
      url: row.url,
      relativeUrl: row.relativeUrl,
      keywordDifficulty: row.keywordDifficulty,
    }));

    const result: KeywordDiscoveryResult = {
      status: "ok",
      domain: page.domain,
      fetchedAt: page.fetchedAt,
      keywords,
    };

    await recordDiscoveryRun(input, params, result, billingCustomer);
    return result;
  } catch (error) {
    // RECORD THE FAILURE, then rethrow.
    //
    // Without this row the tab's guard sees "no run has ever happened" on the
    // next mount and fires the paid call again -- forever, for any project
    // that is out of credits or hitting a provider outage. DataForSEO can
    // charge for a task that subsequently errors (see DataforseoChargedTaskError),
    // so those repeats are not free. Recording turns an unbounded loop into one
    // attempt plus a retry button.
    const result: KeywordDiscoveryResult = {
      status: "failed",
      reason: describeFailure(error),
      attemptedAt: new Date().toISOString(),
    };
    await recordDiscoveryRun(input, params, result, billingCustomer);
    throw error;
  }
}

/**
 * Records the attempt under its own cache key.
 *
 * `AnalysisRunService.record` copies whatever sits at `cacheKey` into the
 * durable `analysis-runs/` prefix, so the payload has to be written first --
 * including for a failure, which has no provider response of its own to reuse.
 */
async function recordDiscoveryRun(
  input: KeywordDiscoveryInput,
  params: Record<string, unknown>,
  result: KeywordDiscoveryResult,
  billingCustomer: BillingCustomerContext,
): Promise<void> {
  const cacheKey = await buildCacheKey("keyword-discovery:run", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    domain: input.domain,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    attemptedAt:
      result.status === "failed" ? result.attemptedAt : result.fetchedAt,
  });

  await setCached(cacheKey, result, DISCOVERY_RUN_TTL_SECONDS).catch(
    (error) => {
      console.error("keyword-discovery.cache-write failed:", error);
    },
  );

  await AnalysisRunService.record({
    projectId: input.projectId,
    feature: RUN_FEATURES.keywordDiscovery,
    params,
    cacheKey,
    label: input.domain,
  });
}

/** The soft TTL on the shared cache copy. The DURABLE copy lives under the
 *  `analysis-runs/` prefix and is what a restore actually reads, so this only
 *  governs the short-lived cache object. */
const DISCOVERY_RUN_TTL_SECONDS = 12 * 60 * 60;

/** A short tag safe to render. Never the raw provider message, which can carry
 *  account identifiers and endpoint detail. */
function describeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/credit/i.test(message)) return "insufficient_credits";
  if (/rate|429/i.test(message)) return "rate_limited";
  return "provider_error";
}
```

- [ ] **Step 3: Verify the imports resolve**

Run: `pnpm tsc --noEmit`
Expected: no errors from this file. If `AnalysisRunService` is not the exported name, open `src/server/features/analysis-runs/services/analysisRuns.ts` and use the name it actually exports — do not invent one. Same for `setCached`/`buildCacheKey` in `src/server/lib/r2-cache.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/server/features/keywords/services/keywordDiscovery.ts
git commit -m "Keyword discovery: one paid call, and a recorded failure that stops the loop"
```

---

### Task 5: The server function

**Files:**

- Create: `src/serverFunctions/keywordDiscovery.ts`

**Interfaces:**

- Consumes: `runKeywordDiscovery`, `requireProjectContext` (`src/serverFunctions/middleware.ts`), `storedMetricGeoSchema`
- Produces: `getKeywordDiscovery` server function taking `{ projectId, domain, locationCode, languageCode, geo }`

- [ ] **Step 1: Read an existing server function for the exact pattern**

Read `src/serverFunctions/domain.ts:70-86` and `src/serverFunctions/trendingOpportunities.ts:179-182`. Match the `createServerFn({ method: "POST" }).middleware(requireProjectContext).validator(schema).handler(...)` shape, and note that `context.projectId` — not `data.projectId` — is the trusted value.

- [ ] **Step 2: Write the server function**

Create `src/serverFunctions/keywordDiscovery.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { runKeywordDiscovery } from "@/server/features/keywords/services/keywordDiscovery";
import { storedMetricGeoSchema } from "@/types/schemas/geo";
import type { KeywordDiscoveryResult } from "@/types/schemas/keyword-discovery";

const inputSchema = z.object({
  projectId: z.string().min(1),
  domain: z.string().min(1),
  locationCode: z.number().int().positive(),
  languageCode: z.string().min(2).max(8),
  geo: storedMetricGeoSchema,
});

/**
 * PAID. One Labs ranked_keywords call per invocation.
 *
 * The Keyword Trends tab calls this automatically the first time a project
 * opens the tab and never again -- the guard is the analysis_runs row this
 * writes, not anything in the client. See shouldAutoRunDiscovery.ts.
 *
 * The explicit return type is not decoration: without it `createServerFn`
 * widens the result union's two branches into one optional-everything object
 * and `status` stops narrowing at every call site (the same trap
 * getQueryMomentum documents).
 */
export const getKeywordDiscovery = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(inputSchema)
  .handler(
    async ({ data, context }): Promise<KeywordDiscoveryResult> =>
      runKeywordDiscovery(
        {
          projectId: context.projectId,
          domain: data.domain,
          locationCode: data.locationCode,
          languageCode: data.languageCode,
          geo: data.geo,
        },
        context,
      ),
  );
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm tsc --noEmit`
Expected: clean. If `context` is not directly assignable as the billing customer, check what `requireProjectContext` puts on context in `src/serverFunctions/middleware.ts` and pass the same value `DomainService` call sites pass.

- [ ] **Step 4: Commit**

```bash
git add src/serverFunctions/keywordDiscovery.ts
git commit -m "Keyword discovery: server function"
```

---

### Task 6: The hook

**Files:**

- Create: `src/client/features/trends/useKeywordTargets.ts`

**Interfaces:**

- Consumes: `useTrendingOpportunities`, `useAutoRestoredRun`, `mergeKeywordRows`, `shouldAutoRunDiscovery`, `getKeywordDiscovery`, `useProjectDomain`, `useProjectMarket`, `useTargetAreaScope`, `resolveRunGeo`, `toStoredMetricGeo`, `parseStoredGeo`
- Produces: `useKeywordTargets(projectId: string): KeywordTargetsState` where

```ts
type KeywordTargetsState = {
  rows: KeywordTargetRow[];
  geo: ResolvedGeo | null;
  fetchedAt: string | null;
  isLoadingFree: boolean;
  isRunningPaid: boolean;
  /** "ok" | "none" | "failed" | "expired" | "no-domain" | "no-credits" */
  paidState: PaidState;
  gscUnavailable: boolean;
  runAgain: () => void;
};
```

- [ ] **Step 1: Read the two hooks being composed**

Read `src/client/features/trends/useTrendingOpportunities.ts` and `src/client/features/analysis-runs/useAutoRestoredRun.ts` in full. Note that `useAutoRestoredRun` returns `{ restored, outcome, expired, isRestoring, ... }` and that `outcome` is `null` while in flight — `shouldAutoRunDiscovery` depends on that exact contract.

- [ ] **Step 2: Write the hook**

Create `src/client/features/trends/useKeywordTargets.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { getKeywordDiscovery } from "@/serverFunctions/keywordDiscovery";
import {
  keywordDiscoveryGeoBundleSchema,
  keywordDiscoveryResultSchema,
  type KeywordDiscoveryResult,
} from "@/types/schemas/keyword-discovery";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import {
  useProjectDomain,
  useProjectMarket,
} from "@/client/hooks/useProjectDomain";
import { useTargetAreaScope } from "@/client/features/geo/useTargetAreaScope";
import {
  parseStoredGeo,
  resolveRunGeo,
  toStoredMetricGeo,
} from "@/client/features/geo/resolveRunGeo";
import { resolveStoredGeo } from "@/client/features/geo/resolveRunGeo";
import type { ResolvedGeo } from "@/shared/geo/types";
import { useTrendingOpportunities } from "./useTrendingOpportunities";
import { mergeKeywordRows, type KeywordTargetRow } from "./mergeKeywordRows";
import { shouldAutoRunDiscovery } from "./shouldAutoRunDiscovery";

/**
 * The Keyword Trends tab's keyword table, assembled from a free source and a
 * once-only paid one.
 *
 * The paid half auto-runs at most once per project. Everything about that is
 * deliberate and fragile, so: the guard is `useAutoRestoredRun`'s outcome (a
 * D1 row), `attemptedRef` is only a within-mount latch, and a mutation is used
 * rather than a query specifically because a query would refetch.
 */

export type PaidState =
  | "ok"
  | "running"
  | "none"
  | "failed"
  | "expired"
  | "no-domain"
  | "no-credits";

export function useKeywordTargets(projectId: string, hasCredits: boolean) {
  const free = useTrendingOpportunities(projectId);
  const domain = useProjectDomain(projectId);
  const market = useProjectMarket(projectId);
  const targetAreaScope = useTargetAreaScope(projectId, market.locationCode);

  const restored = useAutoRestoredRun({
    projectId,
    feature: RUN_FEATURES.keywordDiscovery,
    schema: keywordDiscoveryResultSchema,
    enabled: true,
  });

  const [fresh, setFresh] = useState<KeywordDiscoveryResult | null>(null);
  const [freshGeo, setFreshGeo] = useState<ResolvedGeo | null>(null);
  // Within-mount latch ONLY. The durable guard is the analysis_runs row via
  // `restored.outcome`; a ref resets on navigation and must never be trusted
  // as the thing that stops repeat billing.
  const attemptedRef = useRef(false);

  const discovery = useMutation({
    mutationFn: (input: { geo: ResolvedGeo; countryCode: number }) =>
      getKeywordDiscovery({
        data: {
          projectId,
          domain: domain ?? "",
          locationCode: input.geo.locationCode,
          languageCode: input.geo.languageCode,
          geo: toStoredMetricGeo(input.geo, input.countryCode),
        },
      }),
    onSuccess: (result) => setFresh(result),
    // No retry. A failed paid call may already have been billed.
    retry: 0,
  });

  const start = useCallback(() => {
    if (!domain) return;
    const geo = resolveRunGeo(
      "keyword-volume",
      targetAreaScope.area,
      market.locationCode,
    );
    attemptedRef.current = true;
    setFreshGeo(geo);
    discovery.mutate({ geo, countryCode: market.locationCode });
  }, [discovery, domain, market.locationCode, targetAreaScope.area]);

  useEffect(() => {
    if (
      !shouldAutoRunDiscovery({
        outcome: restored.outcome,
        hasDomain: domain != null,
        hasCredits,
        alreadyAttempted: attemptedRef.current,
      })
    ) {
      return;
    }
    start();
  }, [domain, hasCredits, restored.outcome, start]);

  const active = fresh ?? restored.restored?.result ?? null;

  // A restored run is labeled with ITS OWN persisted scope, never with
  // whatever the live ScopeControl shows now -- relabelling data fetched under
  // a different scope is the failure resolveRunGeo.ts exists to prevent.
  const restoredGeo = useMemo(() => {
    const stored = parseStoredGeo(
      keywordDiscoveryGeoBundleSchema,
      restored.restored?.params,
    )?.rankings;
    return stored
      ? resolveStoredGeo(
          "keyword-volume",
          stored.locationCode,
          stored.languageCode,
        )
      : null;
  }, [restored.restored?.params]);

  const rows = useMemo(
    () =>
      mergeKeywordRows({
        gsc: free.opportunities,
        labs: active?.status === "ok" ? active.keywords : [],
      }),
    [active, free.opportunities],
  );

  const paidState: PaidState = discovery.isPending
    ? "running"
    : domain == null
      ? "no-domain"
      : !hasCredits && active == null
        ? "no-credits"
        : discovery.isError || active?.status === "failed"
          ? "failed"
          : restored.outcome === "expired" || restored.outcome === "unreadable"
            ? "expired"
            : active?.status === "ok"
              ? "ok"
              : "none";

  return {
    rows,
    geo: fresh ? freshGeo : restoredGeo,
    fetchedAt: active?.status === "ok" ? active.fetchedAt : null,
    isLoadingFree: free.isLoading,
    isRunningPaid: discovery.isPending,
    paidState,
    gscUnavailable: free.unavailable,
    runAgain: start,
  };
}
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm tsc --noEmit`
Expected: clean. `resolveStoredGeo` and `parseStoredGeo` are both exported from `src/client/features/geo/resolveRunGeo.ts` — merge the two import lines rather than importing the module twice.

- [ ] **Step 4: Commit**

```bash
git add src/client/features/trends/useKeywordTargets.ts
git commit -m "Keyword targets: compose free GSC rows with the once-only paid run"
```

---

### Task 7: The table component

**Files:**

- Create: `src/client/features/trends/KeywordTargetsTable.tsx`

**Interfaces:**

- Consumes: `KeywordTargetRow`, `AppDataTable`/`useAppTable` (`src/client/components/table/AppDataTable`), `ExternalUrlCell`, `DifficultyBadge`, `momentumLabel`, `opportunityActionLabel`
- Produces: `<KeywordTargetsTable rows={KeywordTargetRow[]} domain={string} />`

- [ ] **Step 1: Read the table this one mirrors**

Read `src/client/features/domain/components/DomainKeywordsTable.tsx` in full. Reuse its idioms — `createColumnHelper`, `useAppTable`, `AppDataTable`, `ExternalUrlCell`, `DifficultyBadge`. Do not introduce a second table library or hand-roll `<table>`.

- [ ] **Step 2: Write the component**

Create `src/client/features/trends/KeywordTargetsTable.tsx`:

```tsx
import { memo, useMemo } from "react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import {
  AppDataTable,
  useAppTable,
} from "@/client/components/table/AppDataTable";
import { ExternalUrlCell } from "@/client/components/table/url";
import { DifficultyBadge } from "@/client/features/domain/components/DifficultyBadge";
import { formatNumber } from "@/client/features/domain/utils";
import { momentumLabel } from "./queryMomentum";
import { opportunityActionLabel } from "./opportunityActions";
import type { KeywordTargetRow } from "./mergeKeywordRows";

const columnHelper = createColumnHelper<KeywordTargetRow>();

/**
 * The Rank cell.
 *
 * Shows the live SERP position when Labs has one, and otherwise Search
 * Console's average with a visible `avg` marker. The marker is not decoration:
 * a GSC average is a property-level mean across every impression and names no
 * URL, so presenting it bare as "you rank #7" is a claim we cannot support.
 * There is deliberately no arithmetic between the two numbers anywhere.
 */
function RankCell({ row }: { row: KeywordTargetRow }) {
  if (row.serpRank != null) {
    return <span className="tabular-nums">{row.serpRank}</span>;
  }
  if (row.gscAveragePosition != null) {
    return (
      <span
        className="tabular-nums text-base-content/70"
        title="Search Console's average position for this query across your whole site. It is an average across every impression and does not name a single page, so it is not a SERP rank."
      >
        {Math.round(row.gscAveragePosition)}
        <span className="ml-1 text-xs text-base-content/50">avg</span>
      </span>
    );
  }
  return <span className="text-base-content/40">—</span>;
}

function KeywordTargetsTableComponent({
  rows,
  domain,
}: {
  rows: KeywordTargetRow[];
  domain: string;
}) {
  const columns = useMemo<ColumnDef<KeywordTargetRow>[]>(
    () => [
      columnHelper.accessor("keyword", {
        header: () => "Keyword",
        cell: ({ getValue }) => (
          <span className="font-medium">{getValue()}</span>
        ),
      }),
      columnHelper.display({
        id: "rank",
        header: () => "Rank",
        cell: ({ row }) => <RankCell row={row.original} />,
      }),
      columnHelper.accessor("searchVolume", {
        header: () => "Volume",
        cell: ({ getValue }) => formatNumber(getValue()),
      }),
      columnHelper.accessor("keywordDifficulty", {
        header: () => "KD",
        cell: ({ getValue }) => <DifficultyBadge value={getValue()} />,
      }),
      columnHelper.display({
        id: "trend",
        header: () => "Trend",
        cell: ({ row }) =>
          row.original.momentum ? (
            <span className="text-sm">
              {momentumLabel(row.original.momentum)}
            </span>
          ) : (
            // Blank, not zero: Search Console has nothing to say about a
            // keyword this site gets no impressions for.
            <span className="text-base-content/40">—</span>
          ),
      }),
      columnHelper.display({
        id: "url",
        header: () => "Your URL",
        cell: ({ row }) => (
          <ExternalUrlCell
            value={row.original.url}
            label={row.original.url ?? ""}
            baseDomain={domain}
          />
        ),
        meta: { cellClassName: "max-w-[240px] truncate" },
      }),
      columnHelper.display({
        id: "action",
        header: () => "Action",
        cell: ({ row }) =>
          row.original.action ? (
            <span className="text-sm">
              {opportunityActionLabel(row.original.action)}
            </span>
          ) : (
            <span className="text-base-content/40">—</span>
          ),
      }),
    ],
    [domain],
  );

  const table = useAppTable({
    data: rows,
    columns,
    getRowId: (row) => row.keyword,
  });

  return (
    <div className="overflow-x-auto">
      <AppDataTable
        table={table}
        className="table table-sm"
        wrapperClassName=""
        empty={
          <div className="py-6 text-center text-base-content/60">
            No keywords yet.
          </div>
        }
      />
    </div>
  );
}

export const KeywordTargetsTable = memo(KeywordTargetsTableComponent);
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm tsc --noEmit`
Expected: clean. If `useAppTable` requires options this call omits, read its signature in `src/client/components/table/AppDataTable.tsx` and supply them — do not cast.

- [ ] **Step 4: Commit**

```bash
git add src/client/features/trends/KeywordTargetsTable.tsx
git commit -m "Keyword targets: table that labels which rank number it is showing"
```

---

### Task 8: The card, its states and the scope line

**Files:**

- Create: `src/client/features/trends/KeywordTargetsCard.tsx`

**Interfaces:**

- Consumes: `useKeywordTargets`, `KeywordTargetsTable`, `useProjectDomain`, `Button`, `Banner`, `Loader` from `@cloudflare/kumo/components/*`
- Produces: `<KeywordTargetsCard projectId={string} hasCredits={boolean} />`

- [ ] **Step 1: Write the component**

Create `src/client/features/trends/KeywordTargetsCard.tsx`:

```tsx
import { TrendingUp } from "lucide-react";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import { Loader } from "@cloudflare/kumo/components/loader";
import { useProjectDomain } from "@/client/hooks/useProjectDomain";
import { useKeywordTargets } from "./useKeywordTargets";
import { KeywordTargetsTable } from "./KeywordTargetsTable";

/**
 * The tab's primary surface: the keywords themselves.
 *
 * Every state below renders SOMETHING. The Search Console half is free and
 * present on every mount once connected, so a paid failure degrades the table
 * rather than blanking the page -- which is what the old card did when its
 * single source came back thin.
 */
export function KeywordTargetsCard({
  projectId,
  hasCredits,
}: {
  projectId: string;
  hasCredits: boolean;
}) {
  const domain = useProjectDomain(projectId);
  const targets = useKeywordTargets(projectId, hasCredits);

  return (
    <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-3 p-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="size-4 text-base-content/50" />
              Keywords to target
            </h2>
            {/* Location lives here, once, rather than as a column repeating
                the same value on every row: the ranked-keywords call takes a
                single location_code per request, and the Search Console call
                has no country dimension at all. */}
            <p className="text-sm text-base-content/60">
              {targets.geo
                ? `Rankings in ${targets.geo.label}`
                : "Rankings for your site"}
              {targets.fetchedAt
                ? ` · fetched ${new Date(targets.fetchedAt).toLocaleDateString()}`
                : null}
            </p>
          </div>
          {targets.paidState === "ok" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={targets.runAgain}
              disabled={targets.isRunningPaid}
            >
              Refresh
            </Button>
          ) : null}
        </div>

        {targets.paidState === "failed" ? (
          <Banner variant="error" className="text-sm">
            Couldn’t load ranking data for {domain ?? "your site"}.
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-2"
              onClick={targets.runAgain}
            >
              Try again
            </Button>
          </Banner>
        ) : null}

        {targets.paidState === "expired" ? (
          <Banner variant="warning" className="text-sm">
            Your saved keyword list is no longer available.
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-2"
              onClick={targets.runAgain}
            >
              Refresh it
            </Button>
          </Banner>
        ) : null}

        {targets.paidState === "no-credits" ? (
          <Banner variant="info" className="text-sm">
            Ranking data needs credits. The keywords below come from Search
            Console, which is free.
          </Banner>
        ) : null}

        {targets.isLoadingFree ? (
          <div className="flex items-center justify-center py-12">
            <Loader />
          </div>
        ) : (
          <KeywordTargetsTable rows={targets.rows} domain={domain ?? ""} />
        )}

        {targets.isRunningPaid ? (
          <p className="text-sm text-base-content/60">
            Loading ranking data for {domain}…
          </p>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm tsc --noEmit`
Expected: clean. If `Banner` has no `warning` variant in this Kumo version, check `@cloudflare/kumo/components/banner` and use the nearest one it does ship.

- [ ] **Step 3: Commit**

```bash
git add src/client/features/trends/KeywordTargetsCard.tsx
git commit -m "Keyword targets: card states, and location as a scope line"
```

---

### Task 9: Wire it into the page

**Files:**

- Modify: `src/client/features/trends/TrendsPage.tsx:386` (swap the card), `:388-453` (move the form below the results)

**Interfaces:**

- Consumes: `KeywordTargetsCard`

- [ ] **Step 1: Replace the card**

In `src/client/features/trends/TrendsPage.tsx`, replace the `<TrendingOpportunitiesCard projectId={projectId} />` line at `:386` with:

```tsx
<KeywordTargetsCard projectId={projectId} hasCredits={hasCredits} />
```

Update the import at `:35` from `TrendingOpportunitiesCard` to `KeywordTargetsCard`.

`hasCredits` must come from wherever the app already exposes usage-credit availability to the client. Find it with `grep -rn "hasCredits\|creditsRemaining\|usageCredits" src/client/` and use that existing source. If no client-side source exists, pass `true` and let the server's own `assertUsageCreditsAvailable` reject — but say so in the PR, because it means the "no-credits" state renders only after a failed attempt.

- [ ] **Step 2: Move the Compare form below the results**

The form block currently sits at `:388-453`, above the chart. Move that entire `<div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">…</div>` wrapper so it renders _after_ the chart card that ends at `:522`. The tab now leads with the keyword table; the five-keyword comparison is a secondary tool.

Do not change the form's behaviour, its handler, or the chart. This is a reorder only.

- [ ] **Step 3: Delete the now-unused card if nothing else imports it**

Run: `grep -rn "TrendingOpportunitiesCard" src/`

If the only hit is its own definition, delete `src/client/features/trends/TrendingOpportunitiesCard.tsx`. **Keep** `opportunityActions.ts`, `queryMomentum.ts` and `useTrendingOpportunities.ts` — the new table depends on all three.

- [ ] **Step 4: Run the full check**

Run: `pnpm ci:check`
Expected: PASS. Fix anything it reports before committing.

- [ ] **Step 5: Commit**

```bash
git add src/client/features/trends/
git commit -m "Keyword Trends: lead with the keywords, move Compare below"
```

---

### Task 10: Verify no sibling self-fetches, then verify in the browser

**Files:** none created; this task is verification and whatever it forces.

- [ ] **Step 1: Audit the rendered subtree for metered queries**

Run: `grep -rn "useQuery\|useMeteredQuery\|useMutation" src/client/features/trends/ src/client/features/geo/ src/client/features/insights/`

For every hit, confirm it cannot reach a paid provider merely because the table populated a domain or a keyword list. This codebase has leaked money by exactly this route before — sibling components self-fetching metered data as soon as they observe a non-empty target — and this change puts a domain plus 100 keywords into scope on mount, a larger surface than this tab has ever had.

Write the findings into the PR description. "I checked" is not a finding; name each hook and why it is safe.

- [ ] **Step 2: Seed local state instead of paying**

Seed a `keyword_discovery` run into local D1 and its payload into local R2 so the restore path can be exercised without a live call. Follow the seeding recipe already used for charts and restored runs in this repo rather than inventing one.

- [ ] **Step 3: Verify the states in a browser**

Start the dev server (port 3001, `AUTH_MODE=local_noauth`, no sign-in needed) and confirm, with the network panel open:

1. **Restored run** — table renders, scope line shows the run's own location, **zero** outbound DataForSEO calls.
2. **Refresh click** — exactly one call.
3. **Reload after the refresh** — **zero** calls. This is the single most important check in the plan: it is the difference between "runs once" and "bills on every visit".
4. **Failed attempt** — force a failure, reload, confirm **zero** automatic retries and a visible "Try again".
5. **GSC-only project** — table still renders free rows.

- [ ] **Step 4: Capture evidence**

Screenshot the populated table and the network panel for check 3. Both go in the PR.

- [ ] **Step 5: Commit any fixes**

```bash
git add -u src/
git commit -m "Keyword targets: fixes from auto-spend audit and browser verification"
```

---

## Self-Review

**Spec coverage.** Part A → Tasks 2, 7, 9. Part B → Tasks 1, 3, 4, 5, 6. Part C → Task 9 Step 2. Location-as-scope-line → Tasks 6, 8. States table → Task 8. Rank-never-blended → Tasks 2, 7. Failure recording → Tasks 1, 4. `expired` must not auto-run → Task 3. Sibling self-fetch check → Task 10. Retention assumption → surfaced in Task 3's test name and Task 8's expired banner.

**Known deviations from the spec, deliberate:**

- The spec named the merge file `mergeKeywordRows` and the guard `shouldAutoRunDiscovery`; both kept. The hook is `useKeywordTargets`, not named in the spec.
- The spec left the default sort unstated. This plan fixes it as volume-desc-nulls-last and documents why in the code.

**Open item carried from the spec, not resolved here:** whether to skip the auto-run for projects whose GSC already returns plenty of rows. Not implemented. `shouldAutoRunDiscovery` is the single place it would go, and it takes a flat input object, so adding a `freeRowCount` condition later is a one-line change plus a test.

**Unverified assumption restated:** whether the `analysis-runs/` R2 prefix carries a 90-day lifecycle rule is not knowable from this repo. If it does, the `expired` path in Task 8 is reached in normal operation, not just after data loss. It is handled either way.
