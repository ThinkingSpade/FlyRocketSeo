# Smart Autofill and Per-Tab Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give nine project tabs project-aware autofill and a plain-English "what this means and what to do" block, both computed from data the app already holds.

**Architecture:** A shared client module, `src/client/features/insights/`, holds pure ranking and verdict functions plus two UI primitives. Each tab supplies a small adapter. All inputs come from five react-query keys the app already populates, so the layer adds no network requests and cannot trigger a metered call. One server function powers an opt-in AI rewrite of the verdict.

**Tech Stack:** TypeScript, React 19, TanStack Start + Router + Query, Vitest, Tailwind + daisyUI, Cloudflare Workers, Drizzle/D1.

**Spec:** `docs/superpowers/specs/2026-07-27-smart-autofill-and-guidance-design.md`

## Global Constraints

- **Vitest only collects `src/**/\*.test.ts`** — note the `.ts`, not `.tsx`— and runs in`environment: "node"`. Pure model files get unit tests; React components get none. Do not add jsdom or change `vitest.config.ts`.
- **`pnpm ci:check` runs `prettier --check . && knip && tsc --noEmit && oxlint . --type-aware`.** All four must pass.
- **knip fails the build on unused exports.** Export a symbol only when another module imports it. Keep helpers module-private until a consumer exists.
- **No automatic spend.** Prefilling a field must never start a fetch. Before wiring prefill into a tab, grep that tab's subtree for `useQuery` and confirm nothing self-fetches off a non-empty target.
- **Icon rule:** bare muted lucide glyphs (`text-base-content/45`), no chip backgrounds. Follow `InsightTile.tsx`.
- **Never put store add-callbacks in `useEffect` dependency arrays** — this caused an infinite render loop previously.
- **Every verdict sentence must be defensible from data passed in.** No invented numbers. Thin data returns `tone: "unknown"` with an honest read.
- Package manager is **pnpm**. Run commands from the repo root.

---

## File Structure

**Created:**

| File                                                        | Responsibility                                                                         |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/client/features/insights/types.ts`                     | Shared types: `SeedSuggestion`, `SuggestionIntent`, `Verdict`, `Action`, `FreeSignals` |
| `src/client/features/insights/suggestionModel.ts`           | Pure: `(FreeSignals, SuggestionIntent) => SeedSuggestion[]`                            |
| `src/client/features/insights/suggestionModel.test.ts`      | Unit tests for all five intents                                                        |
| `src/client/features/insights/handoffStore.ts`              | sessionStorage cross-tab carry, `useSyncExternalStore`                                 |
| `src/client/features/insights/handoffStore.test.ts`         | TTL, project scoping, corrupt storage                                                  |
| `src/client/features/insights/resolvePrefill.ts`            | Pure: six-level precedence chain                                                       |
| `src/client/features/insights/resolvePrefill.test.ts`       | Precedence with sources present/absent                                                 |
| `src/client/features/insights/useProjectSuggestions.ts`     | Hook: assembles free signals, calls the model                                          |
| `src/client/features/insights/SuggestionChips.tsx`          | UI: chips with justifying numbers                                                      |
| `src/client/features/insights/NextStepsCard.tsx`            | UI: verdict line + ranked actions                                                      |
| `src/client/features/insights/verdicts/serp.ts`             | SERP verdict + row notes                                                               |
| `src/client/features/insights/verdicts/serp.test.ts`        |                                                                                        |
| `src/client/features/insights/verdicts/backlinks.ts`        | Backlinks verdict + row notes                                                          |
| `src/client/features/insights/verdicts/backlinks.test.ts`   |                                                                                        |
| `src/client/features/insights/verdicts/audit.ts`            | Site Audit verdict + row notes                                                         |
| `src/client/features/insights/verdicts/audit.test.ts`       |                                                                                        |
| `src/client/features/insights/verdicts/competitors.ts`      | Competitors verdict + row notes                                                        |
| `src/client/features/insights/verdicts/competitors.test.ts` |                                                                                        |
| `src/client/features/insights/verdicts/keywords.ts`         | Keyword Research + Trends verdicts                                                     |
| `src/client/features/insights/verdicts/keywords.test.ts`    |                                                                                        |
| `src/client/features/insights/verdicts/content.ts`          | Content Optimizer + Topic Clusters verdicts                                            |
| `src/client/features/insights/verdicts/content.test.ts`     |                                                                                        |
| `src/client/features/insights/verdicts/domain.ts`           | Domain Overview verdict                                                                |
| `src/client/features/insights/verdicts/domain.test.ts`      |                                                                                        |
| `src/client/features/insights/ExplainButton.tsx`            | Opt-in AI button                                                                       |
| `src/server/features/insights/services/ExplainService.ts`   | OpenRouter call, key gating                                                            |
| `src/serverFunctions/insights.ts`                           | `explainFindings` server function                                                      |

**Modified:**

| File                                                   | Change                                              |
| ------------------------------------------------------ | --------------------------------------------------- |
| `src/server/features/projects/services/projects.ts`    | `mapProject` returns `locationCode`, `languageCode` |
| `src/serverFunctions/config.ts`                        | `getClientRuntimeConfig` gains `aiExplainAvailable` |
| `src/client/hooks/useProjectDomain.ts`                 | Add `useProjectMarket`                              |
| `src/client/features/dashboard/AnalyzeProjectCard.tsx` | Use project market, not `2840`                      |
| `src/client/features/dashboard/SeedKeywordField.tsx`   | Re-export from `SuggestionChips`, drop duplication  |
| Nine tab pages                                         | Wire prefill + `NextStepsCard` (one task each)      |

---

## Phase 1 — Plumbing

### Task 1: Expose the project's market

**Files:**

- Modify: `src/server/features/projects/services/projects.ts:10-22`
- Modify: `src/server/features/projects/repositories/ProjectRepository.ts` (only if its select list is explicit)
- Test: `src/server/features/projects/services/projects.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `mapProject` output gains `locationCode: number` and `languageCode: string`. Every consumer of `getProjects()` can read them.

- [ ] **Step 1: Read the repository to confirm the row already carries both fields**

Run: `grep -n "select\|columns\|findMany\|from(projects)" src/server/features/projects/repositories/ProjectRepository.ts`

If the query selects explicit columns, add `locationCode` and `languageCode` to that list. If it selects the whole row (`db.select().from(projects)`), no repository change is needed.

- [ ] **Step 2: Write the failing test**

Add to `src/server/features/projects/services/projects.test.ts`, inside the existing `describe("listProjectsEnsuringOne")` block's file (place it in whichever describe matches the existing style):

```ts
it("exposes the project's configured market", async () => {
  // Follow the mocking style already used at the top of this file for
  // ProjectRepository — read it first and match it exactly.
  const { listProjects } = await import("./projects");

  await expect(listProjects("org_1")).resolves.toEqual([
    expect.objectContaining({
      id: "p_1",
      locationCode: 2826,
      languageCode: "en",
    }),
  ]);
});
```

