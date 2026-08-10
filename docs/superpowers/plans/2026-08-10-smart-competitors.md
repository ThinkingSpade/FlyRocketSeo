# Smart Competitor Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Competitors tab find the domains that actually outrank a client on the
client's own Search Console queries, and stop making the user press Analyze when a paid result
is already cached.

**Architecture:** Seed discovery with the project's real GSC queries instead of its domain, send
that keyword list to DataForSEO's `serp_competitors` endpoint in one metered call, then rank
candidates by how many of those keywords they outrank the client on. Add a per-project
pin/exclude list so an agency can correct the answer once per client. Keep today's
domain-seeded path as a labelled fallback when GSC is unavailable.

**Tech Stack:** TanStack Start on Cloudflare Workers, Drizzle ORM over D1 (plus a Postgres
dialect kept in parity), Zod schemas, TanStack Query, Vitest, `dataforseo-client` SDK.

**Spec:** `docs/superpowers/specs/2026-08-10-smart-competitors-design.md` (commit `056df54`)

## Global Constraints

- **No automatic spend.** Metered calls only ever run behind `useMeteredQuery`'s `authorized`
  gate. Restores (D1 + R2 reads) are free and may run automatically. Before rendering anything
  from a restore, grep the subtree for sibling `useQuery` calls that would self-fetch.
- **Both dialects.** Every schema change lands in BOTH `src/db/app.schema.ts` and
  `src/db/pg/app.schema.ts`. Timestamps are `text` on both; write ISO strings from JS
  (`new Date().toISOString()`), never rely on a dialect default for a column you compare.
- **Market captured at authorization.** Location/language for metered calls come from
  `useCompetitorsRun`'s captured `market`, never read live from `useProjectMarket`.
- **Stored-shape compatibility.** `competitorsPageSchema` validates payloads restored from R2.
  New fields must be optional/nullable or every historical run becomes `unreadable`.
