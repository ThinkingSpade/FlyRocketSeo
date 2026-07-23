# Keyword Relevance, Tab Auto-Run and City/State Locations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop Keyword Research returning keywords unrelated to the project, and stop four sibling tabs opening as blank forms.

**Architecture:** Three independent seams. (1) A pure server-side relevance scorer gates which DataForSEO source `Auto` accepts, plus a source reorder and a depth reduction. (2) A shared client seed module ranks non-branded Search Console queries first, feeding a `useTabAutoRun` hook that fires each tab's run once on first visit and restores free forever after. (3) A generated US city/state location table, resolved precisely for SERP calls and up to the parent country for Labs calls.

**Tech Stack:** TypeScript, React 19, TanStack Router/Query/Form, Vitest, Zod, DataForSEO, Cloudflare Workers (D1 + R2).

## Global Constraints

- Spec: `specs/0018-keyword-relevance-and-tab-autorun.md`. Read it before starting.
- Test runner is **Vitest**. Unit tests live beside the module as `<name>.test.ts`.
- Full gate before any "done" claim: `npm run ci:check` (prettier + knip + tsc + oxlint) and `npm run test`.
- **Never invent a DataForSEO location code.** Codes come from DataForSEO's public locations CSV via the generator script in Task 8, never from memory. No API key is required for it.
- **`knip` fails on unused exports.** Every new export must have a consumer in the same task, or the task is not done.
- Icons: bare muted lucide glyphs, no chips, per repo convention.
- Comments explain _why_, not _what_ — match surrounding density. No comment restates its code.
- Do not change `database_name`/`bucket_name` in `wrangler.jsonc` — they are live resource names.
- Commit after each task with a descriptive message. Do not push.

## Task dependencies

```
1 (relevance rule) ──┬─► 2 (Auto gate)
                     └─► 3 (results toggle)

4 (seed ranking) ────────► 5 (useTabAutoRun) ──► 6 (wire 5 tabs) ──► 7 (run control)

8 (location codes) ──────► 9 (pickers)
```

Three independent roots — **1, 4 and 8 can start at the same time**. Tasks 2 and 3 can run concurrently once 1 lands. Tasks 6 and 7 must be sequential: they edit the same tab files and would otherwise conflict.

---

### Task 1: Keyword relevance scorer (pure)

The judgement that "Obnoxious Meaning" is not about "delio". Kept pure and server-side so both the `Auto` source gate and the results table read one definition.

**Files:**

- Create: `src/shared/keywordRelevance.ts`
- Test: `src/shared/keywordRelevance.test.ts`

Lives in `src/shared/` because both the server's `Auto` source gate and the client's results table read it. That is what `src/shared/` is for in this repo — `keyword-locations.ts` is imported by both sides the same way — and it avoids a client→server import, which is rare here and would drag a server path into the browser bundle.

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `tokenizeSeed(seed: string): string[]`
  - `scoreRelevance(keyword: string, seedTokens: string[]): number` — 0..1, share of seed tokens matched.
  - `isOffTopic(keyword: string, seedTokens: string[]): boolean` — true when zero seed tokens match.

**Design note for the implementer:** the rule is deliberately _"shares at least one meaningful word with the seed"_, not a similarity threshold. A stricter rule would delete genuinely useful lateral keywords (seed `office coffee service` → `break room coffee` shares only `coffee` and must survive). The rule is also explainable in UI copy as a fact rather than a fuzzy score.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { isOffTopic, scoreRelevance, tokenizeSeed } from "./keywordRelevance";

describe("tokenizeSeed", () => {
  it("drops stopwords", () => {
    expect(tokenizeSeed("how to do seo")).toEqual(["seo"]);
  });

  it("keeps every token when the seed is all stopwords", () => {
    expect(tokenizeSeed("how to")).toEqual(["how", "to"]);
  });

  it("splits on punctuation and lowercases", () => {
    expect(tokenizeSeed("Office-Coffee Service")).toEqual([
      "office",
      "coffee",
      "service",
    ]);
  });
});

describe("scoreRelevance", () => {
  const seed = tokenizeSeed("office coffee service");

  it("scores a full phrase match 1", () => {
    expect(scoreRelevance("best office coffee service", seed)).toBe(1);
  });

  it("scores a partial overlap by share of seed tokens", () => {
    expect(scoreRelevance("break room coffee", seed)).toBeCloseTo(1 / 3);
  });

  it("matches singular against plural via a shared prefix", () => {
    expect(scoreRelevance("office coffee services", seed)).toBe(1);
  });

  it("scores an unrelated keyword 0", () => {
    expect(scoreRelevance("aria name meaning", seed)).toBe(0);
  });
});