Update the existing repository mock in that file so its fixture row includes `locationCode: 2826, languageCode: "en"`.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run src/server/features/projects/services/projects.test.ts`
Expected: FAIL — received object lacks `locationCode`.

- [ ] **Step 4: Add the fields to `mapProject`**

```ts
function mapProject(project: {
  id: string;
  name: string;
  domain: string | null;
  locationCode: number;
  languageCode: string;
  createdAt: string;
}) {
  return {
    id: project.id,
    name: project.name,
    domain: project.domain,
    // Set during onboarding. Tabs default their location/language selects to
    // this instead of hardcoding US/en.
    locationCode: project.locationCode,
    languageCode: project.languageCode,
    createdAt: project.createdAt,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run src/server/features/projects/services/projects.test.ts`
Expected: PASS

- [ ] **Step 6: Confirm nothing else broke**

Run: `pnpm vitest run && pnpm tsc --noEmit`
Expected: all green. If a caller destructures `mapProject`'s return with an exact type, widen it.

- [ ] **Step 7: Commit**

```bash
git add src/server/features/projects src/client
git commit -m "Expose project locationCode and languageCode to the client

Onboarding asks which market a project targets and stores it, but
mapProject dropped both fields, so every tab fell back to hardcoded
US/2840. Nothing could prefill the market the user actually chose."
```

---

### Task 2: Read the project's market in the client

**Files:**

- Modify: `src/client/hooks/useProjectDomain.ts`
- Modify: `src/client/features/dashboard/AnalyzeProjectCard.tsx:49,169`

**Interfaces:**

- Consumes: `mapProject` output from Task 1.
- Produces: `useProjectMarket(projectId): { locationCode: number; languageCode: string }`. Falls back to `{ locationCode: 2840, languageCode: "en" }` while `["projects"]` is still loading.

- [ ] **Step 1: Add the hook**

Append to `src/client/hooks/useProjectDomain.ts`:

```ts
/** The US default every call site used before the project's own market was
 *  reachable. Still the fallback while `["projects"]` is in flight. */
const DEFAULT_MARKET = { locationCode: 2840, languageCode: "en" } as const;

/**
 * The project's configured market, for tabs whose location/language selects
 * should default to what onboarding asked for rather than to the US.
 * Shares the `["projects"]` cache entry, so it costs nothing extra.
 */
export function useProjectMarket(projectId: string): {
  locationCode: number;
  languageCode: string;
} {
  const project = useProject(projectId);
  if (!project) return DEFAULT_MARKET;
  return {
    locationCode: project.locationCode,
    languageCode: project.languageCode,
  };
}
```

- [ ] **Step 2: Use it in `AnalyzeProjectCard`**

In `src/client/features/dashboard/AnalyzeProjectCard.tsx`, delete the module constant:

```ts
const DEFAULT_LOCATION_CODE = 2840;
```

The `ANALYSES` array is a module constant, so it cannot read a hook. Change the `Analysis.run` signature to take the market, and thread it through:

```ts
type AnalysisMarket = { locationCode: number; languageCode: string };

type Analysis = {
  key: string;
  label: string;
  detail: string;
  /** Measured cost, or null when we have no profiled figure to quote. */
  estimateUsd: number | null;
  /** True when the analysis needs a seed keyword rather than just the domain. */
  needsKeyword?: boolean;
  run: (
    projectId: string,
    domain: string,
    keyword: string,
    market: AnalysisMarket,
  ) => Promise<unknown>;
};
```

Then update the three entries that hardcode a market. `domain_overview`:

```ts
run: (projectId, domain, _keyword, market) =>
  getDomainOverview({
    data: {
      projectId,
      domain,
      includeSubdomains: true,
      locationCode: market.locationCode,
      languageCode: market.languageCode,
    },
  }),
```

`keyword_trends`:

```ts
run: (projectId, _domain, keyword, market) =>
  getKeywordTrends({
    data: {
      projectId,
      keywords: [keyword],
      languageCode: market.languageCode,
      locationCode: market.locationCode,
    },
  }),
```

Every other entry gains an unused fourth parameter it simply ignores — leave their bodies alone.

- [ ] **Step 3: Pass the market at the call site**

Inside `AnalyzeProjectCard`, next to the existing `useSeedSuggestions` call:

```ts
const market = useProjectMarket(projectId);
```

And in `runSelected`, change the invocation:

```ts
await analysis.run(projectId, activeDomain, keyword, market);
```

- [ ] **Step 4: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: clean. `oxlint` may flag unused `_keyword` parameters — the leading underscore is the convention already used in this file, so it should pass.

- [ ] **Step 5: Commit**

```bash
git add src/client/hooks/useProjectDomain.ts src/client/features/dashboard/AnalyzeProjectCard.tsx
git commit -m "Run project analyses in the project's own market

AnalyzeProjectCard hardcoded location 2840 and language en, so a project
onboarded for the UK ran every analysis against US data."
```

---

## Phase 2 — The suggestion engine

### Task 3: Shared types

**Files:**

- Create: `src/client/features/insights/types.ts`

**Interfaces:**

- Produces: `SeedSuggestion`, `SuggestionIntent`, `FreeSignals`, `Verdict`, `VerdictTone`, `Action`. Every later task imports from here.

- [ ] **Step 1: Write the file**

```ts
import type { LinkOptions } from "@tanstack/react-router";

/**
 * Shared vocabulary for the insights layer.
 *
 * Everything here is computed from data the app has already fetched. No type
 * in this file may carry a value that required a metered call to obtain.
 */

/** A prefill candidate, always carrying the number that justifies it. */
export type SeedSuggestion = {
  /** The keyword, domain, or URL to put in the field. */
  value: string;
  /** "pos 7 · 2.4k impr" — shown beside the value, never omitted. */
  hint: string;
  /** Higher sorts first. Units differ per intent; only order matters. */
  weight: number;
};

export type SuggestionIntent =
  | "striking-distance"
  | "under-clicked"
  | "high-volume"
  | "topic-gap"
  | "own-pages";

/** Search Console query×page row, as returned by getSearchPerformanceReport. */
export type GscQueryPage = {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscQueryTotal = {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
};

export type GscStrikingDistance = {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  position: number;
};

export type GscCtrOpportunity = GscQueryPage & { missedClicks: number };

export type SavedKeyword = {
  keyword: string;
  searchVolume: number | null;
};

/**
 * Everything the suggestion model is allowed to read. Adding a field here is
 * a design change: each one must come from a source that is free and already
 * cached. See the spec's free-data contract.
 */
export type FreeSignals = {
  queryTotals: GscQueryTotal[];
  queryPages: GscQueryPage[];
  strikingDistance: GscStrikingDistance[];
  ctrOpportunities: GscCtrOpportunity[];
  savedKeywords: SavedKeyword[];
};

export type VerdictTone = "good" | "mixed" | "bad" | "unknown";

export type Action = {
  /** Imperative and specific. "Rewrite the title on /coffee-water". */
  label: string;
  /** The number that justifies it. "1,240 impressions at 0.4% CTR". */
  evidence: string;
  /** Where the work happens, as typed router link options. */
  to?: LinkOptions;
  /** Ranked by this, descending. Clicks where derivable, else a fixed tier. */
  weight: number;
};

export type Verdict = {
  /** One sentence stating what the data says. Not advice. */
  read: string;
  tone: VerdictTone;
  actions: Action[];
};

/** The empty verdict, for results too thin to interpret honestly. */
export function unknownVerdict(read: string): Verdict {
  return { read, tone: "unknown", actions: [] };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm tsc --noEmit`
Expected: clean. knip will flag these exports as unused until Task 4 imports them — that is expected and is why this task does not run `ci:check`.

- [ ] **Step 3: Commit**

```bash
git add src/client/features/insights/types.ts
git commit -m "Add shared types for the insights layer"
```

---

### Task 4: The suggestion model

**Files:**

- Create: `src/client/features/insights/suggestionModel.ts`
- Test: `src/client/features/insights/suggestionModel.test.ts`

**Interfaces:**

- Consumes: `FreeSignals`, `SeedSuggestion`, `SuggestionIntent` from `./types`.
- Produces: `buildSuggestions(signals: FreeSignals, intent: SuggestionIntent, limit?: number): SeedSuggestion[]` and `compactNumber(value: number): string`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { buildSuggestions, compactNumber } from "./suggestionModel";
import type { FreeSignals } from "./types";

const EMPTY: FreeSignals = {
  queryTotals: [],
  queryPages: [],
  strikingDistance: [],
  ctrOpportunities: [],
  savedKeywords: [],
};

describe("compactNumber", () => {
  it("abbreviates thousands", () => {
    expect(compactNumber(2400)).toBe("2.4k");
  });

  it("rounds small numbers whole", () => {
    expect(compactNumber(7.4)).toBe("7");
  });
});

describe("buildSuggestions", () => {
  it("returns nothing when there is no data", () => {
    expect(buildSuggestions(EMPTY, "striking-distance")).toEqual([]);
  });

  describe("striking-distance", () => {
    it("keeps only positions 4-20, ranked by impressions", () => {
      const signals: FreeSignals = {
        ...EMPTY,
        strikingDistance: [
          { query: "top", page: "/a", clicks: 0, impressions: 50, position: 2 },
          {
            query: "mid",
            page: "/b",
            clicks: 0,
            impressions: 900,
            position: 7,
          },
          {
            query: "far",
            page: "/c",
            clicks: 0,
            impressions: 80,
            position: 40,
          },
          {
            query: "low",
            page: "/d",
            clicks: 0,
            impressions: 120,
            position: 12,
          },
        ],
      };

      expect(buildSuggestions(signals, "striking-distance")).toEqual([
        { value: "mid", hint: "pos 7 · 900 impr", weight: 900 },
        { value: "low", hint: "pos 12 · 120 impr", weight: 120 },
      ]);
    });
  });

  describe("under-clicked", () => {
    it("ranks by missed clicks", () => {
      const signals: FreeSignals = {
        ...EMPTY,
        ctrOpportunities: [
          {
            query: "small",
            page: "/a",
            clicks: 1,
            impressions: 300,
            ctr: 0.003,
            position: 4,
            missedClicks: 9,
          },
          {
            query: "big",
            page: "/b",
            clicks: 2,
            impressions: 1240,
            ctr: 0.004,
            position: 3,
            missedClicks: 40,
          },
        ],
      };

      expect(buildSuggestions(signals, "under-clicked")).toEqual([
        { value: "big", hint: "40 clicks missed · pos 3", weight: 40 },
        { value: "small", hint: "9 clicks missed · pos 4", weight: 9 },
      ]);
    });
  });

  describe("high-volume", () => {
    it("prefers saved keywords with volume", () => {
      const signals: FreeSignals = {
        ...EMPTY,
        savedKeywords: [
          { keyword: "cheap", searchVolume: 100 },
          { keyword: "rich", searchVolume: 5400 },
        ],
      };

      expect(buildSuggestions(signals, "high-volume")).toEqual([
        { value: "rich", hint: "5.4k/mo saved", weight: 5400 },
        { value: "cheap", hint: "100/mo saved", weight: 100 },
      ]);
    });

    it("falls back to Search Console impressions when nothing is saved", () => {
      const signals: FreeSignals = {
        ...EMPTY,
        queryTotals: [
          { query: "seen", clicks: 3, impressions: 800, position: 9 },
        ],
      };

      expect(buildSuggestions(signals, "high-volume")).toEqual([
        { value: "seen", hint: "800 impr · pos 9", weight: 800 },
      ]);
    });

    it("ignores saved keywords with no volume when Search Console has data", () => {
      const signals: FreeSignals = {
        ...EMPTY,
        savedKeywords: [{ keyword: "unknown", searchVolume: null }],
        queryTotals: [
          { query: "seen", clicks: 3, impressions: 800, position: 9 },
        ],
      };

      expect(buildSuggestions(signals, "high-volume")).toEqual([
        { value: "seen", hint: "800 impr · pos 9", weight: 800 },
      ]);
    });
  });

  describe("topic-gap", () => {
    it("surfaces queries with impressions whose best page ranks past the first page", () => {
      const signals: FreeSignals = {
        ...EMPTY,
        queryTotals: [
          { query: "owned", clicks: 40, impressions: 900, position: 3 },
          { query: "gap", clicks: 0, impressions: 700, position: 34 },
          { query: "noise", clicks: 0, impressions: 4, position: 60 },
        ],
      };

      expect(buildSuggestions(signals, "topic-gap")).toEqual([
        { value: "gap", hint: "700 impr · best page ranks #34", weight: 700 },
      ]);
    });
  });

  describe("own-pages", () => {
    it("ranks distinct pages by clicks", () => {
      const signals: FreeSignals = {
        ...EMPTY,
        queryPages: [
          {
            query: "a",
            page: "/one",
            clicks: 10,
            impressions: 100,
            ctr: 0.1,
            position: 3,
          },
          {
            query: "b",
            page: "/one",
            clicks: 5,
            impressions: 60,
            ctr: 0.08,
            position: 4,
          },
          {
            query: "c",
            page: "/two",
            clicks: 30,
            impressions: 400,
            ctr: 0.07,
            position: 2,
          },
        ],
      };

      expect(buildSuggestions(signals, "own-pages")).toEqual([
        { value: "/two", hint: "30 clicks", weight: 30 },
        { value: "/one", hint: "15 clicks", weight: 15 },
      ]);
    });
  });

  it("honours the limit", () => {
    const signals: FreeSignals = {
      ...EMPTY,
      savedKeywords: [
        { keyword: "a", searchVolume: 5 },
        { keyword: "b", searchVolume: 4 },
        { keyword: "c", searchVolume: 3 },
      ],
    };

    expect(buildSuggestions(signals, "high-volume", 2)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/client/features/insights/suggestionModel.test.ts`
Expected: FAIL — cannot find module `./suggestionModel`.

- [ ] **Step 3: Write the implementation**

```ts
import type { FreeSignals, SeedSuggestion, SuggestionIntent } from "./types";

/**
 * Ranks prefill candidates from data the app already holds.
 *
 * Every input arrives via `FreeSignals`, whose sources are all free and all
 * already cached — so nothing here can cost money or add a request. The model
 * is pure so the ranking stays unit-testable and the hook above it stays thin.
 *
 * Each intent answers a different question, because the keyword worth
 * prefilling into "should I chase this SERP?" is not the one worth prefilling
 * into "which page should I rewrite?".
 */

const DEFAULT_LIMIT = 5;

/** Below this, a query has too little demand for any advice to be meaningful. */
const MIN_IMPRESSIONS = 10;

// Striking distance: close enough that ranking work pays, far enough that
// there is something to win. Matches the band the Opportunities tab uses.
const STRIKING_MIN_POSITION = 4;
const STRIKING_MAX_POSITION = 20;

/** Past this, the site has no real foothold for the query — it is a gap. */
const TOPIC_GAP_MIN_POSITION = 21;

export function compactNumber(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

function byWeightDesc(a: SeedSuggestion, b: SeedSuggestion): number {
  return b.weight - a.weight;
}

function strikingDistance(signals: FreeSignals): SeedSuggestion[] {
  return signals.strikingDistance
    .filter(
      (row) =>
        row.position >= STRIKING_MIN_POSITION &&
        row.position <= STRIKING_MAX_POSITION &&
        row.impressions >= MIN_IMPRESSIONS,
    )
    .map((row) => ({
      value: row.query,
      hint: `pos ${Math.round(row.position)} · ${compactNumber(row.impressions)} impr`,
      weight: row.impressions,
    }));
}

function underClicked(signals: FreeSignals): SeedSuggestion[] {
  return signals.ctrOpportunities
    .filter((row) => row.impressions >= MIN_IMPRESSIONS)
    .map((row) => ({
      value: row.query,
      hint: `${compactNumber(row.missedClicks)} clicks missed · pos ${Math.round(row.position)}`,
      weight: row.missedClicks,
    }));
}

function highVolume(signals: FreeSignals): SeedSuggestion[] {
  // Saved keywords carry real search volume, which is a better signal than
  // impressions; they only lose when the user has saved nothing with a volume.
  const saved = signals.savedKeywords
    .filter((row) => row.searchVolume != null && row.searchVolume > 0)
    .map((row) => ({
      value: row.keyword,
      hint: `${compactNumber(row.searchVolume ?? 0)}/mo saved`,
      weight: row.searchVolume ?? 0,
    }));
  if (saved.length > 0) return saved;

  return signals.queryTotals
    .filter((row) => row.impressions >= MIN_IMPRESSIONS)
    .map((row) => ({
      value: row.query,
      hint: `${compactNumber(row.impressions)} impr · pos ${Math.round(row.position)}`,
      weight: row.impressions,
    }));
}

function topicGap(signals: FreeSignals): SeedSuggestion[] {
  // Demand exists (impressions) but the site has no page near the top for it —
  // exactly the shape a new hub or cluster is meant to fill.
  return signals.queryTotals
    .filter(
      (row) =>
        row.impressions >= MIN_IMPRESSIONS &&
        row.position >= TOPIC_GAP_MIN_POSITION,
    )
    .map((row) => ({
      value: row.query,
      hint: `${compactNumber(row.impressions)} impr · best page ranks #${Math.round(row.position)}`,
      weight: row.impressions,
    }));
}