- **File size ceiling.** This repo splits modules that grow large (see
  `labs-competitors.ts`'s own header). Pure logic goes in its own file, not into
  `CompetitorsService.ts`.
- **No AI dependency.** `OPENROUTER_API_KEY` is unset in this deployment. Nothing in this plan
  may require an LLM call.
- Verification commands: `pnpm test` (vitest run) and `pnpm ci:check`
  (prettier + knip + tsc + oxlint). `ci:check` does NOT run tests — run both.
- **Every task must run `pnpm tsc --noEmit` before its commit, and must not
  claim a gate passed without having run it.** Vitest transpiles without
  typechecking, so a green `pnpm test` says nothing about whether the branch
  builds. This bit Task 1: adding Zod `.default()` fields makes them REQUIRED
  in the `z.infer` output type, which broke `CompetitorsService.ts`'s existing
  object literals while every test stayed green.
- **Every commit must build on its own.** When a change to a shared type
  breaks an existing producer, fix that producer in the same task with honest
  fallback values — do not defer it to the task that will later rewrite it.

---

### Task 1: Extend the competitor row shape without breaking restores

**Files:**

- Modify: `src/types/schemas/competitors.ts:92-115`
- Test: `src/types/schemas/competitors.test.ts` (create)

**Interfaces:**

- Consumes: nothing.
- Produces: `competitorRowSchema` gains optional `coverage: number | null`,
  `beatsYouCount: number | null`, `positionDelta: number | null`,
  `source: "serp" | "domain"` (optional, default `"domain"`), `pinned: boolean` (optional,
  default `false`). `CompetitorRow` type reflects these. Tasks 4, 6 and 9 consume this shape.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { competitorsPageSchema } from "./competitors";

describe("competitorsPageSchema", () => {
  it("still parses a run stored before the smart-discovery fields existed", () => {
    const legacy = {
      rows: [
        {
          domain: "vending.com",
          avgPosition: 12.6,
          intersections: 27,
          organicKeywords: 3865,
          organicTraffic: 215110,
        },
      ],
      totalCount: 9,
      fetchedAt: "2026-08-01T00:00:00.000Z",
    };

    const parsed = competitorsPageSchema.safeParse(legacy);

    expect(parsed.success).toBe(true);
    // A legacy row carries no discovery metrics, and must not pretend to.
    expect(parsed.data?.rows[0].beatsYouCount).toBeNull();
    expect(parsed.data?.rows[0].source).toBe("domain");
    expect(parsed.data?.rows[0].pinned).toBe(false);
    // Page-level explanation fields a legacy run predates.
    expect(parsed.data?.seedSize).toBe(0);
    expect(parsed.data?.hiddenCount).toBe(0);
    expect(parsed.data?.discoveryMode).toBe("domain");
  });

  it("parses a row produced by keyword-seeded discovery", () => {
    const parsed = competitorsPageSchema.safeParse({
      rows: [
        {
          domain: "avfusa.com",
          avgPosition: 4.2,
          intersections: null,
          organicKeywords: null,
          organicTraffic: 1200,
          coverage: 0.775,
          beatsYouCount: 31,
          positionDelta: -7.6,
          source: "serp",
          pinned: true,
        },
      ],
      totalCount: 1,
      fetchedAt: "2026-08-10T00:00:00.000Z",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.rows[0].beatsYouCount).toBe(31);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/types/schemas/competitors.test.ts`
Expected: FAIL — `beatsYouCount` is `undefined`, not `null`, and `source`/`pinned` are absent.

- [ ] **Step 3: Write minimal implementation**

Replace `competitorRowSchema` in `src/types/schemas/competitors.ts`:

```ts
/**
 * One competitor row, exactly as it is cached.
 *
 * The discovery fields below are optional with defaults rather than required:
 * this schema validates payloads restored from R2, so a run stored before
 * keyword-seeded discovery existed must still parse. A legacy row reports
 * `null` metrics and `source: "domain"` — which is true of it — instead of
 * becoming `unreadable` and vanishing from the tab's history.
 */
const competitorRowSchema = z.object({
  domain: z.string(),
  avgPosition: z.number().nullable(),
  intersections: z.number().nullable(),
  organicKeywords: z.number().nullable(),
  organicTraffic: z.number().nullable(),
  /** Share of the SEED keywords this domain ranks for, 0..1. */
  coverage: z.number().nullable().default(null),
  /** Seed keywords where this domain outranks the client. */
  beatsYouCount: z.number().nullable().default(null),
  /** median(their position) - median(client position); negative = ahead. */
  positionDelta: z.number().nullable().default(null),
  source: z.enum(["serp", "domain"]).default("domain"),
  pinned: z.boolean().default(false),
});
```

Then extend the page schema in the same file so the tab can explain its own answer. Task 9
renders all three, so they must survive a restore:

```ts
export const competitorsPageSchema = z.object({
  rows: z.array(competitorRowSchema),
  totalCount: z.number().nullable(),
  fetchedAt: z.string(),
  /** How many seed keywords the answer was drawn from. 0 on the fallback path. */
  seedSize: z.number().default(0),
  /** Domains suppressed by this project's exclusions — never hide silently. */
  hiddenCount: z.number().default(0),
  discoveryMode: z.enum(["serp", "domain"]).default("domain"),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/types/schemas/competitors.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/types/schemas/competitors.ts src/types/schemas/competitors.test.ts
git commit -m "Competitors: carry discovery metrics without breaking stored runs"
```

---

### Task 2: Build the keyword seed from Search Console

**Files:**

- Create: `src/server/features/competitors/competitorSeed.ts`
- Test: `src/server/features/competitors/competitorSeed.test.ts`

**Interfaces:**

- Consumes: nothing (pure).
- Produces:
  - `type SeedQuery = { keyword: string; impressions: number; selfPosition: number }`
  - `type CompetitorSeed = { keywords: SeedQuery[]; droppedBranded: number; totalConsidered: number }`
  - `buildCompetitorSeed(rows: SeedInputRow[], options: { brandTerms: string; limit?: number }): CompetitorSeed`
  - `type SeedInputRow = { key: string; impressions: number; position: number }` — deliberately
    the shape of `SearchPerformanceDimensionRow` from
    `src/server/features/gsc/searchPerformanceReport.ts`, so Task 6 can pass GSC rows straight in.
  - `COMPETITOR_SEED_SIZE = 40`, `MIN_COMPETITOR_SEED = 5`
- Tasks 4 and 6 consume all of the above.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  buildCompetitorSeed,
  COMPETITOR_SEED_SIZE,
  MIN_COMPETITOR_SEED,
} from "./competitorSeed";

const row = (key: string, impressions: number, position: number) => ({
  key,
  impressions,
  position,
});

describe("buildCompetitorSeed", () => {
  it("drops branded queries, which return the client and nobody else", () => {
    const seed = buildCompetitorSeed(
      [
        row("america vending", 900, 1.2),
        row("americavending reviews", 400, 2.0),
        row("office coffee service dallas", 300, 8.4),
      ],
      { brandTerms: "America Vending\nAmericaVending" },
    );

    expect(seed.keywords.map((k) => k.keyword)).toEqual([
      "office coffee service dallas",
    ]);
    expect(seed.droppedBranded).toBe(2);
  });

  it("prefers queries the client does not already own", () => {
    const seed = buildCompetitorSeed(
      [row("already first", 5000, 1.0), row("contested term", 100, 9.0)],
      { brandTerms: "" },
    );

    // Impressions alone would put "already first" on top; a query the client
    // already ranks #1 for cannot reveal a rival, so it sorts behind.
    expect(seed.keywords[0].keyword).toBe("contested term");
  });

  it("backfills with position-1 queries rather than returning a short seed", () => {
    const seed = buildCompetitorSeed(
      [
        row("contested", 100, 4.0),
        row("owned a", 90, 1.0),
        row("owned b", 80, 1.0),
      ],
      { brandTerms: "", limit: 3 },
    );

    expect(seed.keywords).toHaveLength(3);
    expect(seed.keywords[0].keyword).toBe("contested");
  });

  it("caps the seed at the configured limit, highest impressions first", () => {
    const rows = Array.from({ length: 60 }, (_, i) =>
      row(`kw ${i}`, 1000 - i, 5),
    );

    const seed = buildCompetitorSeed(rows, { brandTerms: "" });

    expect(seed.keywords).toHaveLength(COMPETITOR_SEED_SIZE);
    expect(seed.keywords[0].keyword).toBe("kw 0");
    expect(seed.totalConsidered).toBe(60);
  });

  it("carries the client's own position through for later comparison", () => {
    const seed = buildCompetitorSeed([row("contested", 100, 11.4)], {
      brandTerms: "",
    });

    expect(seed.keywords[0].selfPosition).toBe(11.4);
  });

  it("reports a seed too small to be representative", () => {
    const seed = buildCompetitorSeed([row("only one", 10, 4)], {
      brandTerms: "",
    });

    expect(seed.keywords.length).toBeLessThan(MIN_COMPETITOR_SEED);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/features/competitors/competitorSeed.test.ts`
Expected: FAIL — "Failed to resolve import ./competitorSeed"

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Chooses which keywords to ask "who outranks me on this?" about.
 *
 * Pure and provider-agnostic on purpose: the input row shape is
 * `SearchPerformanceDimensionRow`'s, so the orchestrator can pass GSC rows
 * straight in, but nothing here touches the network — which is what makes the
 * selection rules testable in a deployment with no API keys.
 */

/** Matches `SearchPerformanceDimensionRow` (gsc/searchPerformanceReport.ts). */
export type SeedInputRow = {
  key: string;
  impressions: number;
  position: number;
};

export type SeedQuery = {
  keyword: string;
  impressions: number;
  /** The client's own average position for this query, per GSC. */
  selfPosition: number;
};

export type CompetitorSeed = {
  keywords: SeedQuery[];
  droppedBranded: number;
  totalConsidered: number;
};

/** Keywords sent to `serp_competitors` in one request. */
export const COMPETITOR_SEED_SIZE = 40;

/**
 * Below this, the seed is not representative of the client's market and the
 * caller should fall back to domain-seeded discovery rather than pay for an
 * answer drawn from a handful of queries.
 */
export const MIN_COMPETITOR_SEED = 5;

function parseBrandTerms(brandTerms: string): string[] {
  return brandTerms
    .split("\n")
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length > 0);
}

function isBranded(keyword: string, terms: string[]): boolean {
  const haystack = keyword.toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

export function buildCompetitorSeed(
  rows: SeedInputRow[],
  options: { brandTerms: string; limit?: number },
): CompetitorSeed {
  const limit = options.limit ?? COMPETITOR_SEED_SIZE;
  const terms = parseBrandTerms(options.brandTerms);

  let droppedBranded = 0;
  const candidates: SeedQuery[] = [];
  for (const row of rows) {
    if (!row.key) continue;
    if (terms.length > 0 && isBranded(row.key, terms)) {
      droppedBranded += 1;
      continue;
    }
    candidates.push({
      keyword: row.key,
      impressions: row.impressions,
      selfPosition: row.position,
    });
  }

  const byImpressions = (a: SeedQuery, b: SeedQuery) =>
    b.impressions - a.impressions;

  // A query the client already ranks #1 for cannot surface a rival above them,
  // so it is only worth spending seed budget on once the contested queries run
  // out -- hence two tiers rather than one sort.
  const contested = candidates
    .filter((c) => c.selfPosition > 1.5)
    .sort(byImpressions);
  const owned = candidates
    .filter((c) => c.selfPosition <= 1.5)
    .sort(byImpressions);

  return {
    keywords: [...contested, ...owned].slice(0, limit),
    droppedBranded,
    totalConsidered: rows.length,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/features/competitors/competitorSeed.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/server/features/competitors/competitorSeed.ts src/server/features/competitors/competitorSeed.test.ts
git commit -m "Competitors: choose seed keywords from the client's own GSC queries"
```

---

### Task 3: Wrap the `serp_competitors` endpoint

**Files:**

- Modify: `src/server/lib/dataforseo/labs-competitors.ts` (append; follow `fetchCompetitorsDomain` at :45)
- Modify: `src/server/lib/dataforseo/client.ts:137-145` (the `competitors:` namespace)

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces:
  - `export type SerpCompetitorItem = DataforseoLabsSerpCompetitorsLiveItem`
  - `fetchSerpCompetitors(input: { keywords: string[]; locationCode: number; languageCode: string; limit: number; offset?: number; itemTypes?: DataforseoLabsItemType[]; filters?: unknown[]; orderBy?: string[] }): Promise<DataforseoApiResponse<{ items: SerpCompetitorItem[]; totalCount: number | null }>>`
  - Client access path: `dataforseo.competitors.serpCompetitors({...})`
- Task 6 consumes both.

- [ ] **Step 1: Add the SDK imports**

In `src/server/lib/dataforseo/labs-competitors.ts`, add to the existing `dataforseo-client`
import block:

```ts
  DataforseoLabsGoogleSerpCompetitorsLiveRequestInfo,
  type DataforseoLabsSerpCompetitorsLiveItem,
```

- [ ] **Step 2: Add the wrapper**

Append to `labs-competitors.ts`, matching the envelope handling every sibling uses:

```ts
export type SerpCompetitorItem = DataforseoLabsSerpCompetitorsLiveItem;

type SerpCompetitorsPage = {
  items: SerpCompetitorItem[];
  totalCount: number | null;
};

/**
 * Competitors discovered from a KEYWORD LIST rather than a domain.
 *
 * `competitors_domain` above answers "who shares ranked keywords with this
 * domain", which ranks by absolute overlap and therefore favours whichever
 * candidate has the largest keyword footprint. This endpoint answers "who
 * appears in the SERPs for these specific keywords", so the caller controls
 * the market being measured -- and each item carries `keywords_positions`,
 * the per-keyword ranks needed to say whether a domain actually outranks the
 * client.
 *
 * Callers MUST pass `itemTypes: ["organic"]`. The endpoint's default item
 * types include paid results, which would let a rival's AD placement count as
 * outranking the client's organic position. Billing (verified 2026-08-10):
 * $0.012 per task + $0.00012 per returned row, and the keyword array is ONE
 * task regardless of its length. Documented caps: 200 keywords, limit 1,000.
 */
export async function fetchSerpCompetitors(input: {
  keywords: string[];
  locationCode: number;
  languageCode: string;
  limit: number;
  offset?: number;
  itemTypes?: DataforseoLabsItemType[];
  filters?: unknown[];
  orderBy?: string[];
}): Promise<DataforseoApiResponse<SerpCompetitorsPage>> {
  const response = await labsApi().googleSerpCompetitorsLive([
    new DataforseoLabsGoogleSerpCompetitorsLiveRequestInfo({
      keywords: input.keywords,
      location_code: input.locationCode,
      language_code: input.languageCode,
      limit: input.limit,
      offset: input.offset,
      item_types: input.itemTypes,
      filters: input.filters,
      order_by: input.orderBy,
    }),
  ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  return {
    data: {
      items: task.result?.[0]?.items ?? [],
      totalCount: task.result?.[0]?.total_count ?? null,
    },
    billing: buildTaskBilling(task),
  };
}
```

- [ ] **Step 3: Expose it on the metered client**

In `src/server/lib/dataforseo/client.ts`, inside the `competitors: {` object (line ~137), add
alongside `domainCompetitors`:

```ts
      serpCompetitors: lazyMeter(customer, (f) => f.fetchSerpCompetitors),
```

- [ ] **Step 4: Verify the SDK method name and that it type-checks**

Run: `pnpm tsc --noEmit`
Expected: PASS.

If it fails on `googleSerpCompetitorsLive`, find the real method name — do not guess:

```bash
grep -rn "SerpCompetitorsLive" node_modules/dataforseo-client/dist/esm/*.d.ts | head
```

Use the name that file exports and re-run `pnpm tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/server/lib/dataforseo/labs-competitors.ts src/server/lib/dataforseo/client.ts
git commit -m "DataForSEO: wrap serp_competitors, which seeds from keywords"
```

---

### Task 4: Rank candidates by whether they beat the client

**Files:**

- Create: `src/server/features/competitors/rankSerpCompetitors.ts`
- Test: `src/server/features/competitors/rankSerpCompetitors.test.ts`

**Interfaces:**

- Consumes: `SeedQuery` (Task 2), `CompetitorRow` (Task 1), `SerpCompetitorItem` (Task 3).
- Produces:
  `rankSerpCompetitors(items: RankableItem[], seed: SeedQuery[], selfDomain: string): CompetitorRow[]`
  where `RankableItem = { domain?: string; avg_position?: number; median_position?: number; etv?: number; keywords_count?: number; keywords_positions?: Record<string, number[]> }`
  — structurally satisfied by `SerpCompetitorItem`, but declared locally so the test needs no SDK
  fixture. Task 6 consumes this.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { rankSerpCompetitors } from "./rankSerpCompetitors";
import type { SeedQuery } from "./competitorSeed";

const seed: SeedQuery[] = [
  {
    keyword: "vending machine service dallas",
    impressions: 500,
    selfPosition: 11,
  },
  { keyword: "office coffee service", impressions: 300, selfPosition: 8 },
  { keyword: "micro market provider", impressions: 100, selfPosition: 15 },
];

describe("rankSerpCompetitors", () => {
  it("counts the seed keywords a domain outranks the client on", () => {
    const [row] = rankSerpCompetitors(
      [
        {
          domain: "avfusa.com",
          keywords_count: 3,
          keywords_positions: {
            "vending machine service dallas": [4],
            "office coffee service": [2],
            "micro market provider": [20],
          },
        },
      ],
      seed,
      "americavending.com",
    );

    // Beats the client at 11 -> 4 and 8 -> 2, loses at 15 -> 20.
    expect(row.beatsYouCount).toBe(2);
  });

  it("measures coverage against the seed, not the competitor's own footprint", () => {
    const [row] = rankSerpCompetitors(
      [
        {
          domain: "webstaurantstore.com",
          keywords_count: 1,
          keywords_positions: { "office coffee service": [30] },
        },
      ],
      seed,
      "americavending.com",
    );

    expect(row.coverage).toBeCloseTo(1 / 3);
    expect(row.beatsYouCount).toBe(0);
  });

  it("ranks the domain that beats you most first", () => {
    const rows = rankSerpCompetitors(
      [
        {
          domain: "marketplace.com",
          keywords_positions: { "office coffee service": [30] },
        },
        {
          domain: "avfusa.com",
          keywords_positions: {
            "vending machine service dallas": [4],
            "office coffee service": [2],
          },
        },
      ],
      seed,
      "americavending.com",
    );

    expect(rows.map((r) => r.domain)).toEqual([
      "avfusa.com",
      "marketplace.com",
    ]);
  });

  it("excludes the client's own domain", () => {
    const rows = rankSerpCompetitors(
      [
        { domain: "americavending.com", keywords_positions: {} },
        { domain: "avfusa.com", keywords_positions: {} },
      ],
      seed,
      "americavending.com",
    );

    expect(rows.map((r) => r.domain)).toEqual(["avfusa.com"]);
  });

  it("keeps a domain with no position data instead of dropping it silently", () => {
    const [row] = rankSerpCompetitors(
      [{ domain: "unknown.com", keywords_count: 2 }],
      seed,
      "americavending.com",
    );

    expect(row.beatsYouCount).toBe(0);
    expect(row.positionDelta).toBeNull();
    expect(row.source).toBe("serp");
  });

  it("reports position delta against the client, negative when ahead", () => {
    const [row] = rankSerpCompetitors(
      [
        {
          domain: "avfusa.com",
          keywords_positions: {
            "vending machine service dallas": [4],
            "office coffee service": [2],
          },
        },
      ],
      seed,
      "americavending.com",
    );

    // median(their 2,4) = 3; median(client 8,11) = 9.5; delta = -6.5
    expect(row.positionDelta).toBeCloseTo(-6.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/features/competitors/rankSerpCompetitors.test.ts`
Expected: FAIL — "Failed to resolve import ./rankSerpCompetitors"

- [ ] **Step 3: Write minimal implementation**

```ts
import type { CompetitorRow } from "@/types/schemas/competitors";
import type { SeedQuery } from "./competitorSeed";

/**
 * The slice of a `serp_competitors` item this ranking reads.
 *
 * Declared structurally rather than importing the SDK item type so the tests
 * can build fixtures by hand -- and so a vendored-typing change cannot quietly
 * alter what this function is asserted to do.
 */
export type RankableItem = {
  domain?: string;
  avg_position?: number;
  median_position?: number;
  etv?: number;
  keywords_count?: number;
  /** keyword -> that domain's rank(s) for it. */
  keywords_positions?: Record<string, number[]>;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/** Best (lowest) rank a domain holds for one keyword, or null if absent. */
function bestPosition(positions: number[] | undefined): number | null {
  if (!positions || positions.length === 0) return null;
  return Math.min(...positions);
}

/**
 * Ranks discovery candidates by whether they actually beat the client.
 *
 * `beatsYouCount` is the headline: the number of SEED keywords where the
 * candidate outranks the client's own GSC position. It is what demotes a
 * marketplace that ranks for everything at position 30 -- no relevance
 * classifier required, which matters because this deployment has no LLM key.
 *
 * `coverage`'s denominator is the SEED, not the candidate's total keyword
 * count. The old tab divided by the candidate's own footprint, which is why
 * every row read "1% keyword overlap" and carried no information.
 */
export function rankSerpCompetitors(
  items: RankableItem[],
  seed: SeedQuery[],
  selfDomain: string,
): CompetitorRow[] {
  const self = selfDomain.toLowerCase();

  const rows = items.flatMap((item): CompetitorRow[] => {
    const domain = item.domain?.toLowerCase();
    if (!domain || domain === self) return [];

    const theirPositions: number[] = [];
    const clientPositions: number[] = [];
    let beatsYouCount = 0;
    let matched = 0;

    for (const entry of seed) {
      const theirs = bestPosition(item.keywords_positions?.[entry.keyword]);
      if (theirs == null) continue;
      matched += 1;
      theirPositions.push(theirs);
      clientPositions.push(entry.selfPosition);
      if (theirs < entry.selfPosition) beatsYouCount += 1;
    }

    const theirMedian = median(theirPositions);
    const clientMedian = median(clientPositions);

    return [
      {
        domain,
        avgPosition: item.avg_position ?? null,
        // Only meaningful for the domain-overlap endpoint; this path has none
        // and says so rather than inventing a number.
        intersections: null,
        organicKeywords: item.keywords_count ?? null,
        organicTraffic: item.etv ?? null,
        coverage: seed.length > 0 ? matched / seed.length : null,
        beatsYouCount,
        positionDelta:
          theirMedian != null && clientMedian != null
            ? theirMedian - clientMedian
            : null,
        source: "serp",
        pinned: false,
      },
    ];
  });

  return rows.sort((a, b) => {
    const beats = (b.beatsYouCount ?? 0) - (a.beatsYouCount ?? 0);
    if (beats !== 0) return beats;
    return (b.coverage ?? 0) - (a.coverage ?? 0);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/features/competitors/rankSerpCompetitors.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/server/features/competitors/rankSerpCompetitors.ts src/server/features/competitors/rankSerpCompetitors.test.ts
git commit -m "Competitors: rank by who outranks the client, not by raw overlap"
```

---

### Task 5: Per-project pinned and excluded competitors

**Files:**

- Modify: `src/db/app.schema.ts` (append near `projectProfiles`, ~line 851)
- Modify: `src/db/pg/app.schema.ts` (parity)
- Create: `src/server/features/competitors/repositories/ProjectCompetitorRepository.ts`
- Create: `drizzle/0039_*.sql` + `drizzle-pg/` counterpart (generated, not hand-written)
- Test: `src/server/features/competitors/applyProjectCompetitors.test.ts`
- Create: `src/server/features/competitors/applyProjectCompetitors.ts`

**Interfaces:**

- Consumes: `CompetitorRow` (Task 1).
- Produces:
  - Table `projectCompetitors` with columns `id, projectId, domain, status, note, createdAt, updatedAt`
  - `ProjectCompetitorRepository.listByProject(projectId): Promise<ProjectCompetitorRow[]>`
  - `ProjectCompetitorRepository.upsert(input: { projectId; domain; status; note }): Promise<void>`
  - `ProjectCompetitorRepository.remove(input: { projectId; domain }): Promise<void>`
  - `applyProjectCompetitors(rows: CompetitorRow[], overrides: ProjectCompetitorRow[]): { rows: CompetitorRow[]; hiddenCount: number }`
- Tasks 6, 7 and 9 consume these.

- [ ] **Step 1: Write the failing test for the pure part**

```ts
import { describe, expect, it } from "vitest";
import { applyProjectCompetitors } from "./applyProjectCompetitors";
import type { CompetitorRow } from "@/types/schemas/competitors";

const row = (domain: string, beatsYouCount: number): CompetitorRow => ({
  domain,
  avgPosition: null,
  intersections: null,
  organicKeywords: null,
  organicTraffic: null,
  coverage: null,
  beatsYouCount,
  positionDelta: null,
  source: "serp",
  pinned: false,
});

const override = (domain: string, status: "pinned" | "excluded") => ({
  id: `id-${domain}`,
  projectId: "p1",
  domain,
  status,
  note: "",
  createdAt: "2026-08-10T00:00:00.000Z",
  updatedAt: "2026-08-10T00:00:00.000Z",
});

describe("applyProjectCompetitors", () => {
  it("removes excluded domains and counts them", () => {
    const result = applyProjectCompetitors(
      [row("avfusa.com", 30), row("webstaurantstore.com", 0)],
      [override("webstaurantstore.com", "excluded")],
    );

    expect(result.rows.map((r) => r.domain)).toEqual(["avfusa.com"]);
    expect(result.hiddenCount).toBe(1);
  });

  it("marks a discovered domain as pinned and moves it to the top", () => {
    const result = applyProjectCompetitors(
      [row("bigrival.com", 30), row("avfusa.com", 5)],
      [override("avfusa.com", "pinned")],
    );

    expect(result.rows[0].domain).toBe("avfusa.com");
    expect(result.rows[0].pinned).toBe(true);
  });

  it("adds a pinned domain discovery missed, without inventing metrics", () => {
    const result = applyProjectCompetitors(
      [row("bigrival.com", 30)],
      [override("vendingexchange.com", "pinned")],
    );

    const added = result.rows.find((r) => r.domain === "vendingexchange.com");
    expect(added).toBeDefined();
    expect(added?.pinned).toBe(true);
    // Never fabricate numbers for a domain the vendor did not return.
    expect(added?.beatsYouCount).toBeNull();
    expect(added?.coverage).toBeNull();
  });

  it("lets exclusion win when a domain is somehow both", () => {
    const result = applyProjectCompetitors(
      [row("x.com", 5)],
      [override("x.com", "pinned"), override("x.com", "excluded")],
    );

    expect(result.rows).toHaveLength(0);
    expect(result.hiddenCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/features/competitors/applyProjectCompetitors.test.ts`
Expected: FAIL — "Failed to resolve import ./applyProjectCompetitors"

- [ ] **Step 3: Add the table to BOTH schema files**

`src/db/app.schema.ts` (D1/SQLite) — place after `projectProfiles`:

```ts
/**
 * An operator's standing corrections to competitor discovery, per project.
 *
 * Discovery is a heuristic over one keyword seed; an agency running many
 * clients knows things it cannot. A pinned domain is always shown (and
 * labelled as pinned, never passed off as a discovery result); an excluded
 * one never is. Scoped per project so one account holds a different list per
 * client.
 */
export const projectCompetitors = sqliteTable(
  "project_competitors",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Normalized via normalizeDomainInput before it ever reaches here. */
    domain: text("domain").notNull(),
    status: text("status", { enum: ["pinned", "excluded"] }).notNull(),
    /** Why, in the operator's own words. Shown back to them. */
    note: text("note").notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("project_competitors_project_domain_idx").on(
      table.projectId,
      table.domain,
    ),
  ],
);
```

Mirror it in `src/db/pg/app.schema.ts` using that file's own helpers (`pgTable`,
`timestampColumn`) — copy the shape of `projectProfiles` there, which is the adjacent
precedent. Read that file's header on `timestampColumn` before writing the timestamps.

- [ ] **Step 4: Generate the migrations**

Run: `pnpm db:generate`
Expected: creates `drizzle/0039_*.sql` and the `drizzle-pg/` counterpart. Do NOT hand-write them.

Inspect the generated SQL and confirm it creates the table and the unique index:

```bash
cat drizzle/0039_*.sql
```

- [ ] **Step 5: Write the repository**

`src/server/features/competitors/repositories/ProjectCompetitorRepository.ts`:

```ts
/**
 * Data access for `project_competitors` (src/db/app.schema.ts and its pg
 * twin). Every write normalizes the domain through the same helper the
 * discovery path uses, so a pinned "AVFUSA.com" and a discovered "avfusa.com"
 * are the same row.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projectCompetitors } from "@/db/schema";
import { normalizeDomainInput } from "@/server/lib/domainUtils";

export type ProjectCompetitorRow = typeof projectCompetitors.$inferSelect;
export type ProjectCompetitorStatus = "pinned" | "excluded";

async function listByProject(
  projectId: string,
): Promise<ProjectCompetitorRow[]> {
  return db
    .select()
    .from(projectCompetitors)
    .where(eq(projectCompetitors.projectId, projectId));
}

async function upsert(input: {
  projectId: string;
  domain: string;
  status: ProjectCompetitorStatus;
  note?: string;
}): Promise<void> {
  const domain = normalizeDomainInput(input.domain, true);
  const now = new Date().toISOString();
  await db
    .insert(projectCompetitors)
    .values({
      id: crypto.randomUUID(),
      projectId: input.projectId,
      domain,
      status: input.status,
      note: input.note ?? "",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [projectCompetitors.projectId, projectCompetitors.domain],
      set: { status: input.status, note: input.note ?? "", updatedAt: now },
    });
}

async function remove(input: {
  projectId: string;
  domain: string;
}): Promise<void> {
  const domain = normalizeDomainInput(input.domain, true);
  await db
    .delete(projectCompetitors)
    .where(
      and(
        eq(projectCompetitors.projectId, input.projectId),
        eq(projectCompetitors.domain, domain),
      ),
    );
}

export const ProjectCompetitorRepository = { listByProject, upsert, remove };
```

- [ ] **Step 6: Write the pure override applier**

`src/server/features/competitors/applyProjectCompetitors.ts`:

```ts
import type { CompetitorRow } from "@/types/schemas/competitors";
import type { ProjectCompetitorRow } from "./repositories/ProjectCompetitorRepository";

/**
 * Folds an operator's standing corrections into a discovery result.
 *
 * A pinned domain discovery missed is added with NULL metrics rather than
 * zeros: we have no measurement for it, and a zero would read as "this rival
 * beats you on nothing", which is a different and false claim.
 */
export function applyProjectCompetitors(
  rows: CompetitorRow[],
  overrides: ProjectCompetitorRow[],
): { rows: CompetitorRow[]; hiddenCount: number } {
  const excluded = new Set(
    overrides.filter((o) => o.status === "excluded").map((o) => o.domain),
  );
  // Exclusion wins over pinning: it is the more specific instruction, and a
  // domain in both states is an operator mistake we must not resolve loudly.
  const pinned = new Set(
    overrides
      .filter((o) => o.status === "pinned" && !excluded.has(o.domain))
      .map((o) => o.domain),
  );

  const kept: CompetitorRow[] = [];
  let hiddenCount = 0;
  const seen = new Set<string>();

  for (const row of rows) {
    if (excluded.has(row.domain)) {
      hiddenCount += 1;
      continue;
    }
    seen.add(row.domain);
    kept.push(pinned.has(row.domain) ? { ...row, pinned: true } : row);
  }

  for (const domain of pinned) {
    if (seen.has(domain)) continue;
    kept.push({
      domain,
      avgPosition: null,
      intersections: null,
      organicKeywords: null,
      organicTraffic: null,
      coverage: null,
      beatsYouCount: null,
      positionDelta: null,
      source: "serp",
      pinned: true,
    });
  }

  kept.sort((a, b) => Number(b.pinned) - Number(a.pinned));
  return { rows: kept, hiddenCount };
}
```

- [ ] **Step 7: Run tests and type-check**

Run: `pnpm vitest run src/server/features/competitors/applyProjectCompetitors.test.ts`
Expected: PASS (4 tests)

Run: `pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/db/app.schema.ts src/db/pg/app.schema.ts drizzle drizzle-pg src/server/features/competitors
git commit -m "Competitors: per-project pinned and excluded domains"
```

---

### Task 6: Orchestrate seed -> discovery -> ranking, with fallback

**Files:**

- Modify: `src/server/features/competitors/services/CompetitorsService.ts:67-153`
- Test: `src/server/features/competitors/resolveDiscoveryMode.test.ts`
- Create: `src/server/features/competitors/resolveDiscoveryMode.ts`

**Interfaces:**

- Consumes: `buildCompetitorSeed`, `MIN_COMPETITOR_SEED` (Task 2);
  `dataforseo.competitors.serpCompetitors` (Task 3); `rankSerpCompetitors` (Task 4);
  `ProjectCompetitorRepository.listByProject`, `applyProjectCompetitors` (Task 5).
- Produces: `getCompetitors` returns a `CompetitorsPage` whose rows carry the new fields, plus
  `resolveDiscoveryMode(seedSize: number, hasGscConnection: boolean): "serp" | "domain"`.
  Task 9 renders the mode.

- [ ] **Step 1: Write the failing test for the decision rule**

```ts
import { describe, expect, it } from "vitest";
import { resolveDiscoveryMode } from "./resolveDiscoveryMode";

describe("resolveDiscoveryMode", () => {
  it("uses keyword-seeded discovery when the seed is representative", () => {
    expect(resolveDiscoveryMode(40, true)).toBe("serp");
  });

  it("falls back when Search Console is not connected", () => {
    expect(resolveDiscoveryMode(0, false)).toBe("domain");
  });

  it("falls back rather than paying for an answer from a handful of queries", () => {
    expect(resolveDiscoveryMode(3, true)).toBe("domain");
  });

  it("treats exactly the minimum seed as representative", () => {
    expect(resolveDiscoveryMode(5, true)).toBe("serp");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/features/competitors/resolveDiscoveryMode.test.ts`
Expected: FAIL — "Failed to resolve import ./resolveDiscoveryMode"

- [ ] **Step 3: Implement the decision rule**

```ts
import { MIN_COMPETITOR_SEED } from "./competitorSeed";

export type DiscoveryMode = "serp" | "domain";

/**
 * Which discovery path to run.
 *
 * Keyword-seeded discovery is strictly better when we have a real seed, but a
 * seed of three queries describes no market -- paying for that answer would be
 * worse than the domain-overlap fallback AND more expensive, so the floor is a
 * money decision as much as a quality one.
 */
export function resolveDiscoveryMode(
  seedSize: number,
  hasGscConnection: boolean,
): DiscoveryMode {
  if (!hasGscConnection) return "domain";
  return seedSize >= MIN_COMPETITOR_SEED ? "serp" : "domain";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/features/competitors/resolveDiscoveryMode.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire the orchestration into `getCompetitors`**

In `CompetitorsService.ts`, inside `getCompetitors`, AFTER the existing cache read
(`if (cached.success && ...) return cached.data;` at :115-119) and BEFORE the existing
`dataforseo.competitors.domainCompetitors(...)` call at :122.

Add these imports at the top of the file:

```ts
import { GscService } from "@/server/features/gsc/services/GscService";
import { toDimensionRows } from "@/server/features/gsc/searchPerformanceReport";
import { ProjectProfileRepository } from "@/server/features/keywords/repositories/ProjectProfileRepository";
import { ProjectCompetitorRepository } from "@/server/features/competitors/repositories/ProjectCompetitorRepository";
import { buildCompetitorSeed } from "@/server/features/competitors/competitorSeed";
import { rankSerpCompetitors } from "@/server/features/competitors/rankSerpCompetitors";
import { applyProjectCompetitors } from "@/server/features/competitors/applyProjectCompetitors";
import { resolveDiscoveryMode } from "@/server/features/competitors/resolveDiscoveryMode";
```

**Before writing this step, confirm two things by reading the code — do not assume:**

1. The exact exported name and read method for the business profile. Run
   `grep -rn "projectProfiles" src/server/features --include=*.ts | grep -i repos` and use what
   you find; the import above is the expected name, not a verified one. If the profile is read
   through a service instead, use that.
2. The exact shape of `GscPerformanceInput`. Run
   `grep -rn "GscPerformanceInput" src --include=*.ts | head` and read the type, then build the
   argument to match it.

Then add, inside `getCompetitors`:

```ts
// Free inputs first: a seed costs nothing, and its size decides whether the
// metered keyword-seeded call is worth making at all.
const [profile, overrides] = await Promise.all([
  ProjectProfileRepository.getByProject(input.projectId),
  ProjectCompetitorRepository.listByProject(input.projectId),
]);

let seedKeywords: ReturnType<typeof buildCompetitorSeed>["keywords"] = [];
let hasGsc = false;
try {
  const performance = await GscService.getPerformance({
    projectId: input.projectId,
    dimensions: ["query"],
    dateRange: "last28days",
    rowLimit: 500,
  });
  hasGsc = true;
  seedKeywords = buildCompetitorSeed(toDimensionRows(performance.rows), {
    brandTerms: profile?.brandTerms ?? "",
  }).keywords;
} catch {
  // No connection, revoked grant, or an API failure: all mean "no seed".
  // The fallback below is a real answer, so this must not fail the request.
  hasGsc = false;
}

const mode = resolveDiscoveryMode(seedKeywords.length, hasGsc);

if (mode === "serp") {
  const response = await dataforseo.competitors.serpCompetitors({
    keywords: seedKeywords.map((k) => k.keyword),
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
    // Organic only. The endpoint's default includes paid results, which
    // would let a rival's AD placement count as outranking the client's
    // organic GSC position and inflate every beats-you count.
    itemTypes: ["organic"],
  });

  const ranked = rankSerpCompetitors(response.items, seedKeywords, target);
  const applied = applyProjectCompetitors(ranked, overrides);

  const result: CompetitorsPage = {
    rows: applied.rows,
    totalCount: response.totalCount,
    fetchedAt: new Date().toISOString(),
    seedSize: seedKeywords.length,
    hiddenCount: applied.hiddenCount,
    discoveryMode: "serp",
  };

  if (applied.rows.length > 0) {
    void setCached(cacheKey, result, COMPETITORS_TTL_SECONDS).catch((error) => {
      console.error("competitors.list.cache-write failed:", error);
    });
    await recordRun();
  }

  return result;
}
```

The existing `domainCompetitors` block below stays as the fallback. Add the override pass to it
too, so pin/exclude works on both paths — replace its `const rows = response.items...` chain's
result with:

```ts
const applied = applyProjectCompetitors(rows, overrides);
```

and use `applied.rows` when building `result`, adding the same three page fields with
`seedSize: 0`, `hiddenCount: applied.hiddenCount`, `discoveryMode: "domain"`.

- [ ] **Step 6: Confirm the location code is the project's target area, not a national default**

This decides whether a regional operator is measured against its own metro. The spec requires the
confirmed `project_target_areas` row; the request currently carries `input.locationCode`, which
originates from `useProjectMarket` and is NOT verified to be the same thing.

Run: `grep -rn "useProjectMarket" src/client/hooks/useProjectDomain.ts` and read what it resolves
`locationCode` from.

- If it already resolves through the confirmed target area, add a one-line comment saying so and
  move on.
- If it falls back to a country default (2840) while a confirmed target area exists, that is the
  fix: thread the target area through, following how `SerpOverviewPage.tsx` and
  `TrendsPage.tsx` use `useTargetAreaScope` + `resolveRunGeo` and capture geo at authorization.

Do not skip this. `competitorsListRequestSchema` defaults `locationCode` to `2840`, so a silent
national default is the likely current behaviour, and it would keep the real local rivals out of
the results no matter how good the ranking is.

- [ ] **Step 7: Move `const dataforseo = createDataforseoClient(billingCustomer);` above the new block**

It currently sits at :121, below where the new code needs it. Move that single line to just
after the cache-read early return.

- [ ] **Step 8: Verify**

Run: `pnpm tsc --noEmit`
Expected: PASS
Run: `pnpm test`
Expected: PASS — all existing competitor tests still green.

- [ ] **Step 9: Commit**

```bash
git add src/server/features/competitors
git commit -m "Competitors: discover from GSC keywords, fall back to domain overlap"
```

---

### Task 7: Server functions for pin and exclude

**Files:**

- Modify: `src/types/schemas/competitors.ts` (append request schemas)
- Modify: `src/serverFunctions/competitors.ts` (append; follow the pattern at :10-21)

**Interfaces:**

- Consumes: `ProjectCompetitorRepository` (Task 5).
- Produces: `listProjectCompetitors`, `setProjectCompetitor`, `removeProjectCompetitor` server
  functions. Task 9 consumes them.

- [ ] **Step 1: Add the request schemas**

Append to `src/types/schemas/competitors.ts`:

```ts
export const projectCompetitorListRequestSchema = z.object({
  projectId: z.string().uuid(),
});

export const projectCompetitorSetRequestSchema = z.object({
  projectId: z.string().uuid(),
  domain: domainField,
  status: z.enum(["pinned", "excluded"]),
  note: z.string().max(280).default(""),
});

export const projectCompetitorRemoveRequestSchema = z.object({
  projectId: z.string().uuid(),
  domain: domainField,
});
```

- [ ] **Step 2: Add the server functions**

Append to `src/serverFunctions/competitors.ts`:

```ts
export const listProjectCompetitors = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectCompetitorListRequestSchema)
  .handler(async ({ context }) => {
    return ProjectCompetitorRepository.listByProject(context.projectId);
  });

export const setProjectCompetitor = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectCompetitorSetRequestSchema)
  .handler(async ({ data, context }) => {
    await ProjectCompetitorRepository.upsert({
      projectId: context.projectId,
      domain: data.domain,
      status: data.status,
      note: data.note,
    });
    return ProjectCompetitorRepository.listByProject(context.projectId);
  });

export const removeProjectCompetitor = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectCompetitorRemoveRequestSchema)
  .handler(async ({ data, context }) => {
    await ProjectCompetitorRepository.remove({
      projectId: context.projectId,
      domain: data.domain,
    });
    return ProjectCompetitorRepository.listByProject(context.projectId);
  });
```

Add the matching imports at the top of the file (the three schemas, and
`ProjectCompetitorRepository`).

Note each mutation returns the fresh list, so the client updates from the server's answer rather
than guessing at the new state.

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/types/schemas/competitors.ts src/serverFunctions/competitors.ts
git commit -m "Competitors: server functions to pin and exclude per project"
```

---

### Task 8: Make a cached run show up without pressing Analyze

**Files:**

- Modify: `src/client/features/competitors/CompetitorsPage.tsx:98-135`
- Test: `src/client/features/competitors/shouldAdoptRestoredRun.test.ts`
- Create: `src/client/features/competitors/shouldAdoptRestoredRun.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `shouldAdoptRestoredRun(input: { target: string; restoredLabel: string | null }): boolean`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { shouldAdoptRestoredRun } from "./shouldAdoptRestoredRun";

describe("shouldAdoptRestoredRun", () => {
  it("adopts the last run when no target is set yet", () => {
    expect(
      shouldAdoptRestoredRun({
        target: "",
        restoredLabel: "americavending.com",
      }),
    ).toBe(true);
  });

  it("adopts a run for the target currently being viewed", () => {
    expect(
      shouldAdoptRestoredRun({
        target: "AmericaVending.com",
        restoredLabel: "americavending.com",
      }),
    ).toBe(true);
  });

  it("refuses a run belonging to a different client's domain", () => {
    expect(
      shouldAdoptRestoredRun({
        target: "deliotx.com",
        restoredLabel: "americavending.com",
      }),
    ).toBe(false);
  });

  it("is false when there is nothing restored", () => {
    expect(
      shouldAdoptRestoredRun({ target: "deliotx.com", restoredLabel: null }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/client/features/competitors/shouldAdoptRestoredRun.test.ts`
Expected: FAIL — "Failed to resolve import ./shouldAdoptRestoredRun"

- [ ] **Step 3: Implement**

```ts
/**
 * Whether a restored run may be rendered for the target on screen.
 *
 * Restoring is free (a D1 row plus the R2 object that run already paid for),
 * so the old gate -- restore ONLY when no target is set -- bought nothing and
 * cost the user a paid click every visit: the target input is prefilled from
 * the project domain, so a target was almost always present and the restore
 * almost never ran.
 *
 * The real constraint is narrower, and it is about correctness rather than
 * money: never show one client's cached run under another client's domain.
 */
export function shouldAdoptRestoredRun(input: {
  target: string;
  restoredLabel: string | null;
}): boolean {
  if (!input.restoredLabel) return false;
  const target = input.target.trim().toLowerCase();
  if (target === "") return true;
  return target === input.restoredLabel.trim().toLowerCase();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/client/features/competitors/shouldAdoptRestoredRun.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Re-gate the restore in `CompetitorsPage.tsx`**

Replace the `useAutoRestoredRun` call at :99-105:

```tsx
// Restoring reads a stored row plus the R2 object that run already paid for
// and can never trigger a metered fetch, so it runs whenever this tab has no
// live result -- not only when the target box is empty, which was almost
// never true and is what forced a paid click on every visit.
const { restored, outcome, expired } = useAutoRestoredRun({
  projectId,
  feature: RUN_FEATURES.competitors,
  schema: competitorsPageSchema,
  enabled: tab === "competitors",
  runId: selectedRunId,
});
```

Replace the `restoredRun` derivation at :133:

```tsx
const adoptable =
  competitorsQuery.data == null &&
  shouldAdoptRestoredRun({ target, restoredLabel: restored?.label ?? null });
const restoredRun = adoptable ? restored : null;
const competitorRows =
  competitorsQuery.data?.rows ??
  (adoptable ? restored?.result.rows : null) ??
  [];
```

Update the `hasResult` flag passed to `TabBody` (:379) to use `adoptable`:

```tsx
            hasResult: competitorsQuery.data != null || adoptable,
```

- [ ] **Step 6: Say when a run expired instead of showing a first-use prompt**

Add above the `AnalyzeDomainPrompt` block (:302), and add `&& outcome !== "expired"` to that
block's own condition so the two cannot both render:

```tsx
{
  outcome === "expired" && expired ? (
    <Banner variant="warning" className="text-sm">
      Your last run for {expired.label} (
      {new Date(expired.lastRanAt).toLocaleDateString()}) has expired — saved
      results are kept for 7 days. Run it again to see current data.
    </Banner>
  ) : null;
}
```

- [ ] **Step 7: Verify no sibling component self-fetches off the restored target**

This is the no-auto-spend trap. Run:

```bash
grep -rn "useQuery\|useMeteredQuery" src/client/features/competitors/
```

Confirm every metered hook is gated on `authorized`. `CompetitorsOverviewExtras` renders from a
restore (:330) — read it and confirm it does not fetch on its own. If it does, gate it on
`competitorsQuery.data != null` so a restore never triggers spend.

- [ ] **Step 8: Verify**

Run: `pnpm test`
Expected: PASS
Run: `pnpm ci:check`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/client/features/competitors
git commit -m "Competitors: show the cached run instead of demanding a paid click"
```

---

### Task 9: Surface the new answer in the table

**Files:**

- Modify: `src/client/features/competitors/CompetitorsTable.tsx`
- Modify: `src/client/features/competitors/CompetitorsPage.tsx` (seed disclosure + hidden count)

**Interfaces:**

- Consumes: `CompetitorRow`'s new fields (Task 1); the server functions from Task 7.
- Produces: no new exports.

- [ ] **Step 1: Read the table before changing it**

Run: `cat src/client/features/competitors/CompetitorsTable.tsx`

Match its existing column definition style exactly — do not restructure it.

- [ ] **Step 2: Replace the misleading overlap column**

Remove the "N% keyword overlap" sub-caption under Shared Keywords. It divides by the
competitor's own keyword count, so it always reads 0–1% and tells the user nothing.

Add three columns, rendered only when `row.source === "serp"`:

- **Beats you on** — `{row.beatsYouCount} of {seedSize}`. This is the primary column; place it
  immediately after Competitor.
- **Coverage** — `{Math.round((row.coverage ?? 0) * 100)}%`, sub-captioned "of your keywords".
- **vs you** — `row.positionDelta`, formatted with an explicit sign
  (`-7.6` reads as "7.6 positions ahead of you"). Render `—` when null.

For a row where the value is `null`, render `—`, never `0`. A pinned domain discovery missed has
no measurement, and `0` would assert something false.

- [ ] **Step 3: Mark pinned rows**

For `row.pinned`, render a muted `Pin` glyph from lucide before the domain — a bare muted glyph,
no chip or badge (this repo's icon rule). Add a row action to pin/unpin and to exclude, calling
`setProjectCompetitor` / `removeProjectCompetitor` and invalidating the competitors query.

- [ ] **Step 4: Disclose the seed and the hidden count in `CompetitorsPage.tsx`**

Under the results header, when `source === "serp"`, render a line the user can audit:

> Based on the top {seedSize} Search Console queries you don't already rank #1 for.

When the fallback ran, say so plainly instead:

> Based on domains sharing keywords with you — connect Search Console for a sharper answer.

When `hiddenCount > 0`, render "{hiddenCount} domains hidden" with a control to manage them, so
an exclusion is never invisible.

- [ ] **Step 5: Verify in the running app**

Start the dev server via the preview tool (NOT `pnpm dev` in a shell) and open the Competitors
tab for a project with GSC connected. Confirm: the table renders, the seed line appears, and no
metered request fires on load (check the network panel — a page load must produce no
`getCompetitorsList` POST until Analyze is pressed).

- [ ] **Step 6: Verify**

Run: `pnpm ci:check`
Expected: PASS
Run: `pnpm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/client/features/competitors
git commit -m "Competitors: show who beats you, on how many of your keywords"
```

---

### Task 10: Acceptance — prove it finds the real rivals

**Files:** none (verification only)

- [ ] **Step 1: Full check**

Run: `pnpm ci:check && pnpm test`
Expected: both PASS. Do not proceed on a failure — fix it first.

- [ ] **Step 2: Apply the migration to the local database**

Follow the repo's existing local-D1 procedure (see `runbooks/`). Confirm the table exists:

```bash
npx wrangler d1 execute open-seo --local --command "SELECT name FROM sqlite_master WHERE name='project_competitors'"
```

- [ ] **Step 3: Run the real acceptance test**

On the **AmericaVending.com** project, press Analyze on the Competitors tab.

Expected, per the spec's acceptance criterion:

- vendingexchange.com and/or avfusa.com appear in the results.
- webstaurantstore.com either drops out or shows a beats-you count at or near zero.
- The "Beats you on" column is populated with counts out of the seed size.

**This is a paid run — one metered call. Record the actual cost** from the billing captured by
`buildTaskBilling` and write it into the spec's cost section, replacing the `UNVERIFIED` note.

- [ ] **Step 4: If the real rivals still do not appear**

Do NOT tune the ranking until you know which half failed. Log the resolved seed and the raw
vendor response, then determine:

- Did the seed contain the queries those rivals compete on? If not, the seed rules are wrong
  (Task 2).
- Did the vendor return them at all? If not, the request is wrong — check `location_code`
  against the project's confirmed target area, since a national code will not surface a
  regional operator.
- Did ranking sort them down? Then the ranking is wrong (Task 4).

Report which one it was rather than adjusting weights until the output looks right.

- [ ] **Step 5: Pin and exclude round-trip**

Pin `vendingexchange.com` and exclude `webstaurantstore.com`. Reload the tab. Confirm the pin
persists at the top with a pin glyph, the exclusion persists with a visible hidden count, and
neither action triggered a metered call.

- [ ] **Step 6: Restore round-trip — the original complaint**

Navigate away from Competitors and back. Confirm the previous run renders **without pressing
Analyze**, and that no `getCompetitorsList` POST fires on load.

- [ ] **Step 7: Commit and open the PR**

```bash
git add -u
git commit -m "Competitors: record verified discovery cost"
```

```bash
gh pr create --repo ThinkingSpade/FlyRocketSeo --title "Smart competitor discovery" --body "$(cat <<'EOF'
The Competitors tab was seeded by the project domain alone, so it ranked candidates by absolute
keyword overlap — putting a 685k-keyword retailer above every real rival, and making a competitor
who outranks the client without sharing indexed keywords impossible to surface.

Discovery is now seeded by the client's own Search Console queries (branded terms stripped,
preferring queries they don't already own) and ranked by how many of those keywords each domain
outranks them on. Adds per-project pinned/excluded competitors, keeps domain-overlap discovery as
a labelled fallback when Search Console is missing, and fixes the two separate reasons a cached
run rendered as a blank Analyze prompt.

Verified on AmericaVending.com: <replace with the actual observed result from Step 3, including
whether vendingexchange.com / avfusa.com appeared and the measured cost of the run>.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Note `--repo` is required; `gh` otherwise aims at the upstream fork. Fill in the verification
line with what actually happened — if the real rivals did not appear, say that in the PR rather
than shipping the claim.
