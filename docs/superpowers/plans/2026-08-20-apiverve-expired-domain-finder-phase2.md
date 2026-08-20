# Expired-Domain Finder — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface expired and expiring domains from a project's own niche graph, ranked by why they matter, as acquisition targets.

**Architecture:** Candidate domains come from three swappable `CandidateSource`s (persisted competitors, link-gap referring domains, SERP rivals). A pure pipeline normalizes, dedupes, strips platforms, scores by graph evidence and caps. Only the capped set is checked against APIVerve, and availability is checked **only** for domains that came back expired. Results persist through the existing `analysisRuns` + R2 history, and restore is inert.

**Tech Stack:** TypeScript, Zod, TanStack Start server functions, Cloudflare KV + R2 + D1, Vitest (node), Playwright, Kumo UI.

**Spec:** `docs/superpowers/specs/2026-08-20-apiverve-domain-expiration-design.md`
**Builds on:** Phase 1 (merged or in PR #52) — `resolveDomainExpiration`, `apiverveGet`, `src/shared/domainExpiration.ts`.

## Global Constraints

- **Vitest is `environment: "node"`, `src/**/\*.test.ts`only.** A module that statically imports`cloudflare:workers`cannot be imported by a test. All pipeline logic therefore lives in`src/shared/` or takes its dependencies as parameters. This is the constraint that shaped Phase 1 and it applies unchanged.
- **Normalization happens inside `resolveDomainExpiration`,** not at call sites — Phase 1 established that choke point after the MCP tool split the cache key. Do not re-normalize at call sites; do not bypass it.
- **`null` means "we do not know"** — never a fabricated `0`, never a silent "healthy". A candidate whose lookup failed must be _counted and reported_, never silently dropped as if it were healthy.
- **No auto-spend.** The run fires only from an explicit click, behind `useAuthorizedRun` + `useMeteredQuery`. Restore renders stored rows and issues **zero** queries.
- **Cost estimate must be shown before spending** and must match what the code actually does.
- Cache prefix for availability: `apiverve-domain-avail:v1:`, TTL `86_400` (1 day — availability changes far faster than an expiry date).
- Verification is `pnpm ci:check && pnpm test`. `ci:check` does **not** run Vitest.
- No D1 migration: `RUN_FEATURES` gains a value, which is a new string in an existing text column.

## Cost model — deliberate deviation from the spec

The spec priced this at `N domains × 2 calls × 5 credits` (500 credits at N=50). That over-buys: **availability only matters for a domain that is already expired**, since a live domain is never registerable. So:

1. Expiration for all N capped candidates — `N × 5` credits.
2. Availability **only** for the expired subset — usually 0–2 domains.

At N=50 that is ~250 credits plus a handful, not 500. The UI must quote the honest figure: `N × 5` up front, with availability described as "a few more if any have lapsed".

---

### Task 1: Availability lookup

**Files:**

- Create: `src/server/lib/apiverve/domainAvailability.ts`
- Test: `src/server/lib/apiverve/domainAvailability.test.ts`

**Interfaces:**

- Consumes: `apiverveGet` from `@/server/lib/apiverve/client`; `ExpirationCache` shape from `@/server/lib/apiverve/domainExpiration` (reused as a generic KV-shaped cache).
- Produces: `AVAILABILITY_CACHE_PREFIX`, `AVAILABILITY_TTL_SECONDS`, `resolveDomainAvailability(rawDomain: string, cache: ExpirationCache, ): Promise<boolean | null>`.

`GET https://api.apiverve.com/v1/domainavailability?domain=X` returns `{ data: { domain, available: boolean, owner?: { registrar } } }`. 5 credits. We keep only `available`; `registrar` is not needed and is premium-gated.

Return `boolean | null` where `null` is "we could not tell" — never coerce a failure to `false`, which would read as "taken" and hide a real target.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AVAILABILITY_CACHE_PREFIX,
  AVAILABILITY_TTL_SECONDS,
  resolveDomainAvailability,
} from "@/server/lib/apiverve/domainAvailability";
import type { ExpirationCache } from "@/server/lib/apiverve/domainExpiration";