function ownPages(signals: FreeSignals): SeedSuggestion[] {
  const clicksByPage = new Map<string, number>();
  for (const row of signals.queryPages) {
    clicksByPage.set(row.page, (clicksByPage.get(row.page) ?? 0) + row.clicks);
  }

  return [...clicksByPage.entries()].map(([page, clicks]) => ({
    value: page,
    hint: `${compactNumber(clicks)} clicks`,
    weight: clicks,
  }));
}

const BUILDERS: Record<
  SuggestionIntent,
  (signals: FreeSignals) => SeedSuggestion[]
> = {
  "striking-distance": strikingDistance,
  "under-clicked": underClicked,
  "high-volume": highVolume,
  "topic-gap": topicGap,
  "own-pages": ownPages,
};

export function buildSuggestions(
  signals: FreeSignals,
  intent: SuggestionIntent,
  limit: number = DEFAULT_LIMIT,
): SeedSuggestion[] {
  return BUILDERS[intent](signals).toSorted(byWeightDesc).slice(0, limit);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/client/features/insights/suggestionModel.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/client/features/insights
git commit -m "Add the insights suggestion model

Five intents over Search Console and saved keywords, because the keyword
worth prefilling into a SERP lookup is not the one worth prefilling into
a content rewrite. Pure and free by construction."
```

---

### Task 5: The cross-tab handoff store

**Files:**

- Create: `src/client/features/insights/handoffStore.ts`
- Test: `src/client/features/insights/handoffStore.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `writeHandoff(projectId, entry)`, `readHandoff(projectId, now?)`, `useHandoff(projectId)`, and type `HandoffEntry = { kind: "keyword" | "domain" | "url"; value: string; locationCode?: number; source: string; at: number }`.

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HANDOFF_TTL_MS, readHandoff, writeHandoff } from "./handoffStore";

// The store is sessionStorage-backed; `environment: "node"` has no DOM, so
// stand up the minimal surface the store actually touches.
class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  clear() {
    this.data.clear();
  }
}

beforeEach(() => {
  const storage = new MemoryStorage();
  vi.stubGlobal("window", {
    sessionStorage: storage,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  });
});