describe("isOffTopic", () => {
  const brandSeed = tokenizeSeed("delio");

  // The exact regression: a depth-3 related walk drifted from "delio" to
  // name meanings, and nothing rejected them.
  it("rejects the drifted name-meaning keywords", () => {
    expect(isOffTopic("obnoxious meaning", brandSeed)).toBe(true);
    expect(isOffTopic("aria name meaning", brandSeed)).toBe(true);
    expect(isOffTopic("zella name meaning", brandSeed)).toBe(true);
  });

  it("keeps keywords that do name the seed", () => {
    expect(isOffTopic("delio meaning", brandSeed)).toBe(false);
    expect(isOffTopic("delio pro", brandSeed)).toBe(false);
  });

  // A 2-char shared prefix is a coincidence, not a stem.
  it("does not treat a near-miss spelling as a match", () => {
    expect(isOffTopic("dealio meaning", brandSeed)).toBe(true);
  });

  it("treats an empty seed as matching nothing off-topic", () => {
    expect(isOffTopic("anything at all", [])).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/shared/keywordRelevance.test.ts`
Expected: FAIL — `Failed to resolve import "./keywordRelevance"`.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Whether a returned keyword is actually about the seed.
 *
 * `related_keywords` walks Google's "searches related to" graph, and each hop
 * can change the subject: a walk from "delio" reached "obnoxious meaning" in
 * three steps. The only previous acceptance test counted rows, so 46 keywords
 * about the meaning of names passed it.
 *
 * The rule is "shares at least one meaningful word with the seed" rather than a
 * similarity threshold, because a threshold deletes genuine lateral keywords —
 * "break room coffee" shares only one word with "office coffee service" and is
 * exactly the kind of suggestion the tab exists to surface.
 */

/** Enough shared prefix to be a stem ("service"/"services") rather than a
 *  coincidence ("delio"/"dealio", which share only "de"). */
const MIN_STEM_PREFIX = 4;

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "best",
  "by",
  "do",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "near",
  "of",
  "on",
  "or",
  "the",
  "to",
  "top",
  "vs",
  "what",
  "why",
  "with",
]);

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/['’]/g, "") // an apostrophe is punctuation, not a word boundary
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // accents shouldn't fork a word into a new token
    .split(/[^\p{L}\p{N}]+/u) // \p{L}/\p{N}, not a-z0-9 — seeds aren't all Latin
    .filter((token) => token.length > 0);
}

export function tokenizeSeed(seed: string): string[] {
  const tokens = tokenize(seed);
  const meaningful = tokens.filter((token) => !STOPWORDS.has(token));
  // A seed made entirely of stopwords ("how to") still has to match something.
  const relevant = meaningful.length > 0 ? meaningful : tokens;
  // "new york new york hotel" shouldn't let a repeated word inflate the
  // denominator scoreRelevance divides by.
  return [...new Set(relevant)];
}

function tokensMatch(seedToken: string, keywordToken: string): boolean {
  if (seedToken === keywordToken) return true;
  const shorter =
    seedToken.length <= keywordToken.length ? seedToken : keywordToken;
  const longer =
    seedToken.length <= keywordToken.length ? keywordToken : seedToken;
  return shorter.length >= MIN_STEM_PREFIX && longer.startsWith(shorter);
}

export function scoreRelevance(keyword: string, seedTokens: string[]): number {
  if (seedTokens.length === 0) return 1;
  const keywordTokens = tokenize(keyword);
  const matched = seedTokens.filter((seedToken) =>
    keywordTokens.some((keywordToken) => tokensMatch(seedToken, keywordToken)),
  ).length;
  return matched / seedTokens.length;
}

export function isOffTopic(keyword: string, seedTokens: string[]): boolean {
  return scoreRelevance(keyword, seedTokens) === 0;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run src/shared/keywordRelevance.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/keywordRelevance.ts src/shared/keywordRelevance.test.ts
git commit -m "Add a relevance rule for keywords returned against a seed"
```

Note: `knip` will flag these exports as unused until Task 2 consumes them. That is expected; do not run `ci:check` as a gate on this task alone.

---

### Task 2: Auto stops accepting drifted keywords

**Files:**

- Modify: `src/server/features/keywords/services/research/selection.ts`
- Modify: `src/server/features/keywords/services/research/research-data.ts` (the `depth: 3` in `fetchRelatedRows`)
- Modify: `src/server/features/keywords/services/research/research.ts` (`fetchAutoRows` passes the seed through)
- Test: `src/server/features/keywords/services/research/selection.test.ts`

**Interfaces:**

- Consumes: `tokenizeSeed`, `isOffTopic` from Task 1.
- Produces:
  - `AUTO_KEYWORD_SOURCES` reordered to `["suggestions", "ideas", "related"]`.
  - `countRelevantKeywords(rows: EnrichedKeyword[], seedKeyword: string): number`
  - `hasSufficientCoverage(rows, seedKeyword, threshold?)` — unchanged signature, now counts relevant non-seed rows.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  AUTO_KEYWORD_SOURCES,
  countRelevantKeywords,
  hasSufficientCoverage,
} from "./selection";
import type { EnrichedKeyword } from "./helpers";

function row(keyword: string): EnrichedKeyword {
  return {
    keyword,
    searchVolume: 100,
    trend: [],
    cpc: null,
    competition: null,
    keywordDifficulty: null,
    intent: "unknown",
  };
}

describe("AUTO_KEYWORD_SOURCES", () => {
  // keyword_suggestions returns keywords containing the seed phrase, so it
  // cannot drift. related walks a graph and can, so it goes last.
  it("tries the drift-free source first and the graph walk last", () => {
    expect(AUTO_KEYWORD_SOURCES).toEqual(["suggestions", "ideas", "related"]);
  });
});

describe("countRelevantKeywords", () => {
  it("excludes the seed itself", () => {
    expect(countRelevantKeywords([row("delio")], "delio")).toBe(0);
  });

  it("excludes keywords that share no word with the seed", () => {
    const rows = [
      row("obnoxious meaning"),
      row("aria name meaning"),
      row("zella name meaning"),
    ];
    expect(countRelevantKeywords(rows, "delio")).toBe(0);
  });

  it("counts keywords that do name the seed", () => {
    expect(countRelevantKeywords([row("delio pro")], "delio")).toBe(1);
  });
});

describe("hasSufficientCoverage", () => {
  // The exact regression: 46 drifted rows previously satisfied Auto.
  it("is not satisfied by drifted rows", () => {
    const drifted = [
      "obnoxious meaning",
      "aria name meaning",
      "zella name meaning",
      "colton name meaning",
      "lia name meaning",
      "weenie meaning",
    ].map(row);
    expect(hasSufficientCoverage(drifted, "delio")).toBe(false);
  });

  it("is satisfied by five on-topic rows", () => {
    const onTopic = [
      "delio pro",
      "delio meaning",
      "delio poker",
      "delio app",
      "delio login",
    ].map(row);
    expect(hasSufficientCoverage(onTopic, "delio")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/server/features/keywords/services/research/selection.test.ts`
Expected: FAIL — `AUTO_KEYWORD_SOURCES` order assertion fails, and `countRelevantKeywords` is not exported.

- [ ] **Step 3: Rewrite `selection.ts`**

Keep `KeywordSource`, `KeywordMode`, `ResearchSource` and `MIN_NON_SEED_FOR_AUTO` exactly as they are. Replace the ordering constant and the counting functions:

```ts
import { isOffTopic, tokenizeSeed } from "@/shared/keywordRelevance";

/**
 * Order matters. keyword_suggestions returns keywords containing the seed
 * phrase, so it cannot change the subject; ideas stays close; related walks
 * Google's related-searches graph and is the only one that can drift, so it
 * runs last and only when the first two came up short.
 */
export const AUTO_KEYWORD_SOURCES: KeywordSource[] = [
  "suggestions",
  "ideas",
  "related",
];

export function countRelevantKeywords(
  rows: EnrichedKeyword[],
  seedKeyword: string,
): number {
  const normalizedSeed = seedKeyword.trim().toLowerCase();
  const seedTokens = tokenizeSeed(seedKeyword);
  return rows.filter(
    (row) =>
      row.keyword !== normalizedSeed && !isOffTopic(row.keyword, seedTokens),
  ).length;
}
```

Keep `countNonSeedKeywords` — `research.ts` reports it in diagnostics, and the two numbers differing is the signal that a source drifted. Then:

```ts
export function hasSufficientCoverage(
  rows: EnrichedKeyword[],
  seedKeyword: string,
  threshold: number = MIN_NON_SEED_FOR_AUTO,
): boolean {
  return countRelevantKeywords(rows, seedKeyword) >= threshold;
}
```

- [ ] **Step 4: Reduce the related-keywords walk depth**

In `src/server/features/keywords/services/research/research-data.ts`, inside `fetchRelatedRows`, change `depth: 3` to `depth: 1` and replace the comment above the call with:

```ts
    // One hop is Google's actual "searches related to <seed>". Hops two and
    // three change the subject — a depth-3 walk from "delio" reached
    // "obnoxious meaning" — so the extra reach was only ever drift.
    depth: 1,
```

- [ ] **Step 5: Record the relevant count in diagnostics**

In `src/server/features/keywords/services/research/research.ts`, import `countRelevantKeywords` alongside the existing imports from `./selection`, add `relevantCount: number` to the `SourceAttempt` type, and set it in all three places a `SourceAttempt` is built (`fetchAutoRows`, `fetchGoogleAdsRows`, `fetchManualRows`) as `countRelevantKeywords(rows, seedKeyword)`.

Bump `CACHE_VERSION` from `3` to `4` with an updated comment — the reorder and depth change mean the same request now yields different rows, and a stale v3 entry would serve the drifted results this task exists to remove:

```ts
// v4: Auto tries suggestions before related and related walks one hop, so the
// same request no longer returns the drifted rows a v3 entry cached.
const CACHE_VERSION = 4;
```

- [ ] **Step 6: Run the tests and verify they pass**

Run: `npx vitest run src/server/features/keywords/services/research/`
Expected: PASS, including the pre-existing `research-data.test.ts`. If an existing test asserts the old source order or `depth: 3`, update it — the assertion was pinning the bug.

- [ ] **Step 7: Verify types and lint**

Run: `npm run ci:check`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/server/features/keywords/services/research/
git commit -m "Stop Auto accepting keywords that drifted off the seed"
```

---

### Task 3: Off-topic keywords collapse instead of vanishing

Low-relevance rows stay in the payload and stay countable. Deleting them server-side would hide the judgement; this makes it auditable.

**Files:**

- Create: `src/client/features/keywords/offTopicKeywords.ts`
- Test: `src/client/features/keywords/offTopicKeywords.test.ts`
- Modify: `src/client/features/keywords/page/KeywordResearchResults.tsx`

**Interfaces:**

- Consumes: `tokenizeSeed`, `isOffTopic` from Task 1, via `@/shared/keywordRelevance`.
- Produces: `partitionByRelevance<T extends { keyword: string }>(rows: T[], seedKeyword: string): { onTopic: T[]; offTopic: T[] }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { partitionByRelevance } from "./offTopicKeywords";

describe("partitionByRelevance", () => {
  it("separates drifted keywords from on-topic ones", () => {
    const rows = [
      { keyword: "delio pro" },
      { keyword: "obnoxious meaning" },
      { keyword: "delio meaning" },
      { keyword: "aria name meaning" },
    ];
    const { onTopic, offTopic } = partitionByRelevance(rows, "delio");
    expect(onTopic.map((r) => r.keyword)).toEqual([
      "delio pro",
      "delio meaning",
    ]);
    expect(offTopic.map((r) => r.keyword)).toEqual([
      "obnoxious meaning",
      "aria name meaning",
    ]);
  });

  it("keeps every row on-topic when there is no seed", () => {
    const rows = [{ keyword: "anything" }];
    expect(partitionByRelevance(rows, "").offTopic).toEqual([]);
  });

  it("preserves the incoming order within each side", () => {
    const rows = [{ keyword: "b delio" }, { keyword: "a delio" }];
    expect(
      partitionByRelevance(rows, "delio").onTopic.map((r) => r.keyword),
    ).toEqual(["b delio", "a delio"]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/client/features/keywords/offTopicKeywords.test.ts`
Expected: FAIL — `Failed to resolve import "./offTopicKeywords"`.

- [ ] **Step 3: Write the implementation**

```ts
import { isOffTopic, tokenizeSeed } from "@/shared/keywordRelevance";

/**
 * Splits research rows into ones that share a word with the seed and ones that
 * don't. Off-topic rows are collapsed in the table rather than dropped on the
 * server, so the call stays visible and reversible by the person reading it.
 */
export function partitionByRelevance<T extends { keyword: string }>(
  rows: T[],
  seedKeyword: string,
): { onTopic: T[]; offTopic: T[] } {
  const seedTokens = tokenizeSeed(seedKeyword);
  if (seedTokens.length === 0) return { onTopic: rows, offTopic: [] };

  const onTopic: T[] = [];
  const offTopic: T[] = [];
  for (const row of rows) {
    if (isOffTopic(row.keyword, seedTokens)) offTopic.push(row);
    else onTopic.push(row);
  }
  return { onTopic, offTopic };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run src/client/features/keywords/offTopicKeywords.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Wire the toggle into the results**

Read `src/client/features/keywords/page/KeywordResearchResults.tsx` first and follow its existing filter/state conventions. Requirements:

- Partition the rows with `partitionByRelevance(rows, searchedKeyword)` before the existing filter chain runs.
- Default to rendering `onTopic` only.
- When `offTopic.length > 0`, render one muted line directly above the table:
  `{offTopic.length} keywords share no words with "{seed}" — hidden` with a ghost text button reading `Show` / `Hide` that flips a `showOffTopic` state and appends `offTopic` to the rendered rows.
- The existing result count text must reflect what is actually rendered.
- Copy states the fact ("share no words with") rather than a judgement ("irrelevant"). No new icon.

- [ ] **Step 6: Verify in the browser**

Start the dev server via `preview_start` (never `npm run dev` in a shell). Open Keyword Research for a project with a stored run. Confirm: the hidden-count line appears, `Show` reveals the rows, `Hide` collapses them, and the count text matches the rendered row count.

- [ ] **Step 7: Full gate**

Run: `npm run ci:check && npm run test`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/client/features/keywords/
git commit -m "Collapse off-topic keywords in the results instead of dropping them"
```

---

### Task 4: Seed suggestions stop leading with the brand

**Files:**

- Create: `src/client/features/keywords/seed/seedSuggestions.ts` (pure ranking)
- Test: `src/client/features/keywords/seed/seedSuggestions.test.ts`
- Create: `src/client/features/keywords/seed/SeedKeywordField.tsx` (moved from `dashboard/`)
- Delete: `src/client/features/dashboard/SeedKeywordField.tsx`
- Modify: `src/client/features/dashboard/AnalyzeProjectCard.tsx` (import path only)

**Interfaces:**

- Consumes: `defaultBrandTerms`, `isBrandedQuery` from `@/client/features/search-performance/brandedSplit`.
- Produces:
  - `type SeedSuggestion = { keyword: string; hint: string; branded: boolean }`
  - `rankSeedSuggestions(input: { gscQueries: { query: string; impressions: number; position: number }[]; savedKeywords: { keyword: string; searchVolume: number | null }[]; domain: string; limit?: number }): SeedSuggestion[]`
  - `useSeedSuggestions(projectId: string): SeedSuggestion[]` (re-exported from `SeedKeywordField.tsx`)
  - `SeedKeywordField` — same props as today plus nothing new.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { rankSeedSuggestions } from "./seedSuggestions";

const domain = "deliotx.com";

describe("rankSeedSuggestions", () => {
  // The exact regression: the brand always wins on impressions, so the tab
  // seeded "delio" and researched the meaning of names.
  it("ranks a lower-impression non-branded query above the brand", () => {
    const ranked = rankSeedSuggestions({
      gscQueries: [
        { query: "delio", impressions: 5000, position: 1.2 },
        { query: "office coffee service", impressions: 120, position: 14.3 },
      ],
      savedKeywords: [],
      domain,
    });
    expect(ranked[0].keyword).toBe("office coffee service");
    expect(ranked[0].branded).toBe(false);
  });

  it("still offers branded queries, marked and last", () => {
    const ranked = rankSeedSuggestions({
      gscQueries: [
        { query: "delio", impressions: 5000, position: 1.2 },
        { query: "office coffee service", impressions: 120, position: 14.3 },
      ],
      savedKeywords: [],
      domain,
    });
    expect(ranked.at(-1)).toMatchObject({ keyword: "delio", branded: true });
  });

  it("matches a spaced brand against the domain stem", () => {
    const ranked = rankSeedSuggestions({
      gscQueries: [{ query: "delio tx", impressions: 900, position: 2 }],
      savedKeywords: [],
      domain,
    });
    expect(ranked[0].branded).toBe(true);
  });

  it("orders non-branded queries by impressions", () => {
    const ranked = rankSeedSuggestions({
      gscQueries: [
        { query: "coffee machines", impressions: 50, position: 20 },
        { query: "office coffee service", impressions: 300, position: 12 },
      ],
      savedKeywords: [],
      domain,
    });
    expect(ranked.map((s) => s.keyword)).toEqual([
      "office coffee service",
      "coffee machines",
    ]);
  });

  it("falls back to saved keywords when Search Console has nothing", () => {
    const ranked = rankSeedSuggestions({
      gscQueries: [],
      savedKeywords: [{ keyword: "vending machines", searchVolume: 2400 }],
      domain,
    });
    expect(ranked[0]).toMatchObject({
      keyword: "vending machines",
      branded: false,
    });
    expect(ranked[0].hint).toContain("2.4k");
  });

  it("returns nothing rather than a useless seed", () => {
    expect(
      rankSeedSuggestions({ gscQueries: [], savedKeywords: [], domain }),
    ).toEqual([]);
  });

  it("carries the number that justifies each suggestion", () => {
    const ranked = rankSeedSuggestions({
      gscQueries: [
        { query: "office coffee service", impressions: 1200, position: 14.34 },
      ],
      savedKeywords: [],
      domain,
    });
    expect(ranked[0].hint).toBe("1.2k impressions · pos 14.3");
  });

  it("caps the list at the limit", () => {
    const gscQueries = Array.from({ length: 20 }, (_, i) => ({
      query: `keyword ${i}`,
      impressions: 100 - i,
      position: 10,
    }));
    expect(
      rankSeedSuggestions({ gscQueries, savedKeywords: [], domain, limit: 5 }),
    ).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/client/features/keywords/seed/seedSuggestions.test.ts`
Expected: FAIL — `Failed to resolve import "./seedSuggestions"`.

- [ ] **Step 3: Write the ranking module**

```ts
import {
  defaultBrandTerms,
  isBrandedQuery,
} from "@/client/features/search-performance/brandedSplit";

/**
 * Which keyword the keyword-driven analyses start from.
 *
 * Ranking by impressions alone always surfaces the brand, because on every site
 * the brand is the top-impression query — which is how keyword research came to
 * be seeded with "delio". Non-branded queries therefore rank first; branded ones
 * are still offered, marked, and last, so picking one is a decision.
 *
 * Every source here is free: Search Console, then the project's own saved
 * keywords out of D1.
 */

export type SeedSuggestion = {
  keyword: string;
  hint: string;
  branded: boolean;
};

const DEFAULT_LIMIT = 5;

function compact(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

export function rankSeedSuggestions({
  gscQueries,
  savedKeywords,
  domain,
  limit = DEFAULT_LIMIT,
}: {
  gscQueries: { query: string; impressions: number; position: number }[];
  savedKeywords: { keyword: string; searchVolume: number | null }[];
  domain: string;
  limit?: number;
}): SeedSuggestion[] {
  const terms = domain ? defaultBrandTerms(domain) : [];
  const byImpressions = gscQueries.toSorted(
    (a, b) => b.impressions - a.impressions,
  );

  const fromGsc = byImpressions.map((row) => ({
    keyword: row.query,
    hint: `${compact(row.impressions)} impressions · pos ${row.position.toFixed(1)}`,
    branded: isBrandedQuery(row.query, terms),
  }));

  const ordered = [
    ...fromGsc.filter((row) => !row.branded),
    ...fromGsc.filter((row) => row.branded),
  ];
  if (ordered.length > 0) return ordered.slice(0, limit);

  return savedKeywords.slice(0, limit).map((row) => ({
    keyword: row.keyword,
    hint:
      row.searchVolume != null
        ? `${compact(row.searchVolume)}/mo saved`
        : "saved keyword",
    branded: isBrandedQuery(row.keyword, terms),
  }));
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run src/client/features/keywords/seed/seedSuggestions.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Move and rewire the field component**

Move `src/client/features/dashboard/SeedKeywordField.tsx` to `src/client/features/keywords/seed/SeedKeywordField.tsx`, then:

- `useSeedSuggestions(projectId)` keeps both existing free queries (`searchPerformance` on the dashboard's exact query key so it adds no request, and `savedKeywords`), adds the `["projects"]` query used by `BrandedSplitCard` to read the domain, and returns `rankSeedSuggestions({ ... })`. Delete the inline ranking that used to live in the hook.
- `SeedKeywordField` renders a muted `brand` label inside any chip whose `branded` is true. No icon, no chip styling beyond what the component already uses.
- When `suggestions.length === 0`, the helper line reads: `No Search Console queries or saved keywords yet — type a keyword your customers would search for.`
- Update the import in `src/client/features/dashboard/AnalyzeProjectCard.tsx` to `@/client/features/keywords/seed/SeedKeywordField`.
- `AnalyzeProjectCard` pre-fills `suggestions[0]?.keyword` as today. That is now the top _non-branded_ query, which is the entire point of the task.

- [ ] **Step 6: Verify in the browser**

With the dev server running, open the project Overview. Confirm the seed field pre-fills a non-branded query and that any branded chip is marked and last.

- [ ] **Step 7: Full gate**

Run: `npm run ci:check && npm run test`
Expected: clean. `knip` must not report the old dashboard path.

- [ ] **Step 8: Commit**

```bash
git add src/client/features/keywords/seed/ src/client/features/dashboard/
git commit -m "Rank seed suggestions by topic rather than by brand"
```

---

### Task 5: `useTabAutoRun`

**Files:**

- Create: `src/client/features/analysis-runs/useTabAutoRun.ts`
- Test: `src/client/features/analysis-runs/useTabAutoRun.test.ts`

**Interfaces:**

- Consumes: `useAutoRestoredRun` (unchanged), `useSeedSuggestions` from Task 4.
- Produces:

```ts
export function useTabAutoRun<T>(params: {
  projectId: string;
  feature: string;
  schema: ZodType<T>;
  /** True when the tab has no live query of its own. */
  idle: boolean;
  runId?: string | null;
  /** Fires once, only when the project has never run this tab. */
  autoRun: (seed: string) => void;
  /** Blocks auto-run until the tab has what it needs (seed, domain). */
  canAutoRun: boolean;
  seed: string;
}): {
  restored: {
    result: T;
    label: string;
    lastRanAt: string;
    runCount: number;
  } | null;
  isRestoring: boolean;
  didAutoRun: boolean;
};
```

**Behaviour the tests must pin:**

- Auto-run fires only when `idle`, `canAutoRun`, the restore query has **settled**, `restored === null`, and `seed !== ""`.
- It fires **at most once per mount** — guard with a ref, not with state, and never put the `autoRun` callback in an effect dependency array. (A callback in the deps caused the wave-9 render loop; it must not be repeated.)
- It never fires while `isRestoring` is true. Firing on a pending restore would pay for a run that already exists — the exact spend leak this design is bounded by.
- `didAutoRun` reports whether this mount fired, so the caller can label the result.

- [ ] **Step 1: Write the failing test**

Use `renderHook` from `@testing-library/react` with a `QueryClientProvider`. Check whether the repo already has a test-utils wrapper (`grep -rn "renderHook" src/`) and reuse it; if none exists, build the wrapper inline in this test file. Mock `@/serverFunctions/analysisRuns` with `vi.mock`.

Required cases:

```ts
it("does not auto-run while the restore is still pending", ...)
it("does not auto-run when a stored run was restored", ...)
it("auto-runs once when the project has never run this tab", ...)
it("does not auto-run twice across re-renders", ...)
it("does not auto-run without a seed", ...)
it("does not auto-run when canAutoRun is false", ...)
it("does not auto-run when the tab has a live query (idle false)", ...)
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/client/features/analysis-runs/useTabAutoRun.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Wrap `useAutoRestoredRun`, add a `useRef<boolean>` fired-guard, and run the auto-run inside a `useEffect` whose deps are only the primitive gates (`idle`, `canAutoRun`, `seed`, `isRestoring`, and whether `restored` is null). Read the `autoRun` callback through a ref that an effect keeps current, so it never enters a dependency array.

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run src/client/features/analysis-runs/useTabAutoRun.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/client/features/analysis-runs/useTabAutoRun.ts src/client/features/analysis-runs/useTabAutoRun.test.ts
git commit -m "Add a hook that runs a tab once when a project has never run it"
```

`knip` will flag the export until Task 6 consumes it.

---

### Task 6: Four tabs stop opening blank

**Files:**

- Modify: `src/client/features/trends/TrendsPage.tsx`
- Modify: `src/client/features/serp/SerpOverviewPage.tsx`
- Modify: `src/client/features/content/ContentOptimizerPage.tsx`
- Modify: `src/client/features/topic-clusters/TopicClustersPage.tsx`
- Modify: `src/client/features/page-explorer/PageExplorerPage.tsx`

**Interfaces:**

- Consumes: `useTabAutoRun` (Task 5), `useSeedSuggestions` + `SeedKeywordField` (Task 4).

Per tab:

- Replace the hardcoded placeholder with the top suggestion, or keep a generic placeholder only when there are no suggestions. Current placeholders to remove: `"seo tools, keyword research, rank tracker"` (Trends), `"office coffee service dallas"` (SERP), `"office vending machines dallas"` (Content), `"office vending machines"` (Clusters).
- Render suggestion chips above the input using the shared `SeedKeywordField` where the tab takes a keyword. Clicking a chip fills the input; it does **not** submit.
- Wire `useTabAutoRun` with that tab's existing run function and `RUN_FEATURES` key, `idle` set to the tab's existing "nothing searched" condition, `canAutoRun` requiring a non-empty seed, and `seed` the top suggestion.
- Page Explorer takes a URL, not a keyword: give it chips of the project's top Search Console **pages** (from the same free `searchPerformance` query, `pageTotals`) and auto-run on the top page. Do not give it keyword chips.

Confirm each tab's auto-run calls the same server function its manual submit already calls, so a first visit and a manual run produce identical cache keys. A mismatch means the first visit pays and the manual run pays again.

- [ ] **Step 1: Wire Keyword Trends, verify, commit**

Verify in the browser against the **network log**: open the tab on a project with no trends run and confirm exactly one `getKeywordTrends` call fires; reload and confirm **zero** metered calls fire and the result renders from the restore. This is the only acceptable evidence — `tsc` cannot catch a spend regression.

- [ ] **Step 2: Wire SERP Overview, verify the same way, commit**
- [ ] **Step 3: Wire Content Optimizer, verify the same way, commit**

Content Optimizer additionally must not re-derive competitor outlines from a restored brief. Confirm `analyzeContentCompetitor` does not fire on a restore or on an auto-run — commit `3085780` fixed exactly this leak and it must not regress.

- [ ] **Step 4: Wire Topic Clusters, verify the same way, commit**
- [ ] **Step 5: Wire Page Explorer's URL chips, verify the same way, commit**

- [ ] **Step 6: Full gate**

Run: `npm run ci:check && npm run test`

---

### Task 7: The run control gets quiet

**Files:**

- Modify: `src/client/features/analysis-runs/RestoreRail.tsx`
- Modify: `src/client/features/analysis-runs/RestoredRunBanner.tsx`
- Modify: the six tabs that render `RestoreRail`

Replace the full-width banner with an inline control: the run label and relative timestamp as muted text, plus a ghost icon-only refresh button (bare lucide `RotateCw`, no chip) that calls the existing `onRunAgain`. Keep `RecentRunsList` unchanged. The control sits in the results header rather than as a standalone card.

Because "Run again" spends, the button keeps an accessible name (`aria-label="Run again"`) and a `title` stating it re-runs the analysis. Do not make spending less legible in the name of subtlety.

- [ ] **Step 1: Update `RestoredRunBanner` to the inline presentation**
- [ ] **Step 2: Check every `RestoreRail` consumer still lays out correctly**

Run `grep -rn "RestoreRail" src/client` and open each tab in the browser.

- [ ] **Step 3: Full gate and commit**

Run: `npm run ci:check && npm run test`

```bash
git add src/client/features/analysis-runs/ src/client/features/
git commit -m "Make the re-run control an inline header action"
```

---

### Task 8: Generate the US city and state location table

**Files:**

- Create: `scripts/generate-us-locations.ts`
- Modify: `src/shared/keyword-locations.ts`
- Test: `src/shared/keyword-locations.test.ts`

**Do not hand-write location codes.** DataForSEO geotarget codes are not derivable and a wrong one silently returns data for the wrong place. The script fetches them.

**No API key is needed.** DataForSEO publishes its supported-location tables as public CDN CSVs. Verified: `https://cdn.dataforseo.com/v3/locations/locations_serp_google_2026_07_20.csv` returns HTTP 200 over plain HTTPS with no credentials — 16 MB, 266,897 rows, columns `location_code,location_name,location_code_parent,country_iso_code,location_type`. Use the SERP table, because city precision only applies to SERP-derived calls.

**Four facts confirmed against that file. The earlier draft of this task got all four wrong; do not "correct" them back.**

1. There are **51** US rows of type `State`, not 50 — the extra is `21140 = District of Columbia`. Do not filter it out; it is a real, targetable location.
2. **Cities are parented to their state, not to the country.** `1026339 = Dallas,Texas,United States` has `location_code_parent = 21176` (Texas), whose parent is `2840`. Resolution to a country must therefore **walk the chain**, not read a single `parentCode`.
3. **City names are not unique.** There are six `Dallas` rows (GA, NC, OR, PA, TX, WI). The picker label must carry the state or the user cannot tell them apart. Store the state name alongside the city.
4. There are **19,654** US cities, which is 553 KB of JSON in compact form. That is too much for the main bundle and too arbitrary to trim to a "top 300" — this file carries no population column, so any such cut would be invented. Ship **all** of them from a lazily-imported module instead. States are 1 KB and stay inline.

**Interfaces:**

- Produces:
  - `LocationOption` gains `kind: "country" | "state" | "city"` and `parentCode?: number`. Existing entries are `kind: "country"` — apply the default where the table is built rather than editing 700 literal rows by hand.
  - `US_STATE_OPTIONS: readonly LocationOption[]` — 51 entries, inline, `parentCode: 2840`.
  - `loadUsCityOptions(): Promise<readonly LocationOption[]>` — dynamic `import()` of the generated module, so the 553 KB never enters the main chunk.
  - `resolveLabsLocationCode(locationCode: number): number` — walks `parentCode` upward until it reaches a Labs-supported code; returns `DEFAULT_LOCATION_CODE` if the chain runs out. Must terminate on a cycle rather than hang.
  - `getLanguageCode` resolves through the same chain for sub-country codes.

- [ ] **Step 1: Write the generator script**

`scripts/generate-us-locations.ts`, run with `tsx`. It downloads the CSV URL above (no auth header), parses it with a **quote-aware** CSV reader — `location_name` values contain commas and are quoted, so a naive `split(",")` silently corrupts every row — filters to `country_iso_code === "US"`, and emits two files:

- `src/shared/us-states.generated.ts` — the 51 `State` rows.
- `src/shared/us-cities.generated.ts` — all `City` rows, each carrying its code, bare city name, and parent state code.

Both get a header comment naming the script, the source URL, and the CSV's date stamp, plus a note that the file is generated and must not be hand-edited.

Pin the CSV URL as a constant in the script so a regeneration is reproducible, and log the row counts it wrote so a silently-empty parse is visible rather than committed.

Add an npm script: `"locations:generate": "tsx scripts/generate-us-locations.ts"`.

- [ ] **Step 2: Run the generator**

Run: `npm run locations:generate`
Expected output: 51 states and 19,654 cities. If either count is 0 or the state count is not 51, the parse is wrong — stop and report it. **Never hand-write or invent rows to make the counts match.**

- [ ] **Step 3: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCATION_CODE,
  getLanguageCode,
  resolveLabsLocationCode,
  US_SUBLOCATION_OPTIONS,
} from "./keyword-locations";

// Codes below are real values verified against the source CSV. Do not change
// them to make a failing implementation pass.
const TEXAS = 21176;
const DALLAS_TX = 1026339;
const DISTRICT_OF_COLUMBIA = 21140;

describe("US states", () => {
  // 51, because the District of Columbia is a targetable location.
  it("includes all 51 state-level locations", () => {
    expect(US_STATE_OPTIONS).toHaveLength(51);
  });

  it("includes the District of Columbia", () => {
    expect(US_STATE_OPTIONS.some((o) => o.code === DISTRICT_OF_COLUMBIA)).toBe(
      true,
    );
  });

  it("parents every state to the United States", () => {
    for (const option of US_STATE_OPTIONS) {
      expect(option.parentCode).toBe(DEFAULT_LOCATION_CODE);
    }
  });

  it("gives every state a unique code", () => {
    const codes = US_STATE_OPTIONS.map((o) => o.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("US cities", () => {
  it("loads every city without bundling them eagerly", async () => {
    const cities = await loadUsCityOptions();
    expect(cities).toHaveLength(19654);
  });

  // Cities hang off their state, NOT off the country.
  it("parents Dallas to Texas rather than to the country", async () => {
    const cities = await loadUsCityOptions();
    const dallas = cities.find((c) => c.code === DALLAS_TX);
    expect(dallas?.parentCode).toBe(TEXAS);
  });

  // Six US cities are called Dallas; a bare city name is ambiguous.
  it("disambiguates same-named cities in the label", async () => {
    const cities = await loadUsCityOptions();
    const dallases = cities.filter((c) => c.label.startsWith("Dallas"));
    expect(dallases.length).toBeGreaterThan(1);
    expect(new Set(dallases.map((c) => c.label)).size).toBe(dallases.length);
  });
});

describe("resolveLabsLocationCode", () => {
  it("passes a Labs-supported country through unchanged", () => {
    expect(resolveLabsLocationCode(DEFAULT_LOCATION_CODE)).toBe(
      DEFAULT_LOCATION_CODE,
    );
  });

  it("resolves a state up to its country", () => {
    expect(resolveLabsLocationCode(TEXAS)).toBe(DEFAULT_LOCATION_CODE);
  });

  // Two hops: city -> state -> country. A single-parent read fails this.
  it("walks a city all the way up to its country", () => {
    expect(resolveLabsLocationCode(DALLAS_TX)).toBe(DEFAULT_LOCATION_CODE);
  });

  it("falls back to the default for an unknown code", () => {
    expect(resolveLabsLocationCode(99999999)).toBe(DEFAULT_LOCATION_CODE);
  });
});

describe("getLanguageCode", () => {
  it("resolves a US city through its parent chain", () => {
    expect(getLanguageCode(DALLAS_TX)).toBe("en");
  });
});
```

**Where the resolver lives, and why it is not in `keyword-locations.ts`.**

`resolveLabsLocationCode` must be synchronous — it sits on a server request path and cannot `await` a dynamic import. It also needs the full city→parent map, which is the thing too big to ship to browsers.

Both constraints are satisfied by putting it on the server only. The 553 KB is a **client bundle** problem; a Worker bundle has no such pressure. So:

- `src/shared/us-cities.generated.ts` holds the full list.
- The **client** reaches it only through `loadUsCityOptions()`'s dynamic `import()`, which keeps it in its own chunk that loads when the picker opens.
- The **server** gets `resolveLabsLocationCode` in a new `src/server/lib/labs-location.ts` that imports the generated module statically. Server-only, so the size is irrelevant and the function stays synchronous.
- `keyword-locations.ts` therefore stays client-safe and gains only `US_STATE_OPTIONS` (1 KB) and `loadUsCityOptions`.

Put the `resolveLabsLocationCode` tests in `src/server/lib/labs-location.test.ts` and import from there, not from `./keyword-locations`.

**`getLanguageCode` needs no change.** Every sublocation in this task is American, and its existing `LOCATION_LANGUAGE[locationCode] ?? "en"` fallback already returns `"en"` for any code it does not know. Verify that with the test above rather than adding a chain walk that would do the same thing more slowly. Delete the `getLanguageCode` entry from this task's Interfaces list.

- [ ] **Step 4: Run the test and verify it fails, then implement, then verify it passes**

Run: `npx vitest run src/shared/keyword-locations.test.ts`

- [ ] **Step 5: Full gate and commit**

```bash
git add scripts/generate-us-locations.ts src/shared/ package.json
git commit -m "Generate US state and city location codes from DataForSEO"
```

---

### Task 9: City and state reach the pickers

**Files:**

- Modify: `src/client/components/LocationSelect.tsx`
- Modify: `src/client/features/content/ContentOptimizerPage.tsx`
- Modify: `src/server/features/content/services/ContentBriefService.ts`
- Modify: `src/server/features/serp/services/SerpOverviewService.ts` (only if it needs the resolver)

- [ ] **Step 1: Group the picker**

`LocationSelect` gains an optional `includeSubLocations?: boolean` (default `false`, so no existing caller changes behaviour). When true, the list renders three labelled groups — `Countries`, `United States — States`, `United States — Cities` — and the search box filters across all of them.

Three requirements specific to the city group, all of which follow from the data:

- **Load cities lazily.** Call `loadUsCityOptions()` when the menu first opens with `includeSubLocations`, not at module scope, or the 553 KB lands in the main bundle and defeats the whole arrangement. Show the countries and states immediately while it resolves; do not block the menu on it.
- **Label every city with its state.** Six US cities are named `Dallas`. A bare city name gives the user no way to pick the right one, and picking the wrong one silently returns a SERP for another state. Render `Dallas, Texas`.
- **Do not render 19,654 rows.** The existing list is unvirtualized. Cap the city group to the first ~50 matches and show `Keep typing to narrow…` when there are more, so an empty query cannot mount twenty thousand nodes. Verify the menu opens without jank.

- [ ] **Step 2: Split precise from resolved on the server**

In `ContentBriefService`, the SERP-derived leg passes the user's exact `locationCode`. The Labs `dataforseo.keywords.related` leg passes `resolveLabsLocationCode(locationCode)` from `@/server/lib/labs-location`. Add a comment stating why the two differ — a future reader will otherwise "fix" the inconsistency and start sending city codes to an endpoint that rejects them.

- [ ] **Step 3: Say so in the UI**

When a city or state is selected in Content Optimizer, render one muted line under the picker: `Ranking pages are specific to {label}; related terms are national.` Do not imply more precision than exists.

- [ ] **Step 4: Enable sublocations on Content Optimizer and SERP Overview**

Pass `includeSubLocations` on those two pickers only. Keyword Research stays country-only — Labs serves it and would reject a city code.

- [ ] **Step 5: Verify in the browser**

Search `dallas` in the Content Optimizer picker. Confirm all six Dallases appear, each distinguishable by state. Select `Dallas, Texas` (code `1026339`) and confirm from the network log that the SERP call carries `1026339` while the related-keywords call carries `2840`.

Also confirm from the Network panel that the city chunk is a **separate request made when the menu opens**, not part of the initial page load. If it is in the main bundle, Step 1's lazy load is not working regardless of what the code looks like.

- [ ] **Step 6: Full gate and commit**

Run: `npm run ci:check && npm run test`

```bash
git add src/client/components/LocationSelect.tsx src/client/features/content/ src/server/features/
git commit -m "Offer US cities and states where the SERP data supports them"
```

---

## Verification before claiming done

- [ ] `npm run ci:check` clean
- [ ] `npm run test` clean
- [ ] Network log shows exactly one metered call on a tab's first visit and **zero** on reload, for all five wired tabs
- [ ] `analyzeContentCompetitor` does not fire on a restored or auto-run Content Optimizer brief
- [ ] Keyword Research on a non-branded seed returns on-topic rows; any off-topic rows are counted and collapsed, not deleted