function fakeCache(): ExpirationCache & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: (key) => Promise.resolve(store.get(key) ?? null),
    put: (key, value) => {
      store.set(key, value);
      return Promise.resolve();
    },
  };
}

function availabilityResponse(available: boolean): Response {
  return new Response(
    JSON.stringify({
      status: "ok",
      error: null,
      data: { domain: "example.com", available },
    }),
    { headers: { "content-type": "application/json" } },
  );
}

describe("resolveDomainAvailability", () => {
  beforeEach(() => {
    process.env.APIVERVE_API_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.APIVERVE_API_KEY;
    vi.unstubAllGlobals();
  });

  it("returns the availability flag and caches it", async () => {
    const cache = fakeCache();
    const fetchMock = vi.fn().mockResolvedValue(availabilityResponse(true));
    vi.stubGlobal("fetch", fetchMock);

    expect(await resolveDomainAvailability("example.com", cache)).toBe(true);
    expect(await resolveDomainAvailability("example.com", cache)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cache.store.has(`${AVAILABILITY_CACHE_PREFIX}example.com`)).toBe(
      true,
    );
  });

  it("caches false distinctly from an absent entry", async () => {
    const cache = fakeCache();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(availabilityResponse(false)),
    );
    expect(await resolveDomainAvailability("example.com", cache)).toBe(false);
    expect(cache.store.get(`${AVAILABILITY_CACHE_PREFIX}example.com`)).toBe(
      "false",
    );
  });

  it("collapses subdomains to the registrable domain", async () => {
    const cache = fakeCache();
    const fetchMock = vi.fn().mockResolvedValue(availabilityResponse(true));
    vi.stubGlobal("fetch", fetchMock);

    await resolveDomainAvailability("example.com", cache);
    await resolveDomainAvailability("blog.example.com", cache);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null rather than false when the lookup fails", async () => {
    const cache = fakeCache();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 500 })),
    );
    expect(await resolveDomainAvailability("example.com", cache)).toBeNull();
  });

  it("writes with the one-day TTL", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const cache: ExpirationCache = { get: () => Promise.resolve(null), put };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(availabilityResponse(true)),
    );
    await resolveDomainAvailability("example.com", cache);
    expect(put).toHaveBeenCalledWith(expect.any(String), "true", {
      expirationTtl: AVAILABILITY_TTL_SECONDS,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/server/lib/apiverve/domainAvailability.test.ts
```

Expected: FAIL — cannot resolve `@/server/lib/apiverve/domainAvailability`.

- [ ] **Step 3: Write the implementation**

```ts
import { z } from "zod";
import { apiverveGet } from "@/server/lib/apiverve/client";
import type { ExpirationCache } from "@/server/lib/apiverve/domainExpiration";
import { normalizeDomainInput } from "@/server/lib/domainUtils";

export const AVAILABILITY_CACHE_PREFIX = "apiverve-domain-avail:v1:";
/** One day, not the expiry lookup's seven: a domain can be caught the moment it
 *  drops, so a week-stale "taken" would hide the exact window that matters. */
export const AVAILABILITY_TTL_SECONDS = 86_400;

const responseSchema = z.object({
  data: z.object({ available: z.boolean() }),
});

/**
 * `true` registerable, `false` taken, `null` we could not tell.
 *
 * The null is load-bearing: collapsing a failed lookup to `false` would render
 * as "taken" and quietly bury a domain that is in fact available -- the exact
 * result this feature exists to surface.
 */
export async function resolveDomainAvailability(
  rawDomain: string,
  cache: ExpirationCache,
): Promise<boolean | null> {
  const domain = normalizeDomainInput(rawDomain, false);
  const cacheKey = `${AVAILABILITY_CACHE_PREFIX}${domain}`;

  const cached = await cache.get(cacheKey);
  if (cached === "true") return true;
  if (cached === "false") return false;

  let available: boolean;
  try {
    const parsed = responseSchema.safeParse(
      await apiverveGet("domainavailability", { domain }),
    );
    if (!parsed.success) return null;
    available = parsed.data.data.available;
  } catch {
    // A failure is unknown, never "taken". Deliberately NOT cached: caching a
    // failure would suppress retries for a full day.
    return null;
  }

  await cache.put(cacheKey, String(available), {
    expirationTtl: AVAILABILITY_TTL_SECONDS,
  });
  return available;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run src/server/lib/apiverve/domainAvailability.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/lib/apiverve/domainAvailability.ts src/server/lib/apiverve/domainAvailability.test.ts
git commit -m "Add the APIVerve availability lookup, with unknown distinct from taken"
```

---

### Task 2: Concurrency-capped bulk expiration

**Files:**

- Modify: `src/server/lib/apiverve/domainExpiration.ts`
- Modify: `src/server/lib/apiverve/domainExpiration.test.ts`

**Interfaces:**

- Consumes: `resolveDomainExpiration` (Phase 1).
- Produces: `MAX_DOMAINS_PER_CALL = 100`, `FETCH_CONCURRENCY = 5`, `resolveDomainExpirations(domains: string[], cache: ExpirationCache, nowMs: number): Promise<Map<string, DomainExpiration | null>>`.

Deferred from Phase 1 because nothing called it; the finder is its first real consumer. Keyed by the **normalized** domain so the map agrees with the cache. A single failure yields `null` for that domain and never fails the batch. Concurrency of 5 because APIVerve rate-limits per minute (Ahrefs' 20 would trip it).

- [ ] **Step 1: Write the failing test**

Append to `src/server/lib/apiverve/domainExpiration.test.ts`:

```ts
describe("resolveDomainExpirations", () => {
  beforeEach(() => {
    process.env.APIVERVE_API_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.APIVERVE_API_KEY;
    vi.unstubAllGlobals();
  });

  it("degrades one failure to null without failing the batch", async () => {
    const cache = fakeCache();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: unknown) =>
        Promise.resolve(
          String(url).includes("bad.com")
            ? new Response("{}", { status: 500 })
            : apiResponse("2026-10-04T00:00:00Z"),
        ),
      ),
    );

    const result = await resolveDomainExpirations(
      ["good.com", "bad.com"],
      cache,
      NOW,
    );

    expect(result.get("bad.com")).toBeNull();
    expect(result.get("good.com")?.daysToExpiration).toBe(45);
  });

  it("keys results by the normalized domain and dedupes the input", async () => {
    const cache = fakeCache();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(apiResponse("2026-10-04T00:00:00Z"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveDomainExpirations(
      ["example.com", "www.example.com", "blog.example.com"],
      cache,
      NOW,
    );

    expect([...result.keys()]).toEqual(["example.com"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never runs more than FETCH_CONCURRENCY requests at once", async () => {
    const cache = fakeCache();
    let inFlight = 0;
    let peak = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        return new Promise<Response>((resolve) => {
          setTimeout(() => {
            inFlight -= 1;
            resolve(apiResponse("2026-10-04T00:00:00Z"));
          }, 5);
        });
      }),
    );

    const domains = Array.from({ length: 20 }, (_, i) => `d${i}.com`);
    await resolveDomainExpirations(domains, cache, NOW);

    expect(peak).toBeLessThanOrEqual(FETCH_CONCURRENCY);
  });

  it("rejects an over-cap batch instead of silently truncating", async () => {
    const cache = fakeCache();
    const domains = Array.from(
      { length: MAX_DOMAINS_PER_CALL + 1 },
      (_, i) => `d${i}.com`,
    );
    await expect(
      resolveDomainExpirations(domains, cache, NOW),
    ).rejects.toThrow();
  });
});
```

Add `FETCH_CONCURRENCY`, `MAX_DOMAINS_PER_CALL` and `resolveDomainExpirations` to the file's existing import block.

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/server/lib/apiverve/domainExpiration.test.ts
```

Expected: FAIL — `resolveDomainExpirations` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/server/lib/apiverve/domainExpiration.ts`:

```ts
export const MAX_DOMAINS_PER_CALL = 100;
/** APIVerve rate-limits per minute; Ahrefs' batch of 20 trips it. */
export const FETCH_CONCURRENCY = 5;

/**
 * Resolve many domains, keyed by their NORMALIZED form so the map agrees with
 * the cache. One domain failing degrades that entry to `null` -- it must never
 * take the batch down, and `null` here means "unknown", which the finder counts
 * and reports rather than treating as healthy.
 */
export async function resolveDomainExpirations(
  domains: string[],
  cache: ExpirationCache,
  nowMs: number,
): Promise<Map<string, DomainExpiration | null>> {
  if (domains.length > MAX_DOMAINS_PER_CALL) {
    // Loud, not silent: a truncated sweep that looks complete is worse than a
    // refusal, because the caller would report "none expired" over unchecked
    // domains.
    throw new AppError(
      "VALIDATION_ERROR",
      `Too many domains: ${domains.length} exceeds the cap of ${MAX_DOMAINS_PER_CALL}`,
    );
  }

  const unique = [
    ...new Set(
      domains.map((domain) => {
        try {
          return normalizeDomainInput(domain, false);
        } catch {
          return "";
        }
      }),
    ),
  ].filter(Boolean);

  const results = new Map<string, DomainExpiration | null>();
  for (let i = 0; i < unique.length; i += FETCH_CONCURRENCY) {
    const batch = unique.slice(i, i + FETCH_CONCURRENCY);
    const settled = await Promise.all(
      batch.map(async (domain) => {
        try {
          return [
            domain,
            await resolveDomainExpiration(domain, cache, nowMs),
          ] as const;
        } catch {
          return [domain, null] as const;
        }
      }),
    );
    for (const [domain, value] of settled) results.set(domain, value);
  }
  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run src/server/lib/apiverve/domainExpiration.test.ts
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/lib/apiverve/domainExpiration.ts src/server/lib/apiverve/domainExpiration.test.ts
git commit -m "Resolve domain expiry in capped batches, degrading failures to unknown"
```

---

### Task 3: The candidate pipeline (pure)

**Files:**

- Create: `src/shared/expiredDomains.ts`
- Test: `src/shared/expiredDomains.test.ts`

**Interfaces:**

- Consumes: `DomainExpiration`, `DomainExpirationStatus` from `@/shared/domainExpiration`.
- Produces: `CandidateEvidence`, `Candidate`, `FinderRow`, `FinderSummary`, `mergeCandidates`, `scoreCandidate`, `rankAndCap`, `buildFinderRows`, `SURFACED_STATUSES`.

Entirely pure — no network, no `cloudflare:workers`, no D1. Every judgement the feature makes lives here so it is all directly testable. `classifyCompetitorDomain` is injected as a parameter rather than imported so this module stays free of the competitors feature.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  buildFinderRows,
  mergeCandidates,
  rankAndCap,
  scoreCandidate,
  type Candidate,
} from "@/shared/expiredDomains";
import type { DomainExpiration } from "@/shared/domainExpiration";

function candidate(over: Partial<Candidate> & { domain: string }): Candidate {
  return {
    sources: ["link-gap"],
    evidence: {
      linksToCompetitors: [],
      ranksForKeywords: [],
      isKnownCompetitor: false,
    },
    ...over,
  };
}

function expiration(
  status: DomainExpiration["status"],
  days: number | null,
): DomainExpiration {
  return {
    domain: "x.com",
    expirationDate: null,
    createdDate: null,
    lastUpdatedDate: null,
    daysToExpiration: days,
    domainAgeDays: null,
    domainAgeYears: null,
    daysSinceLastUpdate: null,
    status,
  };
}

describe("mergeCandidates", () => {
  it("unions sources and evidence for a domain found twice", () => {
    const merged = mergeCandidates([
      [
        candidate({
          domain: "blog.example.com",
          sources: ["link-gap"],
          evidence: {
            linksToCompetitors: ["rivala.com"],
            ranksForKeywords: [],
            isKnownCompetitor: false,
          },
        }),
      ],
      [
        candidate({
          domain: "example.com",
          sources: ["serp-rivals"],
          evidence: {
            linksToCompetitors: ["rivalb.com"],
            ranksForKeywords: ["vending machines"],
            isKnownCompetitor: true,
          },
        }),
      ],
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.domain).toBe("example.com");
    expect(merged[0]?.sources.toSorted()).toEqual(["link-gap", "serp-rivals"]);
    expect(merged[0]?.evidence.linksToCompetitors.toSorted()).toEqual([
      "rivala.com",
      "rivalb.com",
    ]);
    expect(merged[0]?.evidence.isKnownCompetitor).toBe(true);
  });

  it("drops entries whose domain cannot be normalized", () => {
    expect(mergeCandidates([[candidate({ domain: "not a domain" })]])).toEqual(
      [],
    );
  });
});

describe("scoreCandidate", () => {
  it("ranks a competitor-linking domain above a merely-ranking one", () => {
    const links = candidate({
      domain: "a.com",
      evidence: {
        linksToCompetitors: ["r1.com", "r2.com"],
        ranksForKeywords: [],
        isKnownCompetitor: false,
      },
    });
    const ranks = candidate({
      domain: "b.com",
      evidence: {
        linksToCompetitors: [],
        ranksForKeywords: ["kw1", "kw2"],
        isKnownCompetitor: false,
      },
    });
    expect(scoreCandidate(links)).toBeGreaterThan(scoreCandidate(ranks));
  });

  it("rewards corroboration across sources", () => {
    const one = candidate({ domain: "a.com", sources: ["link-gap"] });
    const two = candidate({
      domain: "a.com",
      sources: ["link-gap", "serp-rivals"],
    });
    expect(scoreCandidate(two)).toBeGreaterThan(scoreCandidate(one));
  });
});

describe("rankAndCap", () => {
  const classifyNothing = () => null;

  it("removes the project's own domain", () => {
    const rows = rankAndCap(
      [candidate({ domain: "mine.com" }), candidate({ domain: "other.com" })],
      {
        ownDomain: "mine.com",
        exclusions: [],
        cap: 10,
        classify: classifyNothing,
      },
    );
    expect(rows.map((r) => r.domain)).toEqual(["other.com"]);
  });

  it("removes platforms via the injected classifier", () => {
    const rows = rankAndCap(
      [
        candidate({ domain: "facebook.com" }),
        candidate({ domain: "real.com" }),
      ],
      {
        ownDomain: "mine.com",
        exclusions: [],
        cap: 10,
        classify: (d) => (d === "facebook.com" ? "social" : null),
      },
    );
    expect(rows.map((r) => r.domain)).toEqual(["real.com"]);
  });

  it("applies profile exclusions case-insensitively", () => {
    const rows = rankAndCap(
      [
        candidate({ domain: "Vendingsupply.com" }),
        candidate({ domain: "keep.com" }),
      ],
      {
        ownDomain: "mine.com",
        exclusions: ["VENDINGSUPPLY"],
        cap: 10,
        classify: classifyNothing,
      },
    );
    expect(rows.map((r) => r.domain)).toEqual(["keep.com"]);
  });

  it("keeps the best-scoring candidates when capping", () => {
    const weak = candidate({ domain: "weak.com" });
    const strong = candidate({
      domain: "strong.com",
      evidence: {
        linksToCompetitors: ["r1.com", "r2.com", "r3.com"],
        ranksForKeywords: [],
        isKnownCompetitor: false,
      },
    });
    const rows = rankAndCap([weak, strong], {
      ownDomain: "mine.com",
      exclusions: [],
      cap: 1,
      classify: classifyNothing,
    });
    expect(rows.map((r) => r.domain)).toEqual(["strong.com"]);
  });
});

describe("buildFinderRows", () => {
  it("surfaces only expired, critical and warning, and counts the rest", () => {
    const candidates = [
      candidate({ domain: "gone.com" }),
      candidate({ domain: "soon.com" }),
      candidate({ domain: "fine.com" }),
      candidate({ domain: "unknown.com" }),
    ];
    const expirations = new Map<string, DomainExpiration | null>([
      ["gone.com", expiration("expired", -5)],
      ["soon.com", expiration("critical", 12)],
      ["fine.com", expiration("healthy", 900)],
      ["unknown.com", null],
    ]);

    const { rows, summary } = buildFinderRows(
      candidates,
      expirations,
      new Map(),
    );

    expect(rows.map((r) => r.domain)).toEqual(["gone.com", "soon.com"]);
    expect(summary.checked).toBe(4);
    expect(summary.surfaced).toBe(2);
    expect(summary.failed).toBe(1);
  });

  it("sorts expired ahead of critical regardless of score", () => {
    const candidates = [
      candidate({
        domain: "soon.com",
        evidence: {
          linksToCompetitors: ["a.com", "b.com", "c.com"],
          ranksForKeywords: [],
          isKnownCompetitor: false,
        },
      }),
      candidate({ domain: "gone.com" }),
    ];
    const expirations = new Map<string, DomainExpiration | null>([
      ["soon.com", expiration("critical", 5)],
      ["gone.com", expiration("expired", -1)],
    ]);

    const { rows } = buildFinderRows(candidates, expirations, new Map());
    expect(rows.map((r) => r.domain)).toEqual(["gone.com", "soon.com"]);
  });

  it("carries availability through, leaving unknown as null", () => {
    const candidates = [candidate({ domain: "gone.com" })];
    const expirations = new Map<string, DomainExpiration | null>([
      ["gone.com", expiration("expired", -400)],
    ]);
    const { rows } = buildFinderRows(
      candidates,
      expirations,
      new Map([["gone.com", true]]),
    );
    expect(rows[0]?.available).toBe(true);

    const { rows: unknownRows } = buildFinderRows(
      candidates,
      expirations,
      new Map(),
    );
    expect(unknownRows[0]?.available).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/shared/expiredDomains.test.ts
```

Expected: FAIL — cannot resolve `@/shared/expiredDomains`.

- [ ] **Step 3: Write the implementation**

Implement `src/shared/expiredDomains.ts` with:

```ts
import { getDomain } from "tldts";
import type {
  DomainExpiration,
  DomainExpirationStatus,
} from "@/shared/domainExpiration";

export type CandidateEvidence = {
  linksToCompetitors: string[];
  ranksForKeywords: string[];
  isKnownCompetitor: boolean;
};

export type Candidate = {
  domain: string;
  sources: string[];
  evidence: CandidateEvidence;
};

export type FinderRow = Candidate & {
  score: number;
  expiration: DomainExpiration;
  available: boolean | null;
};

export type FinderSummary = {
  checked: number;
  surfaced: number;
  failed: number;
};

/** Only these reach the table. `healthy` is the common case and is noise here;
 *  a `null` status is UNKNOWN and is counted in `summary.failed`, never shown
 *  as if it were fine. */
export const SURFACED_STATUSES: readonly DomainExpirationStatus[] = [
  "expired",
  "critical",
  "warning",
];

const STATUS_ORDER: Record<DomainExpirationStatus, number> = {
  expired: 0,
  critical: 1,
  warning: 2,
  healthy: 3,
};

/** Weights: a domain that links to one of your competitors is niche-relevant by
 *  construction, which is a far stronger signal than a keyword overlap, which in
 *  turn beats merely appearing on the competitor list. Corroboration across two
 *  independent sources adds a point. Deliberately NOT derived from the domain
 *  NAME -- guessing that "nutritionhub.com" is food-adjacent is unreliable, and
 *  the graph already knows the answer. */
export function scoreCandidate(candidate: Candidate): number {
  return (
    3 * candidate.evidence.linksToCompetitors.length +
    2 * candidate.evidence.ranksForKeywords.length +
    (candidate.evidence.isKnownCompetitor ? 1 : 0) +
    Math.max(0, candidate.sources.length - 1)
  );
}

export function mergeCandidates(lists: Candidate[][]): Candidate[] {
  const byDomain = new Map<string, Candidate>();
  for (const candidate of lists.flat()) {
    const domain = getDomain(candidate.domain.trim().toLowerCase());
    if (!domain) continue;
    const existing = byDomain.get(domain);
    if (!existing) {
      byDomain.set(domain, { ...candidate, domain });
      continue;
    }
    byDomain.set(domain, {
      domain,
      sources: [...new Set([...existing.sources, ...candidate.sources])],
      evidence: {
        linksToCompetitors: [
          ...new Set([
            ...existing.evidence.linksToCompetitors,
            ...candidate.evidence.linksToCompetitors,
          ]),
        ],
        ranksForKeywords: [
          ...new Set([
            ...existing.evidence.ranksForKeywords,
            ...candidate.evidence.ranksForKeywords,
          ]),
        ],
        isKnownCompetitor:
          existing.evidence.isKnownCompetitor ||
          candidate.evidence.isKnownCompetitor,
      },
    });
  }
  return [...byDomain.values()];
}

export function rankAndCap(
  candidates: Candidate[],
  options: {
    ownDomain: string;
    exclusions: string[];
    cap: number;
    classify: (domain: string) => string | null;
  },
): Candidate[] {
  const own = getDomain(options.ownDomain.trim().toLowerCase());
  const exclusions = options.exclusions
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return candidates
    .filter((candidate) => candidate.domain !== own)
    .filter((candidate) => options.classify(candidate.domain) === null)
    .filter(
      (candidate) =>
        !exclusions.some((token) => candidate.domain.includes(token)),
    )
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.candidate.domain.localeCompare(b.candidate.domain),
    )
    .slice(0, options.cap)
    .map((entry) => entry.candidate);
}

export function buildFinderRows(
  candidates: Candidate[],
  expirations: Map<string, DomainExpiration | null>,
  availability: Map<string, boolean | null>,
): { rows: FinderRow[]; summary: FinderSummary } {
  let failed = 0;
  const rows: FinderRow[] = [];

  for (const candidate of candidates) {
    const expiration = expirations.get(candidate.domain) ?? null;
    if (!expiration || expiration.status === null) {
      failed += 1;
      continue;
    }
    if (!SURFACED_STATUSES.includes(expiration.status)) continue;
    rows.push({
      ...candidate,
      score: scoreCandidate(candidate),
      expiration,
      available: availability.get(candidate.domain) ?? null,
    });
  }

  rows.sort(
    (a, b) =>
      STATUS_ORDER[a.expiration.status as DomainExpirationStatus] -
        STATUS_ORDER[b.expiration.status as DomainExpirationStatus] ||
      b.score - a.score ||
      a.domain.localeCompare(b.domain),
  );

  return {
    rows,
    summary: { checked: candidates.length, surfaced: rows.length, failed },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run src/shared/expiredDomains.test.ts
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/expiredDomains.ts src/shared/expiredDomains.test.ts
git commit -m "Score expired-domain candidates from graph evidence, not domain names"
```

---

### Task 4: Candidate sources

**Files:**

- Create: `src/server/features/expired-domains/candidateSources.ts`
- Test: `src/server/features/expired-domains/candidateSources.test.ts`

**Interfaces:**

- Consumes: `Candidate` (Task 3); `fetchBacklinksDomainIntersection` from `@/server/lib/dataforseo/backlinks-insights`; `fetchSerpCompetitors` from `@/server/lib/dataforseo/labs-competitors`.
- Produces: `CandidateSource`, `competitorsSource`, `linkGapSource`, `serpRivalsSource`, `collectCandidates`.

Each source takes its data-fetching function as a parameter so the tests need no network and no DataForSEO key. `collectCandidates` runs the enabled sources and returns `{ lists, sourcesUsed, sourceErrors }` — a failing source is recorded and skipped, never fatal, because a link-gap outage must not block the competitor rows.

```ts
export type FinderContext = {
  projectDomain: string;
  competitorDomains: string[];
  keywords: string[];
  locationCode: number;
  languageCode: string;
};

export type CandidateSource = {
  readonly name: string;
  readonly metered: boolean;
  collect(context: FinderContext): Promise<Candidate[]>;
};
```

- [ ] **Step 1: Write the failing test**

Cover: `competitorsSource` maps `projectCompetitors` rows to candidates with `isKnownCompetitor: true` and no network call; `linkGapSource` maps intersection items to `linksToCompetitors` evidence naming which competitors; `serpRivalsSource` maps ranked domains to `ranksForKeywords`; `collectCandidates` records a thrown source in `sourceErrors` and still returns the others' lists. Build each test around an injected fake fetcher.

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/server/features/expired-domains/candidateSources.test.ts
```

- [ ] **Step 3: Implement**, injecting fetchers via a factory:

```ts
export function createLinkGapSource(
  fetchIntersection: typeof fetchBacklinksDomainIntersection,
): CandidateSource {
  /* … */
}
```

- [ ] **Step 4: Run tests** — expected PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/features/expired-domains
git commit -m "Collect expired-domain candidates from the project's own niche graph"
```

---

### Task 5: Finder service and server function

**Files:**

- Create: `src/server/features/expired-domains/ExpiredDomainsService.ts`
- Create: `src/serverFunctions/expiredDomains.ts`
- Modify: `src/shared/analysis-run-features.ts`

**Interfaces:**

- Produces: `RUN_FEATURES.expiredDomains = "expired_domains"`; `estimateFinderCost(candidateCount: number)`; `runExpiredDomainFinder`; server functions `estimateExpiredDomainRun` (free) and `runExpiredDomainSearch` (metered).

Order of operations, and the reason for it:

1. Collect candidates, merge, rank, cap. **No APIVerve spend yet.**
2. `estimateExpiredDomainRun` returns `{ candidateCount, expirationCredits: count * 5 }` so the UI can quote a real number. Free — no APIVerve call.
3. On confirmation, `resolveDomainExpirations` over the capped set.
4. `resolveDomainAvailability` **only** for rows whose status is `expired`. A live domain is never registerable, so checking the rest is pure waste.
5. `buildFinderRows`, persist to `analysisRuns` + R2.

- [ ] Steps follow the Task 1–3 pattern: failing test for `estimateFinderCost` and for the "availability is only called for expired rows" rule (assert the availability fetcher is called exactly once for a set containing one expired and three healthy domains), then implement, then commit.

---

### Task 6: UI panel

**Files:**

- Create: `src/client/features/expired-domains/ExpiredDomainsPanel.tsx`
- Create: `src/routes/_project/p/$projectId/expired-domains.tsx`

Requirements, all from the spec:

- Behind `useAuthorizedRun` + `useMeteredQuery`. Nothing fires on mount.
- Before running, show the real quote from `estimateExpiredDomainRun`: "Check 50 domains — 250 credits, plus a few more if any have lapsed."
- Columns: domain, status pill, days, availability, why-it-is-here (from `evidence`), score.
- **Empty state shows its work:** "Checked 50 domains from link gap and competitors — none expired." Include `summary.failed` when non-zero: "3 lookups did not answer."
- `data-testid="expired-domains-panel"` for the e2e spec.
- Adding a route regenerates `routeTree.gen.ts` — **boot `vite dev` once** to regenerate it, or `tsc` fails with ~6 cascading errors that look like a tooling outage.

---

### Task 7: Persistence and inert restore

- Write an `analysisRuns` row with `RUN_FEATURES.expiredDomains` and the rows + summary as the R2 payload, following the backlinks precedent.
- **Restore must issue zero queries.** Before wiring it, grep the rendered subtree for `useQuery`/`useMeteredQuery`: sibling components in this codebase self-fetch metered data off any non-empty target, and a restored run that silently re-bills is the known failure mode here.

---

### Task 8: End-to-end verification

- Extend `e2e/domain-expiration-live.spec.ts` or add `e2e/expired-domains-live.spec.ts`, guarded by `APIVERVE_LIVE=1` exactly as Phase 1 is.
- Assert: panel mounts with zero metered calls; the quote matches `candidateCount * 5`; after confirming, rows render or the empty state names how many domains were checked.
- Run `pnpm ci:check && pnpm test` before the PR.

## Open question for Ben

The cap defaults to 50 (250 credits per sweep). If that is too rich, the cap is a single constant in Task 5 — say the word and it drops to 20.