describe("handoffStore", () => {
  it("returns null when nothing was written", () => {
    expect(readHandoff("p1")).toBeNull();
  });

  it("round-trips an entry", () => {
    writeHandoff("p1", {
      kind: "keyword",
      value: "office coffee",
      source: "serp",
      at: 1000,
    });

    expect(readHandoff("p1", 1000)).toEqual({
      kind: "keyword",
      value: "office coffee",
      source: "serp",
      at: 1000,
    });
  });

  it("scopes entries per project", () => {
    writeHandoff("p1", {
      kind: "keyword",
      value: "one",
      source: "serp",
      at: 1000,
    });

    expect(readHandoff("p2", 1000)).toBeNull();
  });

  it("expires an entry past the TTL", () => {
    writeHandoff("p1", {
      kind: "keyword",
      value: "stale",
      source: "serp",
      at: 1000,
    });

    expect(readHandoff("p1", 1000 + HANDOFF_TTL_MS + 1)).toBeNull();
  });

  it("keeps an entry exactly at the TTL boundary", () => {
    writeHandoff("p1", {
      kind: "keyword",
      value: "fresh",
      source: "serp",
      at: 1000,
    });

    expect(readHandoff("p1", 1000 + HANDOFF_TTL_MS)?.value).toBe("fresh");
  });

  it("treats corrupt storage as empty", () => {
    window.sessionStorage.setItem("insights-handoff:p1", "{not json");

    expect(readHandoff("p1")).toBeNull();
  });

  it("ignores an entry missing required fields", () => {
    window.sessionStorage.setItem(
      "insights-handoff:p1",
      JSON.stringify({ kind: "keyword", at: 1000 }),
    );

    expect(readHandoff("p1", 1000)).toBeNull();
  });

  it("rejects an unknown kind", () => {
    window.sessionStorage.setItem(
      "insights-handoff:p1",
      JSON.stringify({ kind: "wat", value: "x", source: "s", at: 1000 }),
    );

    expect(readHandoff("p1", 1000)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/client/features/insights/handoffStore.test.ts`
Expected: FAIL — cannot find module `./handoffStore`.

- [ ] **Step 3: Write the implementation**

Follow the structure of `src/client/features/search-tabs/useSearchTabs.ts` — same sessionStorage + `useSyncExternalStore` + custom-event pattern.

```ts
import { useSyncExternalStore } from "react";

/**
 * Carries the thing you just analyzed into the next tab you open, so moving
 * from a SERP lookup to a content brief does not mean retyping the keyword.
 *
 * sessionStorage rather than a query cache: it must survive a full navigation
 * but must not outlive the browsing session. Structured exactly like
 * `useSearchTabs`, including treating unreadable storage as empty.
 *
 * Writing an entry never causes a fetch. Reading tabs use it only as one level
 * of the prefill precedence chain.
 */

export type HandoffKind = "keyword" | "domain" | "url";

export type HandoffEntry = {
  kind: HandoffKind;
  value: string;
  /** The market the source tab ran in, when it had one. */
  locationCode?: number;
  /** Which tab wrote it, for the "carried from SERP Overview" hint. */
  source: string;
  at: number;
};

/** Long enough to cross a few tabs, short enough that yesterday's keyword
 *  never reappears as though it were a considered default. */
export const HANDOFF_TTL_MS = 30 * 60 * 1000;

const CHANGE_EVENT = "insights-handoff-change";

function storageKey(projectId: string): string {
  return `insights-handoff:${projectId}`;
}

function isKind(value: unknown): value is HandoffKind {
  return value === "keyword" || value === "domain" || value === "url";
}

function parseEntry(raw: unknown): HandoffEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (!isKind(record.kind)) return null;
  if (typeof record.value !== "string" || record.value === "") return null;
  if (typeof record.source !== "string" || record.source === "") return null;
  if (typeof record.at !== "number") return null;
  return {
    kind: record.kind,
    value: record.value,
    locationCode:
      typeof record.locationCode === "number" ? record.locationCode : undefined,
    source: record.source,
    at: record.at,
  };
}

export function readHandoff(
  projectId: string,
  now: number = Date.now(),
): HandoffEntry | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(storageKey(projectId));
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const entry = parseEntry(parsed);
  if (!entry) return null;
  if (now - entry.at > HANDOFF_TTL_MS) return null;
  return entry;
}

export function writeHandoff(projectId: string, entry: HandoffEntry): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(projectId), JSON.stringify(entry));
  } catch {
    // A full or disabled sessionStorage costs us a convenience, nothing more.
    return;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

/**
 * Reactive read for components. The snapshot is re-parsed on each change
 * event; entries are single small objects, so this stays cheap.
 */
export function useHandoff(projectId: string): HandoffEntry | null {
  return useSyncExternalStore(
    subscribe,
    () => readHandoff(projectId),
    () => null,
  );
}
```

**Note on `useSyncExternalStore`:** `readHandoff` allocates a new object each call, which would loop if React compared by identity on every render. It only re-reads on a change event here because the subscribe callback drives it — but if you see an infinite render warning, memoize the snapshot in a module-level cache keyed by projectId, invalidated in `writeHandoff`, exactly as `useSearchTabs` does with `stateCache`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/client/features/insights/handoffStore.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/client/features/insights
git commit -m "Add the cross-tab handoff store

30-minute TTL so a keyword carried from one tab is still there when you
arrive, but yesterday's search never reappears as a considered default."
```

---

### Task 6: The prefill precedence resolver

**Files:**

- Create: `src/client/features/insights/resolvePrefill.ts`
- Test: `src/client/features/insights/resolvePrefill.test.ts`

**Interfaces:**

- Consumes: `HandoffEntry` from `./handoffStore`, `SeedSuggestion` from `./types`.
- Produces: `resolvePrefill(input): { value: string; source: PrefillSource }` where `PrefillSource = "search-param" | "handoff" | "last-run" | "suggestion" | "project" | "none"`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { resolvePrefill } from "./resolvePrefill";

const NOTHING = {
  searchParam: null,
  handoff: null,
  lastRun: null,
  suggestions: [],
  projectDefault: null,
  kind: "keyword" as const,
};

describe("resolvePrefill", () => {
  it("falls through to nothing when every source is empty", () => {
    expect(resolvePrefill(NOTHING)).toEqual({ value: "", source: "none" });
  });

  it("prefers the search param above everything", () => {
    expect(
      resolvePrefill({
        ...NOTHING,
        searchParam: "explicit",
        handoff: { kind: "keyword", value: "carried", source: "serp", at: 1 },
        lastRun: "previous",
        suggestions: [{ value: "suggested", hint: "h", weight: 1 }],
        projectDefault: "project",
      }),
    ).toEqual({ value: "explicit", source: "search-param" });
  });

  it("prefers the handoff over the last run", () => {
    expect(
      resolvePrefill({
        ...NOTHING,
        handoff: { kind: "keyword", value: "carried", source: "serp", at: 1 },
        lastRun: "previous",
      }),
    ).toEqual({ value: "carried", source: "handoff" });
  });

  it("skips a handoff whose kind does not match the field", () => {
    expect(
      resolvePrefill({
        ...NOTHING,
        kind: "keyword",
        handoff: { kind: "domain", value: "example.com", source: "d", at: 1 },
        lastRun: "previous",
      }),
    ).toEqual({ value: "previous", source: "last-run" });
  });

  it("prefers the last run over a suggestion", () => {
    expect(
      resolvePrefill({
        ...NOTHING,
        lastRun: "previous",
        suggestions: [{ value: "suggested", hint: "h", weight: 1 }],
      }),
    ).toEqual({ value: "previous", source: "last-run" });
  });

  it("prefers the top suggestion over the project default", () => {
    expect(
      resolvePrefill({
        ...NOTHING,
        suggestions: [
          { value: "best", hint: "h", weight: 9 },
          { value: "second", hint: "h", weight: 1 },
        ],
        projectDefault: "project",
      }),
    ).toEqual({ value: "best", source: "suggestion" });
  });

  it("uses the project default last", () => {
    expect(
      resolvePrefill({ ...NOTHING, projectDefault: "example.com" }),
    ).toEqual({ value: "example.com", source: "project" });
  });

  it("treats a blank string as absent", () => {
    expect(
      resolvePrefill({
        ...NOTHING,
        searchParam: "   ",
        projectDefault: "example.com",
      }),
    ).toEqual({ value: "example.com", source: "project" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/client/features/insights/resolvePrefill.test.ts`
Expected: FAIL — cannot find module `./resolvePrefill`.

- [ ] **Step 3: Write the implementation**

```ts
import type { HandoffEntry, HandoffKind } from "./handoffStore";
import type { SeedSuggestion } from "./types";

/**
 * Decides what goes in a field when several sources could fill it.
 *
 * Pure and total: every branch returns, and an exhausted chain returns the
 * empty string rather than throwing, because a field with no good default is a
 * normal state, not an error.
 *
 * Resolving a value never triggers a fetch. The caller puts the result in an
 * input; the user still presses the button.
 */

export type PrefillSource =
  | "search-param"
  | "handoff"
  | "last-run"
  | "suggestion"
  | "project"
  | "none";

type ResolveInput = {
  /** Which sort of value this field holds, so a domain never lands in a
   *  keyword box. */
  kind: HandoffKind;
  /** From the URL. Explicit and shareable, so it always wins. */
  searchParam: string | null;
  handoff: HandoffEntry | null;
  /** The input this tab last ran, from analysis_runs. */
  lastRun: string | null;
  /** Ranked, highest first. Only the top one is used as a value. */
  suggestions: SeedSuggestion[];
  /** The project's domain, for domain-shaped fields. */
  projectDefault: string | null;
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolvePrefill(input: ResolveInput): {
  value: string;
  source: PrefillSource;
} {
  const searchParam = clean(input.searchParam);
  if (searchParam) return { value: searchParam, source: "search-param" };

  // A handoff carrying the wrong sort of value is skipped, not an error: the
  // user simply moved between tabs that trade in different things.
  const handoff =
    input.handoff && input.handoff.kind === input.kind
      ? clean(input.handoff.value)
      : null;
  if (handoff) return { value: handoff, source: "handoff" };

  const lastRun = clean(input.lastRun);
  if (lastRun) return { value: lastRun, source: "last-run" };

  const suggestion = clean(input.suggestions[0]?.value);
  if (suggestion) return { value: suggestion, source: "suggestion" };

  const projectDefault = clean(input.projectDefault);
  if (projectDefault) return { value: projectDefault, source: "project" };

  return { value: "", source: "none" };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/client/features/insights/resolvePrefill.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/client/features/insights
git commit -m "Add the prefill precedence resolver

Six levels, first non-empty wins, and a handoff of the wrong kind falls
through rather than dropping a domain into a keyword box."
```

---

### Task 7: The free-signals hook and last-run memory

**Files:**

- Create: `src/client/features/insights/useProjectSuggestions.ts`
- Create: `src/client/features/insights/useLastRunInput.ts`

**Interfaces:**

- Consumes: `buildSuggestions` from `./suggestionModel`, `FreeSignals`/`SeedSuggestion`/`SuggestionIntent` from `./types`.
- Produces: `useProjectSuggestions(projectId: string, intent: SuggestionIntent, limit?: number): SeedSuggestion[]` and `useLastRunInput(projectId: string, feature: string, extract: (result: unknown) => string | null): string | null`.

- [ ] **Step 1: Confirm the exact query keys still match**

Run: `grep -rn '"searchPerformance", projectId, "overview", "last_28_days"' src/client | head -3`
Expected: at least `SeedKeywordField.tsx` and `OpportunitiesPage.tsx`. The key below must match them character for character, or this hook fires a second request instead of reusing the cache.

- [ ] **Step 2: Write the hook**

```ts
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSearchPerformanceReport } from "@/serverFunctions/searchPerformance";
import { getSavedKeywords } from "@/serverFunctions/keywords";
import { buildSuggestions } from "./suggestionModel";
import type { FreeSignals, SeedSuggestion, SuggestionIntent } from "./types";

/**
 * Assembles the free signals and ranks them for one tab's intent.
 *
 * Both queries deliberately reuse the exact keys other cards already populate,
 * so on a warm cache this hook issues no request at all. Every source is
 * first-party (Search Console) or local (D1) — there is no path from here to a
 * metered provider, which is what lets tabs prefill without spending.
 *
 * A failing source degrades to an empty array rather than an error: a missing
 * Search Console connection should cost you suggestions, not the tab.
 */

const EMPTY_SIGNALS: FreeSignals = {
  queryTotals: [],
  queryPages: [],
  strikingDistance: [],
  ctrOpportunities: [],
  savedKeywords: [],
};

export function useProjectSuggestions(
  projectId: string,
  intent: SuggestionIntent,
  limit?: number,
): SeedSuggestion[] {
  const gscQuery = useQuery({
    queryKey: ["searchPerformance", projectId, "overview", "last_28_days"],
    queryFn: () =>
      getSearchPerformanceReport({
        data: { projectId, dateRange: "last_28_days" },
      }),
    staleTime: 5 * 60_000,
  });

  const savedQuery = useQuery({
    queryKey: ["savedKeywords", projectId, "seed-suggestions"],
    queryFn: () => getSavedKeywords({ data: { projectId, pageSize: 50 } }),
    staleTime: 5 * 60_000,
  });

  const report = gscQuery.data;
  const savedRows = savedQuery.data?.rows;

  const signals = useMemo<FreeSignals>(() => {
    const connected = report?.connected === true ? report : null;
    return {
      queryTotals: connected?.queryTotals ?? EMPTY_SIGNALS.queryTotals,
      queryPages: connected?.queryPages ?? EMPTY_SIGNALS.queryPages,
      strikingDistance:
        connected?.strikingDistance ?? EMPTY_SIGNALS.strikingDistance,
      ctrOpportunities:
        connected?.ctrOpportunities ?? EMPTY_SIGNALS.ctrOpportunities,
      savedKeywords: (savedRows ?? []).map((row) => ({
        keyword: row.keyword,
        searchVolume: row.searchVolume ?? null,
      })),
    };
  }, [report, savedRows]);

  return useMemo(
    () => buildSuggestions(signals, intent, limit),
    [signals, intent, limit],
  );
}
```

- [ ] **Step 3: Write the last-run hook**

Create `src/client/features/insights/useLastRunInput.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { restoreLatestRun } from "@/serverFunctions/analysisRuns";

/**
 * The input a tab last ran, so returning to it resumes where you left off.
 *
 * Free by construction: `restoreLatestRun` reads a stored D1 row plus the R2
 * object that run already paid for, which is the same guarantee
 * `useAutoRestoredRun` documents. It can never trigger a metered fetch.
 *
 * The caller supplies `extract` because each feature stores a different result
 * shape and only the tab knows which field was its input. Returning null for an
 * unrecognised shape is correct: prefill falls through to the next level.
 */
export function useLastRunInput(
  projectId: string,
  feature: string,
  extract: (result: unknown) => string | null,
): string | null {
  const query = useQuery({
    queryKey: ["analysisRun", "latest", projectId, feature],
    queryFn: () => restoreLatestRun({ data: { projectId, feature } }),
    staleTime: 60_000,
  });

  const row = query.data;
  if (!row) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.resultJson);
  } catch {
    return null;
  }

  try {
    return extract(parsed);
  } catch {
    // A stored shape that has drifted since it was written is not an error —
    // the tab simply has no last-run value to offer.
    return null;
  }
}
```

Note the query key matches `useAutoRestoredRun`'s exactly, so tabs already
auto-restoring share this cache entry rather than issuing a second read.

- [ ] **Step 4: Verify types line up with the real server functions**

Run: `pnpm tsc --noEmit`
Expected: clean. If `savedQuery.data.rows` has no `searchVolume`, read the real row type with `grep -n "searchVolume" src/server/features/keywords/services/KeywordResearchService.ts` and adjust the mapping — do not cast. Confirm the `["analysisRun", ...]` key ordering against `useAutoRestoredRun.ts:39-41`; if it differs, match that file rather than this one.

- [ ] **Step 5: Commit**

```bash
git add src/client/features/insights/useProjectSuggestions.ts src/client/features/insights/useLastRunInput.ts
git commit -m "Add the free-signals and last-run suggestion hooks

Both reuse query keys other cards already populate, so a warm cache means
zero extra requests and neither can reach a metered provider."
```

---

### Task 8: The suggestion chips component

**Files:**

- Create: `src/client/features/insights/SuggestionChips.tsx`
- Modify: `src/client/features/dashboard/SeedKeywordField.tsx`

**Interfaces:**

- Consumes: `SeedSuggestion` from `./types`.
- Produces: `<SuggestionChips suggestions value onSelect disabled? />`.

- [ ] **Step 1: Write the component**

```tsx
import { Lightbulb } from "lucide-react";
import type { SeedSuggestion } from "./types";

/**
 * Prefill candidates as chips, each showing the number that justifies it.
 *
 * The number is not decoration: a bare list of words asks the user to guess
 * why these and not others. Generalized from the dashboard's seed field so
 * every tab offers suggestions in the same shape.
 */
export function SuggestionChips({
  suggestions,
  value,
  onSelect,
  disabled = false,
}: {
  suggestions: SeedSuggestion[];
  /** The field's current value, so the matching chip reads as selected. */
  value: string;
  onSelect: (next: string) => void;
  disabled?: boolean;
}) {
  if (suggestions.length === 0) return null;

  const current = value.trim().toLowerCase();

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Lightbulb className="size-3.5 shrink-0 text-base-content/40" />
      {suggestions.map((suggestion) => {
        const active = suggestion.value.toLowerCase() === current;
        return (
          <button
            key={suggestion.value}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(suggestion.value)}
            title={suggestion.hint}
            className={`btn btn-xs h-auto min-h-0 gap-1 py-1 font-normal ${
              active ? "btn-primary" : "btn-ghost border border-base-300"
            }`}
          >
            <span className="max-w-[14rem] truncate">{suggestion.value}</span>
            <span
              className={
                active
                  ? "text-primary-content/70"
                  : "text-base-content/45 tabular-nums"
              }
            >
              {suggestion.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Make `SeedKeywordField` use it**

In `src/client/features/dashboard/SeedKeywordField.tsx`, delete the inline chip-rendering block (the `suggestions.length > 0 ? (...) : null` JSX and the now-unused `Lightbulb` import) and render `<SuggestionChips />` in its place. The local `SeedSuggestion` type there has `{ keyword, hint }`; map it:

```tsx
<SuggestionChips
  suggestions={suggestions.map((s) => ({
    value: s.keyword,
    hint: s.hint,
    weight: 0,
  }))}
  value={value}
  disabled={disabled}
  onSelect={onChange}
/>
```

Leave `useSeedSuggestions` itself alone — `AnalyzeProjectCard` still consumes it, and replacing it is out of scope here.

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: clean. Also `pnpm knip` — if `compactNumber` is now unexported-but-unused anywhere, that is fine; it is used by `suggestionModel` internally and exported for its test.

- [ ] **Step 4: Commit**

```bash
git add src/client/features/insights/SuggestionChips.tsx src/client/features/dashboard/SeedKeywordField.tsx
git commit -m "Extract suggestion chips into a shared component"
```

---

## Phase 3 — Autofill wiring

Each task in this phase follows the same shape. **Before editing any tab, run the no-auto-spend check** and paste its output into the commit body:

```bash
grep -rn "useQuery\|useMutation" <the tab's directory>
```

Confirm every hook found is either explicitly `enabled`-gated on a user action, or reads a free/local source. If any hook would fire because a field became non-empty, stop and report it rather than wiring prefill into that tab.

### Task 9: SERP Overview autofill

**Files:**

- Modify: `src/client/features/serp/SerpOverviewPage.tsx:75-76`

**Interfaces:**

- Consumes: `useProjectSuggestions`, `resolvePrefill`, `useHandoff`, `writeHandoff`, `useProjectMarket`, `SuggestionChips`.
- Produces: nothing for later tasks.

- [ ] **Step 1: Run the no-auto-spend check**

Run: `grep -rn "useQuery\|useMutation" src/client/features/serp/`
Expected: the SERP query is gated behind `runInput != null` and a metered-run authorization. Confirm that before continuing.

- [ ] **Step 2: Wire suggestions and prefill**

At the top of the component, beside the existing `useState` calls:

```tsx
const suggestions = useProjectSuggestions(projectId, "striking-distance");
const handoff = useHandoff(projectId);
const market = useProjectMarket(projectId);

// This page already imports RUN_FEATURES for its RecentRunsList; reuse the
// same feature key so both read one cache entry.
const lastRun = useLastRunInput(
  projectId,
  RUN_FEATURES.serpOverview,
  (result) =>
    typeof result === "object" &&
    result !== null &&
    typeof (result as { keyword?: unknown }).keyword === "string"
      ? (result as { keyword: string }).keyword
      : null,
);

// The URL param wins, then a keyword carried from another tab, then what this
// tab last ran, then the striking-distance ranking. Resolved for the field's
// initial value — after that the user owns the input.
const prefill = resolvePrefill({
  kind: "keyword",
  searchParam: query,
  handoff,
  lastRun,
  suggestions,
  projectDefault: null,
});
```

Replace the two `useState` initializers:

```tsx
const [input, setInput] = useState(query);
const [locationInput, setLocationInput] = useState(String(activeLocation));
```

with a deferred-sync pattern, because `suggestions` arrives asynchronously and `useState` only reads its initializer once:

```tsx
const [input, setInput] = useState(query);
const [locationInput, setLocationInput] = useState(String(activeLocation));
const [inputTouched, setInputTouched] = useState(false);

// Suggestions land after first paint, so seed the field when they arrive —
// but never overwrite something the user has typed.
useEffect(() => {
  if (inputTouched) return;
  if (input.trim() !== "") return;
  if (prefill.value === "") return;
  setInput(prefill.value);
}, [inputTouched, input, prefill.value]);
```

Change the input's `onChange` to record the touch:

```tsx
onChange={(event) => {
  setInputTouched(true);
  setInput(event.target.value);
}}
```

Default the location select to the project's market — replace `String(activeLocation)` with `String(activeLocation || market.locationCode)` only if `activeLocation` can be falsy; otherwise read how `activeLocation` is derived and apply the market as its fallback there.

- [ ] **Step 3: Render the chips under the keyword input**

Directly after the keyword `<label>` block, inside the form:

```tsx
<SuggestionChips
  suggestions={suggestions}
  value={input}
  onSelect={(next) => {
    setInputTouched(true);
    setInput(next);
  }}
  disabled={serpQuery.isFetching}
/>
```

- [ ] **Step 4: Write the handoff on a successful run**

Where the form's `onSubmit` sets `runInput` and calls `run.authorize()`, add:

```tsx
writeHandoff(projectId, {
  kind: "keyword",
  value: next,
  locationCode: Number(locationInput),
  source: "SERP Overview",
  at: Date.now(),
});
```

- [ ] **Step 5: Verify**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm vitest run`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/client/features/serp
git commit -m "Prefill SERP Overview from striking-distance keywords

Opens on a keyword you already rank 4-20 for instead of a placeholder
about office coffee. Prefill fills the box only; the metered lookup still
waits for the button.

No-auto-spend check: the SERP query stays gated on runInput plus an
explicit metered-run authorization."
```

---

### Task 10: Content Optimizer autofill

Identical in shape to Task 9, with these substitutions:

- File: `src/client/features/content/ContentOptimizerPage.tsx`
- Intent: `"under-clicked"`
- Handoff `source`: `"Content Optimizer"`
- Placeholder to stop relying on: `"office vending machines dallas"`

- [ ] **Step 1: Run the no-auto-spend check**

Run: `grep -rn "useQuery\|useMutation" src/client/features/content/`

- [ ] **Step 2: Wire suggestions, prefill, chips and handoff**

Apply the same five edits as Task 9 Steps 2–4, reading the file first to find its actual state variable names — they differ from the SERP page's.

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm vitest run`

- [ ] **Step 4: Commit**

```bash
git add src/client/features/content
git commit -m "Prefill Content Optimizer from under-clicked pages"
```

---

### Task 11: Keyword Research, Trends and Topic Clusters autofill

Three tabs, same shape, one commit each.

| Tab              | File                                                        | Intent        | Handoff source       |
| ---------------- | ----------------------------------------------------------- | ------------- | -------------------- |
| Keyword Research | `src/client/features/keywords/page/KeywordResearchPage.tsx` | `high-volume` | `"Keyword Research"` |
| Keyword Trends   | `src/client/features/trends/TrendsPage.tsx`                 | `high-volume` | `"Keyword Trends"`   |
| Topic Clusters   | `src/client/features/topic-clusters/TopicClustersPage.tsx`  | `topic-gap`   | `"Topic Clusters"`   |

- [ ] **Step 1: No-auto-spend check for all three**

Run: `grep -rn "useQuery\|useMutation" src/client/features/keywords/ src/client/features/trends/ src/client/features/topic-clusters/`

- [ ] **Step 2: Wire each tab, verifying and committing between them**

For each: apply Task 9's pattern, run `pnpm tsc --noEmit && pnpm lint`, commit. Trends takes a comma-separated list — join the top three suggestions with `", "` for its prefill rather than using only the first.

- [ ] **Step 3: Final verify**

Run: `pnpm vitest run && pnpm tsc --noEmit`

---

### Task 12: Domain, Backlinks and Competitors autofill

These three already receive `projectDomain` via `AnalyzeDomainPrompt`, so the work is to route them through `resolvePrefill` so a handoff or last run can override, and to default their location selects to the project market.

| Tab             | File                                                  | Kind     | Handoff source      |
| --------------- | ----------------------------------------------------- | -------- | ------------------- |
| Domain Overview | `src/client/features/domain/DomainOverviewPage.tsx`   | `domain` | `"Domain Overview"` |
| Backlinks       | `src/client/features/backlinks/BacklinksPage.tsx`     | `domain` | `"Backlinks"`       |
| Competitors     | `src/client/features/competitors/CompetitorsPage.tsx` | `domain` | `"Competitors"`     |

- [ ] **Step 1: No-auto-spend check**

Run: `grep -rn "useQuery\|useMutation" src/client/features/domain/ src/client/features/backlinks/ src/client/features/competitors/`

**This check matters most here.** The backlinks timeline, the competitor positioning map and the domain competitors card have all previously self-fetched off a non-empty target. If any still does, gate it before touching prefill.

- [ ] **Step 2: Replace `useProjectDomainPrefill` in CompetitorsPage with the shared resolver**

`src/client/features/competitors/CompetitorsPage.tsx:71-91` has a bespoke prefill effect. Replace its body with `resolvePrefill`, keeping its existing "only when the field is empty" guard.

- [ ] **Step 3: Default the location selects to the project market**

In `DomainOverviewPage`, the controls form's `locationCode` default becomes `market.locationCode`.

- [ ] **Step 4: Write handoffs on successful runs, verify, commit each**

Run between each: `pnpm tsc --noEmit && pnpm lint`

---

### Task 13: Site Audit autofill

**Files:**

- Modify: `src/client/features/audit/launch/LaunchFormCard.tsx`, `src/client/features/audit/launch/useLaunchController.ts`

- [ ] **Step 1: No-auto-spend check**

Run: `grep -rn "useQuery\|useMutation" src/client/features/audit/`

- [ ] **Step 2: Default the start URL to the project domain via `resolvePrefill`**

Kind is `"url"`; the project default is `https://<domain>/`.

- [ ] **Step 3: Verify and commit**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm vitest run`

```bash
git add src/client/features/audit
git commit -m "Prefill the site audit start URL from the project domain"
```

---

## Phase 4 — The guidance layer

### Task 14: NextStepsCard

**Files:**

- Create: `src/client/features/insights/NextStepsCard.tsx`

**Interfaces:**

- Consumes: `Verdict` from `./types`.
- Produces: `<NextStepsCard verdict projectId />`.

- [ ] **Step 1: Write the component**

```tsx
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CircleCheck,
  CircleHelp,
  TriangleAlert,
} from "lucide-react";
import { InsightIcon } from "@/client/components/InsightTile";
import type { Verdict, VerdictTone } from "./types";

/**
 * The "what this means and what to do" block, rendered under a tab's results.
 *
 * Deliberately absent from empty states: a tab with no data has nothing
 * defensible to say, and filling the space with generic advice would teach
 * users to ignore this card everywhere.
 */

const TONE_ICON = {
  good: CircleCheck,
  mixed: TriangleAlert,
  bad: TriangleAlert,
  unknown: CircleHelp,
} as const;

const TONE_STYLE: Record<
  VerdictTone,
  "success" | "warning" | "error" | "neutral"
> = {
  good: "success",
  mixed: "warning",
  bad: "error",
  unknown: "neutral",
};

export function NextStepsCard({ verdict }: { verdict: Verdict }) {
  const Icon = TONE_ICON[verdict.tone];
  const actions = verdict.actions.toSorted((a, b) => b.weight - a.weight);

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-3 p-4">
        <h2 className="flex items-start gap-1.5 text-sm font-semibold">
          <InsightIcon icon={Icon} tone={TONE_STYLE[verdict.tone]} />
          <span className="font-normal text-base-content/80">
            {verdict.read}
          </span>
        </h2>

        {actions.length > 0 ? (
          <ul className="space-y-2">
            {actions.map((action) => (
              <li key={action.label} className="flex items-start gap-2 text-sm">
                <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-base-content/45" />
                <div className="min-w-0">
                  {action.to ? (
                    <Link
                      {...action.to}
                      className="font-medium hover:underline"
                    >
                      {action.label}
                    </Link>
                  ) : (
                    <span className="font-medium">{action.label}</span>
                  )}
                  <p className="text-xs text-base-content/55">
                    {action.evidence}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit`
Expected: clean. `Link {...action.to}` requires `action.to` to be typed `LinkOptions`; if TanStack's generics reject the spread, narrow `Action.to` to the specific `to`/`params` shape the verdicts actually use rather than casting.

- [ ] **Step 3: Commit**

```bash
git add src/client/features/insights/NextStepsCard.tsx
git commit -m "Add the verdict and next-steps card"
```

---

### Task 15: SERP verdict

**Files:**

- Create: `src/client/features/insights/verdicts/serp.ts`
- Test: `src/client/features/insights/verdicts/serp.test.ts`

**Interfaces:**

- Consumes: `Verdict`, `unknownVerdict` from `../types`.
- Produces: `buildSerpVerdict(input): Verdict` and `serpRowNote(row, input): string | null`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { buildSerpVerdict, serpRowNote } from "./serp";

describe("buildSerpVerdict", () => {
  it("says so when there is no domain-rating data to judge with", () => {
    const verdict = buildSerpVerdict({
      keyword: "office coffee",
      ownDomainRating: null,
      competitorRatings: [],
      resultCount: 0,
      paaQuestions: [],
    });

    expect(verdict.tone).toBe("unknown");
    expect(verdict.actions).toEqual([]);
  });

  it("calls a keyword reachable when the field is no stronger than the site", () => {
    const verdict = buildSerpVerdict({
      keyword: "office coffee",
      ownDomainRating: 40,
      competitorRatings: [20, 25, 30],
      resultCount: 10,
      paaQuestions: [],
    });

    expect(verdict.tone).toBe("good");
    expect(verdict.read).toContain("25");
  });

  it("calls a keyword out of reach when the field is far stronger", () => {
    const verdict = buildSerpVerdict({
      keyword: "coffee",
      ownDomainRating: 12,
      competitorRatings: [70, 80, 90],
      resultCount: 10,
      paaQuestions: ["what is the best office coffee"],
    });

    expect(verdict.tone).toBe("bad");
    expect(verdict.read).toContain("12");
    expect(verdict.actions[0].label).toContain(
      "what is the best office coffee",
    );
  });
});

describe("serpRowNote", () => {
  it("states the gap for a result stronger than the site", () => {
    expect(serpRowNote({ domainRating: 45 }, { ownDomainRating: 12 })).toBe(
      "needs DR 45+",
    );
  });

  it("says nothing for a result the site already outranks on authority", () => {
    expect(
      serpRowNote({ domainRating: 8 }, { ownDomainRating: 12 }),
    ).toBeNull();
  });

  it("says nothing when either rating is missing", () => {
    expect(
      serpRowNote({ domainRating: null }, { ownDomainRating: 12 }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/client/features/insights/verdicts/serp.test.ts`
Expected: FAIL — cannot find module `./serp`.

- [ ] **Step 3: Write the implementation**

```ts
import { unknownVerdict, type Verdict } from "../types";

/**
 * Reads a SERP the way a practitioner would: is this field beatable by a site
 * of our authority, and if not, what is the nearer target?
 *
 * Authority is a blunt proxy for winnability, so the thresholds below are
 * deliberately wide — the card should decline to call a close contest rather
 * than pretend precision it does not have.
 */

type SerpVerdictInput = {
  keyword: string;
  /** The project domain's rating, when we know it. */
  ownDomainRating: number | null;
  /** Ratings of the ranked results, nulls already removed. */
  competitorRatings: number[];
  resultCount: number;
  /** People-also-ask questions, used to name a nearer target. */
  paaQuestions: string[];
};

/** Median authority of the field is more honest than the mean, which one
 *  Wikipedia result can drag ten points. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/** Inside this band the contest is close enough that authority alone should
 *  not decide it, so the verdict stays "mixed". */
const CLOSE_CONTEST_DR = 10;

export function buildSerpVerdict(input: SerpVerdictInput): Verdict {
  const fieldStrength = median(input.competitorRatings);
  if (fieldStrength == null || input.ownDomainRating == null) {
    return unknownVerdict(
      "Domain ratings are unavailable for this result set, so there is no honest read on whether the keyword is winnable.",
    );
  }

  const gap = fieldStrength - input.ownDomainRating;
  const rounded = Math.round(fieldStrength);

  if (gap <= -CLOSE_CONTEST_DR) {
    return {
      read: `The top results average DR ${rounded}; your site is DR ${input.ownDomainRating}. You out-rank this field on authority, so ranking here is a content problem, not a link problem.`,
      tone: "good",
      actions: [
        {
          label: `Publish or strengthen a page targeting "${input.keyword}"`,
          evidence: `Field median DR ${rounded} against your DR ${input.ownDomainRating}`,
          weight: 100,
        },
      ],
    };
  }

  if (gap < CLOSE_CONTEST_DR) {
    return {
      read: `The top results average DR ${rounded} against your DR ${input.ownDomainRating} — close enough that content quality, not authority, decides this one.`,
      tone: "mixed",
      actions: [
        {
          label: `Match the top result's depth on "${input.keyword}"`,
          evidence: `Field median DR ${rounded}, yours DR ${input.ownDomainRating} — no authority barrier`,
          weight: 100,
        },
      ],
    };
  }

  const nearerTarget = input.paaQuestions[0];
  return {
    read: `The top results average DR ${rounded}; your site is DR ${input.ownDomainRating}. This keyword is out of reach directly.`,
    tone: "bad",
    actions: nearerTarget
      ? [
          {
            label: `Target "${nearerTarget}" instead`,
            evidence: `A question this SERP already surfaces, with far less authority defending it`,
            weight: 100,
          },
        ]
      : [
          {
            label: "Target a longer-tail variant of this keyword",
            evidence: `A DR ${input.ownDomainRating} site does not out-rank a DR ${rounded} field head-on`,
            weight: 100,
          },
        ],
  };
}

export function serpRowNote(
  row: { domainRating: number | null },
  input: { ownDomainRating: number | null },
): string | null {
  if (row.domainRating == null || input.ownDomainRating == null) return null;
  if (row.domainRating <= input.ownDomainRating) return null;
  return `needs DR ${row.domainRating}+`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/client/features/insights/verdicts/serp.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Wire it into the SERP page**

In `SerpOverviewPage.tsx`, after the `<SerpStrengthCards>` line and before `<SerpResultsTable>`:

```tsx
<NextStepsCard
  verdict={buildSerpVerdict({
    keyword: result.keyword,
    ownDomainRating:
      projectDomain && ratings ? (ratings[projectDomain] ?? null) : null,
    competitorRatings: result.results
      .map((item) => (item.domain ? (ratings?.[item.domain] ?? null) : null))
      .filter((value): value is number => value != null),
    resultCount: result.results.length,
    paaQuestions: result.paaQuestions,
  })}
/>
```

Add `const projectDomain = useProjectDomain(projectId);` if the page does not already have it.

In `SerpResultsTable`, render the row note under the URL line:

```tsx
{
  serpRowNote(
    { domainRating: item.domain ? (ratings?.[item.domain] ?? null) : null },
    { ownDomainRating },
  ) ? (
    <div className="text-xs text-base-content/45">
      {serpRowNote(
        { domainRating: item.domain ? (ratings?.[item.domain] ?? null) : null },
        { ownDomainRating },
      )}
    </div>
  ) : null;
}
```

Thread `ownDomainRating` into `SerpResultsTable` as a prop. Compute the note once into a variable rather than calling it twice — the double call above is written out only to show both branches.

- [ ] **Step 6: Verify and commit**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm vitest run`

```bash
git add src/client/features/insights src/client/features/serp
git commit -m "Tell users whether a SERP is winnable

The tab showed DR and traffic estimates but never answered the question
the user actually has. Median authority of the field against the project's
own, with a wide neutral band so a close contest is not called."
```

---

### Task 16: Backlinks, Audit, Competitors, Domain, Keywords and Content verdicts

Six more verdict modules, each following Task 15 exactly: failing tests first, pure module, then wiring plus a `NextStepsCard` under the tab's results.

**Exact signatures.** Implement these as written — the wiring steps and any parallel work depend on these names and types:

```ts
// verdicts/backlinks.ts
export function buildBacklinksVerdict(input: {
  target: string;
  backlinks: number | null;
  referringDomains: number | null;
  brokenBacklinks: number | null;
  spamScore: number | null;
  domainRank: number | null;
}): Verdict;
export function backlinksRowNote(row: { isBroken: boolean }): string | null;

// verdicts/audit.ts
export type AuditIssueSummary = {
  key: string;
  label: string;
  pageCount: number;
  severity: "high" | "medium" | "low";
};
export function buildAuditVerdict(input: {
  pagesCrawled: number;
  issues: AuditIssueSummary[];
  /** Paths with the most GSC clicks, so the verdict can say which issues
   *  land on pages that actually earn traffic. */
  topPagePaths: string[];
  /** Paths each issue touches, keyed by issue key. */
  pathsByIssue: Record<string, string[]>;
}): Verdict;
export function auditRowNote(issueKey: string): string | null;

// verdicts/competitors.ts
export function buildCompetitorsVerdict(input: {
  target: string;
  competitors: Array<{
    domain: string;
    commonKeywords: number;
    ownKeywords: number;
  }>;
}): Verdict;
export function competitorsRowNote(row: {
  commonKeywords: number;
  ownKeywords: number;
}): string | null;

// verdicts/domain.ts
export function buildDomainVerdict(input: {
  domain: string;
  organicKeywords: number | null;
  organicTraffic: number | null;
  /** Share of traffic held by the single strongest keyword, 0-1. */
  topKeywordShare: number | null;
  positionDistribution: { top3: number; top10: number; top100: number } | null;
}): Verdict;

// verdicts/keywords.ts
export function buildKeywordsVerdict(input: {
  seed: string;
  rows: Array<{
    keyword: string;
    searchVolume: number | null;
    difficulty: number | null;
  }>;
  /** The project's own domain rating, for the reachability call. */
  ownDomainRating: number | null;
}): Verdict;
export function keywordRowNote(
  row: { difficulty: number | null },
  input: { ownDomainRating: number | null },
): string | null;
export function buildTrendsVerdict(input: {
  keywords: string[];
  /** Monthly search values per keyword, oldest first. */
  seriesByKeyword: Record<string, number[]>;
}): Verdict;

// verdicts/content.ts
export function buildContentVerdict(input: {
  keyword: string;
  targetWordCount: number | null;
  currentWordCount: number | null;
  missingSubtopics: string[];
  unansweredQuestions: string[];
}): Verdict;
export function buildClustersVerdict(input: {
  topic: string;
  clusters: Array<{ name: string; keywordCount: number; totalVolume: number }>;
}): Verdict;
```

**Verdict content per module:**

| Module                    | Verdict answers                                         | Row note                                  |
| ------------------------- | ------------------------------------------------------- | ----------------------------------------- |
| `verdicts/backlinks.ts`   | Broken links to recover, spam risk level                | `"recoverable"` on rows whose target 404s |
| `verdicts/audit.ts`       | Which issues touch the highest-traffic pages            | the literal fix for the issue type        |
| `verdicts/competitors.ts` | Which competitor to chase, and the first keyword        | keyword-overlap count per row             |
| `verdicts/domain.ts`      | Where traffic concentrates, what is at risk             | none                                      |
| `verdicts/keywords.ts`    | Which of these are winnable; when to publish (Trends)   | reachability per keyword row              |
| `verdicts/content.ts`     | Which page to fix first; the gap worth a hub (Clusters) | none                                      |

**Before implementing each module, read the tab's actual result type** and adjust the input shape above to match what the page really holds. The signatures name the fields the verdict needs; the tab is the authority on what those fields are called. If a field genuinely is not available, drop it from the input and weaken the verdict rather than inventing a source for it.

For each module:

- [ ] **Step 1: Write failing tests covering all four tones**

Every module must have a test asserting that thin input returns `tone: "unknown"` with `actions: []`. That is the rule most likely to be quietly broken.

- [ ] **Step 2: Run to verify failure, implement, run to verify pass**

Run: `pnpm vitest run src/client/features/insights/verdicts/`

- [ ] **Step 3: Wire `NextStepsCard` under the tab's results block**

Above any raw table, below the stat tiles.

- [ ] **Step 4: Verify and commit each module separately**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm vitest run`

---

## Phase 5 — The opt-in AI slice

### Task 17: The explain service and server function

**Files:**

- Create: `src/server/features/insights/services/ExplainService.ts`
- Create: `src/serverFunctions/insights.ts`
- Modify: `src/serverFunctions/config.ts:6-10`

**Interfaces:**

- Consumes: `Verdict` shape (structurally — the server validates it with zod rather than importing client types).
- Produces: `explainFindings` server function; `getClientRuntimeConfig` gains `aiExplainAvailable: boolean`.

- [ ] **Step 1: Add the availability flag**

In `src/serverFunctions/config.ts`:

```ts
export const getClientRuntimeConfig = createServerFn({ method: "GET" }).handler(
  () => ({
    emailVerificationBypassed: env.BYPASS_EMAIL_VERIFICATION === "true",
    // Gates the "Explain this" button. Without a key the button is hidden
    // rather than shown-and-broken.
    aiExplainAvailable: Boolean(env.OPENROUTER_API_KEY?.trim()),
  }),
);
```

- [ ] **Step 2: Write the service**

Read `src/server/features/onpage/services/OnPageAiService.ts` first and match its structure, including how it obtains the model and how it words the missing-key error.

```ts
import { generateText } from "ai";
import { getChatAgentModel } from "@/server/lib/openrouter";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { AppError } from "@/server/lib/errors";

/**
 * Rewrites an already-computed verdict as plain prose.
 *
 * The model receives only the verdict and its evidence strings — never a raw
 * provider payload. It has no numbers available beyond the ones we computed,
 * which is what makes a fabricated figure structurally hard rather than merely
 * discouraged.
 */

const MAX_ACTIONS = 5;

export async function isExplainAvailable(): Promise<boolean> {
  return Boolean(await getOptionalEnvValue("OPENROUTER_API_KEY"));
}

export async function explainVerdict(input: {
  tab: string;
  read: string;
  actions: Array<{ label: string; evidence: string }>;
}): Promise<{ prose: string; model: string }> {
  if (!(await isExplainAvailable())) {
    throw new AppError(
      "BAD_REQUEST",
      "Plain-English explanations need an OPENROUTER_API_KEY. Add it to your deployment to enable them.",
    );
  }

  const model = await getChatAgentModel();
  const actions = input.actions.slice(0, MAX_ACTIONS);

  const { text } = await generateText({
    model,
    system:
      "You explain SEO findings to a non-specialist business owner. You are given a finding and a list of recommended actions, each with the evidence behind it. Rewrite them as two short paragraphs of plain English. Use ONLY the numbers given to you — never introduce a figure, percentage, or ranking that does not appear in the input. Do not add caveats about needing more data. Do not use headings or bullet points.",
    prompt: [
      `Tab: ${input.tab}`,
      `Finding: ${input.read}`,
      "Recommended actions:",
      ...actions.map((a) => `- ${a.label} (because: ${a.evidence})`),
    ].join("\n"),
  });

  return { prose: text.trim(), model: model.modelId };
}
```

- [ ] **Step 3: Write the server function**

```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { explainVerdict } from "@/server/features/insights/services/ExplainService";

const explainFindingsSchema = z.object({
  projectId: z.string().min(1),
  tab: z.string().min(1).max(60),
  read: z.string().min(1).max(600),
  actions: z
    .array(
      z.object({
        label: z.string().min(1).max(200),
        evidence: z.string().min(1).max(200),
      }),
    )
    .max(5),
});

/**
 * Rewrites a deterministic verdict as prose. Explicitly invoked — never called
 * on a result load — so a tab costs nothing unless the user asks for this.
 */
export const explainFindings = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(explainFindingsSchema)
  .handler(async ({ data }) =>
    explainVerdict({ tab: data.tab, read: data.read, actions: data.actions }),
  );
```

- [ ] **Step 4: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: clean. If `model.modelId` is not on the `LanguageModelV3` type, return the configured slug from `getOptionalEnvValue("OPENROUTER_MODEL")` instead.

- [ ] **Step 5: Commit**

```bash
git add src/server/features/insights src/serverFunctions/insights.ts src/serverFunctions/config.ts
git commit -m "Add the opt-in verdict explanation service

The model sees only the verdict and its evidence numbers, never a raw
provider payload, so there are no other figures available to invent."
```

---

### Task 18: The explain button

**Files:**

- Create: `src/client/features/insights/ExplainButton.tsx`
- Modify: `src/client/features/insights/NextStepsCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useRouteContext } from "@tanstack/react-router";
import { explainFindings } from "@/serverFunctions/insights";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import type { Verdict } from "./types";

/**
 * Turns the verdict above it into prose, on demand.
 *
 * A mutation rather than a query, because this must never run on render. The
 * deterministic card stays the primary artifact — this only ever adds a
 * paragraph beneath it, and a failure costs nothing already on screen.
 */
export function ExplainButton({
  projectId,
  tab,
  verdict,
}: {
  projectId: string;
  tab: string;
  verdict: Verdict;
}) {
  const explain = useMutation({
    mutationFn: () =>
      explainFindings({
        data: {
          projectId,
          tab,
          read: verdict.read,
          actions: verdict.actions.slice(0, 5).map((action) => ({
            label: action.label,
            evidence: action.evidence,
          })),
        },
      }),
  });

  if (verdict.tone === "unknown") return null;

  return (
    <div className="flex flex-col gap-2">
      {explain.data ? (
        <div className="rounded-lg border border-base-300 bg-base-200/40 p-3">
          <p className="whitespace-pre-line text-sm leading-relaxed text-base-content/80">
            {explain.data.prose}
          </p>
          <p className="mt-2 text-xs text-base-content/45">
            Written by AI from the finding above.
          </p>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-ghost btn-xs w-fit gap-1.5"
          disabled={explain.isPending}
          onClick={() => explain.mutate()}
        >
          {explain.isPending ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <Sparkles className="size-3.5 text-base-content/45" />
          )}
          Explain this in plain English
        </button>
      )}

      {explain.error ? (
        <p className="text-xs text-error">
          {getStandardErrorMessage(explain.error, "Could not explain this")}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Render it from `NextStepsCard` behind the runtime flag**

`NextStepsCard` gains two optional props, `projectId` and `tab`. When both are present and the root route's `aiExplainAvailable` is true, render `<ExplainButton />` after the actions list. Read the flag the way `useEmailVerificationBypassed` does — via the root route loader data, not a fresh server call.

- [ ] **Step 3: Pass the props from every wired tab**

Each `<NextStepsCard>` call site adds `projectId={projectId}` and a `tab` label matching the nav item.

- [ ] **Step 4: Verify**

Run: `pnpm ci:check && pnpm vitest run`
Expected: all green. The button will not render locally without `OPENROUTER_API_KEY`, which is the intended behaviour.

- [ ] **Step 5: Commit**

```bash
git add src/client/features/insights
git commit -m "Add the opt-in explain button

Hidden entirely without an OPENROUTER_API_KEY rather than shown and
broken, and never rendered for an unknown verdict, which has nothing worth
rephrasing."
```

---

## Final verification

- [ ] **Run the full check**

Run: `pnpm ci:check && pnpm vitest run`
Expected: prettier clean, knip clean, tsc clean, oxlint clean, all tests passing.

- [ ] **Confirm the no-auto-spend guarantee by inspection**

Run: `grep -rn "useQuery" src/client/features/insights/`
Expected: exactly two, both in `useProjectSuggestions.ts`, both on free sources with keys that match existing cache entries.

- [ ] **Confirm no metered server function is imported by the insights module**

Run: `grep -rn "serverFunctions/\(domain\|backlinks\|competitors\|serp\|keywords\|trends\|content\|topic-clusters\|page-explorer\|brandVisibility\)" src/client/features/insights/`
Expected: no matches. `serverFunctions/keywords` is expected only for `getSavedKeywords`, which is a local D1 read — if it appears, confirm that is the only import from it.
