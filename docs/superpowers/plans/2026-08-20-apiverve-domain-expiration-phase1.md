# APIVerve Domain Expiration — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Look up a domain's expiry date, age and health status through APIVerve, cache it in KV, and surface it on the Domain Overview tab and as a SAM/MCP tool.

**Architecture:** Pure date/threshold logic lives in `src/shared/` where Vitest can reach it; the HTTP client and the cache codec take their dependencies (fetch, a KV-shaped object, the clock) as parameters so both are unit-testable; only the thin server function statically imports `cloudflare:workers`. KV stores **absolute dates only** and every day-count is recomputed on read.

**Tech Stack:** TypeScript, Zod, TanStack Start server functions, Cloudflare Workers KV, Vitest (node environment), Kumo UI components, `@modelcontextprotocol` server tools.

**Spec:** `docs/superpowers/specs/2026-08-20-apiverve-domain-expiration-design.md`

## Global Constraints

- **Vitest runs `environment: "node"` and includes only `src/**/\*.test.ts`** (not `.tsx`). Any module that statically imports `cloudflare:workers`**cannot be imported by a test**. Testable logic must live outside such modules. This is a real scar in this repo — see the doc comment in`src/shared/ahrefsRating.ts`.
- **Top-level imports only in test files.** A deferred `await import()` inside a test body bills the whole module-graph load to the first test as a phantom ~5s timeout.
- **`null` means "we do not know" and nothing else.** Never a fabricated `0`, never a silent collapse to `healthy`.
- **Never auto-retry a metered call.** Use `useMeteredQuery`, which omits `retry` from its options type so a call site structurally cannot re-open that path.
- **No auto-spend.** A paid lookup runs only from an explicit click in the current mounted session, via `useAuthorizedRun`.
- **KV caches absolute dates only.** `daysToExpiration`, `domainAgeDays`, `domainAgeYears` and `daysSinceLastUpdate` are always derived from the clock at read time.
- **Status thresholds are ours, not APIVerve's:** `expired <= 0`, `critical <= 30`, `warning <= 90`, `healthy > 90`.
- Cache key prefix `apiverve-domain-exp:v1:`, TTL `604800` seconds (7 days).
- Verification is `pnpm ci:check && pnpm test`. `ci:check` does **not** run Vitest.
- No D1 migration in this phase.

---

### Task 1: Pure expiration logic

**Files:**

- Create: `src/shared/domainExpiration.ts`
- Test: `src/shared/domainExpiration.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `DomainExpirationStatus`, `DomainExpirationFacts`, `DomainExpiration`, `statusFromDaysToExpiration(days: number | null): DomainExpirationStatus | null`, `deriveDomainExpiration(facts: DomainExpirationFacts, nowMs: number): DomainExpiration`, and the constants `CRITICAL_MAX_DAYS = 30`, `WARNING_MAX_DAYS = 90`.

The clock is an explicit `nowMs` parameter rather than a call to `Date.now()`. That makes the drift test in Task 4 deterministic with no fake timers.

- [ ] **Step 1: Write the failing test**

Create `src/shared/domainExpiration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  deriveDomainExpiration,
  statusFromDaysToExpiration,
  type DomainExpirationFacts,
} from "@/shared/domainExpiration";

const DAY_MS = 86_400_000;
const NOW = Date.parse("2026-08-20T00:00:00Z");

function factsExpiringInDays(days: number): DomainExpirationFacts {
  return {
    domain: "example.com",
    expirationDate: new Date(NOW + days * DAY_MS).toISOString(),
    createdDate: null,
    lastUpdatedDate: null,
  };
}

describe("statusFromDaysToExpiration", () => {
  it("returns null for an unknown day count rather than guessing healthy", () => {
    expect(statusFromDaysToExpiration(null)).toBeNull();
  });

  it("treats today and the past as expired", () => {
    expect(statusFromDaysToExpiration(0)).toBe("expired");
    expect(statusFromDaysToExpiration(-1)).toBe("expired");
  });

  it("uses inclusive upper bounds at each threshold", () => {
    expect(statusFromDaysToExpiration(1)).toBe("critical");
    expect(statusFromDaysToExpiration(30)).toBe("critical");
    expect(statusFromDaysToExpiration(31)).toBe("warning");
    expect(statusFromDaysToExpiration(90)).toBe("warning");
    expect(statusFromDaysToExpiration(91)).toBe("healthy");
  });
});

describe("deriveDomainExpiration", () => {
  it("derives day counts from the supplied clock", () => {
    const result = deriveDomainExpiration(factsExpiringInDays(45), NOW);
    expect(result.daysToExpiration).toBe(45);
    expect(result.status).toBe("warning");
  });

  it("reports fewer remaining days as the clock advances over identical facts", () => {
    const facts = factsExpiringInDays(10);
    const today = deriveDomainExpiration(facts, NOW);
    const inSevenDays = deriveDomainExpiration(facts, NOW + 7 * DAY_MS);
    expect(today.daysToExpiration).toBe(10);
    expect(inSevenDays.daysToExpiration).toBe(3);
    expect(inSevenDays.status).toBe("critical");
  });

  it("computes age from the creation date", () => {
    const result = deriveDomainExpiration(
      {
        domain: "example.com",
        expirationDate: null,
        createdDate: new Date(NOW - 3653 * DAY_MS).toISOString(),
        lastUpdatedDate: new Date(NOW - 40 * DAY_MS).toISOString(),
      },
      NOW,
    );
    expect(result.domainAgeDays).toBe(3653);
    expect(result.domainAgeYears).toBe(10);
    expect(result.daysSinceLastUpdate).toBe(40);
  });

  it("yields null — never zero — for absent or unparseable dates", () => {
    const result = deriveDomainExpiration(
      {
        domain: "example.com",
        expirationDate: "not-a-date",
        createdDate: null,
        lastUpdatedDate: null,
      },
      NOW,
    );
    expect(result.daysToExpiration).toBeNull();
    expect(result.domainAgeDays).toBeNull();
    expect(result.domainAgeYears).toBeNull();
    expect(result.daysSinceLastUpdate).toBeNull();
    expect(result.status).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/shared/domainExpiration.test.ts
```

Expected: FAIL — cannot resolve module `@/shared/domainExpiration`.

- [ ] **Step 3: Write minimal implementation**

Create `src/shared/domainExpiration.ts`:

```ts
/**
 * Domain expiry facts, and every value derived from them.
 *
 * Two rules live here, both load-bearing.
 *
 * 1. Only the ABSOLUTE dates are ever stored. APIVerve computes
 *    `daysToExpiration`, `domainAgeDays` and `daysSinceLastUpdate` at call
 *    time, so caching those numbers means that on day N of the TTL they are N
 *    days wrong -- silently, and in the dangerous direction: a domain three
 *    days from dropping would read as ten. Callers pass the clock in and the
 *    day counts are recomputed on every read.
 *
 * 2. The status thresholds are OURS. APIVerve names four buckets but does not
 *    publish the cutoffs, and since the day counts are recomputed locally,
 *    trusting their string would let status and days disagree in one view.
 *
 * This module is deliberately free of any `cloudflare:workers` import so that
 * Vitest (node environment) can reach it -- see `ahrefsRating.ts` for the last
 * time a rule in this repo went untested because it lived in a server-only
 * module, and was wrong the whole time.
 */

export type DomainExpirationStatus =
  | "expired"
  | "critical"
  | "warning"
  | "healthy";

/** The absolute facts as returned by APIVerve. The only thing we cache. */
export type DomainExpirationFacts = {
  domain: string;
  expirationDate: string | null;
  createdDate: string | null;
  lastUpdatedDate: string | null;
};

/** Facts plus everything derived from the clock at read time. */
export type DomainExpiration = DomainExpirationFacts & {
  daysToExpiration: number | null;
  domainAgeDays: number | null;
  domainAgeYears: number | null;
  daysSinceLastUpdate: number | null;
  status: DomainExpirationStatus | null;
};

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365.25;

export const CRITICAL_MAX_DAYS = 30;
export const WARNING_MAX_DAYS = 90;

/** `null` in means `null` out: an unknown day count must never read as healthy. */
export function statusFromDaysToExpiration(
  days: number | null,
): DomainExpirationStatus | null {
  if (days == null) return null;
  if (days <= 0) return "expired";
  if (days <= CRITICAL_MAX_DAYS) return "critical";
  if (days <= WARNING_MAX_DAYS) return "warning";
  return "healthy";
}

function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function wholeDaysBetween(fromMs: number, toMs: number): number {
  return Math.floor((toMs - fromMs) / MS_PER_DAY);
}

export function deriveDomainExpiration(
  facts: DomainExpirationFacts,
  nowMs: number,
): DomainExpiration {
  const expiresMs = parseTimestamp(facts.expirationDate);
  const createdMs = parseTimestamp(facts.createdDate);
  const updatedMs = parseTimestamp(facts.lastUpdatedDate);

  const daysToExpiration =
    expiresMs == null ? null : wholeDaysBetween(nowMs, expiresMs);
  const domainAgeDays =
    createdMs == null ? null : wholeDaysBetween(createdMs, nowMs);

  return {
    ...facts,
    daysToExpiration,
    domainAgeDays,
    domainAgeYears:
      domainAgeDays == null
        ? null
        : Math.round((domainAgeDays / DAYS_PER_YEAR) * 10) / 10,
    daysSinceLastUpdate:
      updatedMs == null ? null : wholeDaysBetween(updatedMs, nowMs),
    status: statusFromDaysToExpiration(daysToExpiration),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run src/shared/domainExpiration.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/domainExpiration.ts src/shared/domainExpiration.test.ts
git commit -m "Derive domain expiry day counts from the clock, not from cache"
```

---

### Task 2: Error codes and user-facing copy

**Files:**

- Modify: `src/shared/error-codes.ts`
- Modify: `src/client/lib/error-messages.ts`
- Test: `src/shared/error-codes.test.ts` (create if absent; otherwise append)

**Interfaces:**

- Consumes: nothing.
- Produces: three `ErrorCode` members — `APIVERVE_NOT_CONFIGURED`, `APIVERVE_AUTH_FAILED`, `APIVERVE_CREDITS_EXHAUSTED` — used by Task 3.

`STANDARD_MESSAGES` is a total `Record<ErrorCode, string>`, so adding codes without copy is a compile error. That is the intended forcing function; add both together.

`APIVERVE_AUTH_FAILED` is deliberately **left out** of `NON_REPORTABLE_ERROR_CODES`, matching `DATAFORSEO_AUTH_FAILED`: a key that is set but rejected is a real fault worth capturing. The other two are configuration and third-party-account states nobody should be paged for.

- [ ] **Step 1: Write the failing test**

Create `src/shared/error-codes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isErrorCode, shouldCaptureAppErrorCode } from "@/shared/error-codes";

describe("APIVerve error codes", () => {
  it("registers all three codes", () => {
    expect(isErrorCode("APIVERVE_NOT_CONFIGURED")).toBe(true);
    expect(isErrorCode("APIVERVE_AUTH_FAILED")).toBe(true);
    expect(isErrorCode("APIVERVE_CREDITS_EXHAUSTED")).toBe(true);
  });

  it("does not page for operator configuration or a spent third-party quota", () => {
    expect(shouldCaptureAppErrorCode("APIVERVE_NOT_CONFIGURED")).toBe(false);
    expect(shouldCaptureAppErrorCode("APIVERVE_CREDITS_EXHAUSTED")).toBe(false);
  });

  it("does page for a key that is set but rejected", () => {
    expect(shouldCaptureAppErrorCode("APIVERVE_AUTH_FAILED")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/shared/error-codes.test.ts
```

Expected: FAIL — `isErrorCode("APIVERVE_NOT_CONFIGURED")` returns `false`.

- [ ] **Step 3: Write minimal implementation**

In `src/shared/error-codes.ts`, append to the `ERROR_CODES` tuple, immediately after `"MODEL_CREDITS_EXHAUSTED"`:

```ts
  // APIVerve backs the domain expiry lookup. Three distinct states, for the
  // same reason the MODEL_* pair exists: an unset key is the operator's job,
  // a rejected key is a real fault, and an empty APIVerve quota is neither --
  // and crucially none of them is INSUFFICIENT_CREDITS, which means the
  // CUSTOMER's metered balance is empty. Reusing that code here would tell a
  // user to top up an account that is not the problem.
  "APIVERVE_NOT_CONFIGURED",
  "APIVERVE_AUTH_FAILED",
  "APIVERVE_CREDITS_EXHAUSTED",
```

In the same file, add to the `NON_REPORTABLE_ERROR_CODES` set, after `"MODEL_CREDITS_EXHAUSTED"`:

```ts
  // Operator configuration and a third-party quota -- someone can fix each,
  // neither is a bug. APIVERVE_AUTH_FAILED is deliberately absent: a key that
  // IS set and still gets rejected is a real defect signal, exactly as
  // DATAFORSEO_AUTH_FAILED is.
  "APIVERVE_NOT_CONFIGURED",
  "APIVERVE_CREDITS_EXHAUSTED",
```

In `src/client/lib/error-messages.ts`, add to `STANDARD_MESSAGES` after the `MODEL_CREDITS_EXHAUSTED` entry:

```ts
  APIVERVE_NOT_CONFIGURED:
    "Domain expiry lookups are not configured. Set APIVERVE_API_KEY to enable them.",
  APIVERVE_AUTH_FAILED:
    "APIVerve rejected the API key. Check that APIVERVE_API_KEY is a valid key.",
  APIVERVE_CREDITS_EXHAUSTED:
    "The APIVerve account is out of credits. Top it up to run more domain expiry lookups.",
```

- [ ] **Step 4: Run test and typecheck to verify they pass**

```bash
pnpm vitest run src/shared/error-codes.test.ts
```

Expected: PASS, 3 tests.

```bash
pnpm tsc --noEmit
```

Expected: clean. A failure here means `STANDARD_MESSAGES` is missing one of the three keys.

- [ ] **Step 5: Commit**

```bash
git add src/shared/error-codes.ts src/shared/error-codes.test.ts src/client/lib/error-messages.ts
git commit -m "Give each APIVerve failure its own code and its own copy"
```

---

### Task 3: APIVerve HTTP client

**Files:**

- Create: `src/server/lib/apiverve/client.ts`
- Test: `src/server/lib/apiverve/client.test.ts`

**Interfaces:**

- Consumes: `AppError` from `@/server/lib/errors`; `getOptionalEnvValue` from `@/server/lib/runtime-env`; the codes from Task 2.
- Produces: `apiverveGet(path: string, params: Record<string, string>): Promise<unknown>`.

This module must **not** statically import `cloudflare:workers`. `getOptionalEnvValue` reads `process.env` first and only then falls back to a guarded dynamic `import("cloudflare:workers")`, so it is safe here — and it means tests set `process.env.APIVERVE_API_KEY` directly with no mocking.

- [ ] **Step 1: Write the failing test**

Create `src/server/lib/apiverve/client.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiverveGet } from "@/server/lib/apiverve/client";
import { AppError } from "@/server/lib/errors";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "NO_ERROR_THROWN";
  } catch (error) {
    return error instanceof AppError ? error.code : "NOT_AN_APP_ERROR";
  }
}

describe("apiverveGet", () => {
  beforeEach(() => {
    process.env.APIVERVE_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.APIVERVE_API_KEY;
    vi.unstubAllGlobals();
  });

  it("sends the key as a header and the params as query string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    await apiverveGet("domainexpiration", { domain: "example.com" });

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      "https://api.apiverve.com/v1/domainexpiration?domain=example.com",
    );
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe(
      "test-key",
    );
  });

  it("refuses to call out at all when no key is configured", async () => {
    delete process.env.APIVERVE_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await codeOf(apiverveGet("domainexpiration", {}))).toBe(
      "APIVERVE_NOT_CONFIGURED",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps each upstream status to its own code", async () => {
    const cases: ReadonlyArray<readonly [number, string]> = [
      [400, "VALIDATION_ERROR"],
      [401, "APIVERVE_AUTH_FAILED"],
      [403, "APIVERVE_CREDITS_EXHAUSTED"],
      [429, "RATE_LIMITED"],
      [500, "UPSTREAM_UNAVAILABLE"],
      [503, "UPSTREAM_UNAVAILABLE"],
    ];

    for (const [status, expected] of cases) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse({}, status)),
      );
      expect(await codeOf(apiverveGet("domainexpiration", {}))).toBe(expected);
    }
  });

  it("treats a transport failure as an upstream outage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timed out")));
    expect(await codeOf(apiverveGet("domainexpiration", {}))).toBe(
      "UPSTREAM_UNAVAILABLE",
    );
  });

  it("treats a non-JSON body as an upstream outage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>nope</html>")),
    );
    expect(await codeOf(apiverveGet("domainexpiration", {}))).toBe(
      "UPSTREAM_UNAVAILABLE",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/server/lib/apiverve/client.test.ts
```

Expected: FAIL — cannot resolve `@/server/lib/apiverve/client`.

- [ ] **Step 3: Write minimal implementation**

Create `src/server/lib/apiverve/client.ts`:

```ts
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

/**
 * Shared transport for APIVerve's REST endpoints.
 *
 * Deliberately free of any static `cloudflare:workers` import so this file --
 * and its error mapping, which is the part that actually decides what a user
 * is told -- can be imported by the node-environment Vitest suite.
 *
 * Nothing here retries. APIVerve bills 5 credits per call, and an automatic
 * retry on a metered endpoint is how one click becomes four charges.
 */
const APIVERVE_BASE_URL = "https://api.apiverve.com/v1";
const FETCH_TIMEOUT_MS = 5_000;

export async function apiverveGet(
  path: string,
  params: Record<string, string>,
): Promise<unknown> {
  const key = await getOptionalEnvValue("APIVERVE_API_KEY");
  if (!key) {
    // Thrown BEFORE any network call: an unset key must never spend a request.
    throw new AppError(
      "APIVERVE_NOT_CONFIGURED",
      "APIVERVE_API_KEY is not set",
    );
  }

  const url = new URL(`${APIVERVE_BASE_URL}/${path}`);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "X-API-Key": key },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      `APIVerve ${path} did not respond`,
    );
  }

  if (!response.ok) {
    throw errorForStatus(response.status, path);
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      `APIVerve ${path} returned a body that is not JSON`,
    );
  }
}

function errorForStatus(status: number, path: string): AppError {
  switch (status) {
    case 400:
      return new AppError(
        "VALIDATION_ERROR",
        `APIVerve rejected the ${path} request`,
      );
    case 401:
      return new AppError(
        "APIVERVE_AUTH_FAILED",
        "APIVerve rejected the API key",
      );
    case 403:
      return new AppError(
        "APIVERVE_CREDITS_EXHAUSTED",
        "The APIVerve account has no credits left",
      );
    case 429:
      return new AppError("RATE_LIMITED", "APIVerve rate limit reached");
    default:
      return new AppError(
        "UPSTREAM_UNAVAILABLE",
        `APIVerve ${path} failed with status ${status}`,
      );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run src/server/lib/apiverve/client.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/lib/apiverve/client.ts src/server/lib/apiverve/client.test.ts
git commit -m "Add the APIVerve transport, with a distinct code per failure"
```

---

### Task 4: Expiration fetch and cache codec

**Files:**

- Create: `src/server/lib/apiverve/domainExpiration.ts`
- Test: `src/server/lib/apiverve/domainExpiration.test.ts`

**Interfaces:**

- Consumes: `apiverveGet` (Task 3); `deriveDomainExpiration`, `DomainExpirationFacts`, `DomainExpiration` (Task 1).
- Produces: `ExpirationCache` (a KV-shaped interface), `CACHE_PREFIX`, `CACHE_TTL_SECONDS`, and `resolveDomainExpiration(domain: string, cache: ExpirationCache, nowMs: number): Promise<DomainExpiration>`.

The cache is a **parameter**, not an `env.KV` import. That is the whole reason the drift test below can exist — this file stays importable by Vitest.

- [ ] **Step 1: Write the failing test**

Create `src/server/lib/apiverve/domainExpiration.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CACHE_PREFIX,
  CACHE_TTL_SECONDS,
  resolveDomainExpiration,
  type ExpirationCache,
} from "@/server/lib/apiverve/domainExpiration";

const DAY_MS = 86_400_000;
const NOW = Date.parse("2026-08-20T00:00:00Z");

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

function apiResponse(expirationDate: string): Response {
  return new Response(
    JSON.stringify({
      status: "ok",
      error: null,
      data: {
        domain: "example.com",
        expirationDate,
        createdDate: "1996-02-22T05:00:00Z",
        lastUpdatedDate: "2023-01-17T00:16:21Z",
      },
    }),
    { headers: { "content-type": "application/json" } },
  );
}

describe("resolveDomainExpiration", () => {
  beforeEach(() => {
    process.env.APIVERVE_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.APIVERVE_API_KEY;
    vi.unstubAllGlobals();
  });

  it("stores only the absolute dates, never the derived day counts", async () => {
    const cache = fakeCache();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(apiResponse("2026-10-04T00:00:00Z")),
    );

    await resolveDomainExpiration("example.com", cache, NOW);

    const raw = cache.store.get(`${CACHE_PREFIX}example.com`);
    expect(raw).toBeDefined();
    const stored = JSON.parse(raw as string) as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual([
      "createdDate",
      "domain",
      "expirationDate",
      "lastUpdatedDate",
    ]);
  });

  it("serves a second read from cache without calling out again", async () => {
    const cache = fakeCache();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(apiResponse("2026-10-04T00:00:00Z"));
    vi.stubGlobal("fetch", fetchMock);

    await resolveDomainExpiration("example.com", cache, NOW);
    await resolveDomainExpiration("example.com", cache, NOW);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("counts down as the clock advances across a cached entry", async () => {
    const cache = fakeCache();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(apiResponse("2026-08-30T00:00:00Z")),
    );

    const fresh = await resolveDomainExpiration("example.com", cache, NOW);
    const later = await resolveDomainExpiration(
      "example.com",
      cache,
      NOW + 7 * DAY_MS,
    );

    expect(fresh.daysToExpiration).toBe(10);
    expect(fresh.status).toBe("critical");
    expect(later.daysToExpiration).toBe(3);
  });

  it("writes with the seven-day TTL", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const cache: ExpirationCache = { get: () => Promise.resolve(null), put };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(apiResponse("2026-10-04T00:00:00Z")),
    );

    await resolveDomainExpiration("example.com", cache, NOW);

    expect(put).toHaveBeenCalledWith(expect.any(String), expect.any(String), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
  });

  it("refetches rather than trusting an unparseable cache entry", async () => {
    const cache = fakeCache();
    cache.store.set(`${CACHE_PREFIX}example.com`, "{ not json");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(apiResponse("2026-10-04T00:00:00Z"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveDomainExpiration("example.com", cache, NOW);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.daysToExpiration).toBe(45);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/server/lib/apiverve/domainExpiration.test.ts
```

Expected: FAIL — cannot resolve `@/server/lib/apiverve/domainExpiration`.

- [ ] **Step 3: Write minimal implementation**

Create `src/server/lib/apiverve/domainExpiration.ts`:

```ts
import { z } from "zod";
import { apiverveGet } from "@/server/lib/apiverve/client";
import { AppError } from "@/server/lib/errors";
import {
  deriveDomainExpiration,
  type DomainExpiration,
  type DomainExpirationFacts,
} from "@/shared/domainExpiration";

export const CACHE_PREFIX = "apiverve-domain-exp:v1:";
export const CACHE_TTL_SECONDS = 604_800; // 7 days

/**
 * The slice of KVNamespace this module needs, taken as a parameter rather than
 * imported from `cloudflare:workers`. That keeps this file importable by the
 * node-environment Vitest suite, which is the only way the "counts down across
 * a cached entry" test can exist at all.
 */
export type ExpirationCache = {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options: { expirationTtl: number },
  ): Promise<void>;
};

/**
 * Only the absolute dates are read off the wire. The derived day counts
 * APIVerve also returns are deliberately discarded -- they are correct only at
 * the instant of the call, and caching them is the silent-drift bug.
 */
const responseSchema = z.object({
  data: z.object({
    domain: z.string(),
    expirationDate: z.string().nullish(),
    createdDate: z.string().nullish(),
    lastUpdatedDate: z.string().nullish(),
  }),
});

const cachedFactsSchema = z.object({
  domain: z.string(),
  expirationDate: z.string().nullable(),
  createdDate: z.string().nullable(),
  lastUpdatedDate: z.string().nullable(),
});

export async function resolveDomainExpiration(
  domain: string,
  cache: ExpirationCache,
  nowMs: number,
): Promise<DomainExpiration> {
  const cacheKey = `${CACHE_PREFIX}${domain}`;

  const cached = await cache.get(cacheKey);
  if (cached !== null) {
    const facts = parseCachedFacts(cached);
    // A corrupt entry falls through to a fresh fetch rather than throwing:
    // a bad cache write must not make a domain permanently unreadable.
    if (facts) return deriveDomainExpiration(facts, nowMs);
  }

  const facts = await fetchDomainExpirationFacts(domain);
  await cache.put(cacheKey, JSON.stringify(facts), {
    expirationTtl: CACHE_TTL_SECONDS,
  });
  return deriveDomainExpiration(facts, nowMs);
}

async function fetchDomainExpirationFacts(
  domain: string,
): Promise<DomainExpirationFacts> {
  const body = await apiverveGet("domainexpiration", { domain });
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      "APIVerve returned an unexpected domain expiration response",
    );
  }

  return {
    domain: parsed.data.data.domain,
    expirationDate: parsed.data.data.expirationDate ?? null,
    createdDate: parsed.data.data.createdDate ?? null,
    lastUpdatedDate: parsed.data.data.lastUpdatedDate ?? null,
  };
}

function parseCachedFacts(raw: string): DomainExpirationFacts | null {
  try {
    const parsed = cachedFactsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run src/server/lib/apiverve/domainExpiration.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/lib/apiverve/domainExpiration.ts src/server/lib/apiverve/domainExpiration.test.ts
git commit -m "Cache domain expiry facts, derive the countdown on every read"
```

---

### Task 5: Server function

**Files:**

- Create: `src/serverFunctions/domainExpiration.ts`

**Interfaces:**

- Consumes: `resolveDomainExpiration`, `ExpirationCache` (Task 4); `normalizeDomainInput` from `@/server/lib/domainUtils`; `requireProjectContext` from `@/serverFunctions/middleware`.
- Produces: `getDomainExpiration` — a `createServerFn` accepting `{ projectId: string; domain: string }` and resolving to `DomainExpiration` (Task 1).

This is the only file in the phase that statically imports `cloudflare:workers`, so it is glue only and carries no logic and no unit test. Everything it would have been worth testing already lives in Tasks 1, 3 and 4.

`normalizeDomainInput(input, false)` returns the registrable domain (eTLD+1) via `tldts`. `false` is correct and deliberate: a subdomain has no independent registration and therefore no expiry of its own, so `blog.example.com` and `example.com` must resolve to one cache entry.

- [ ] **Step 1: Write the implementation**

Create `src/serverFunctions/domainExpiration.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  resolveDomainExpiration,
  type ExpirationCache,
} from "@/server/lib/apiverve/domainExpiration";
import { normalizeDomainInput } from "@/server/lib/domainUtils";
import { requireProjectContext } from "@/serverFunctions/middleware";

/**
 * Domain expiry for one domain, cache-first. Billed at 5 APIVerve credits on a
 * cache miss and free for the next seven days, so callers must gate this
 * behind an explicit user action -- see DomainExpirationCard's useAuthorizedRun.
 *
 * Glue only: the transport, the error mapping and the cache codec all live in
 * `src/server/lib/apiverve/`, because this module's `cloudflare:workers`
 * import puts it out of reach of the node-environment test suite.
 */
const inputSchema = z.object({
  projectId: z.string().min(1),
  domain: z.string().trim().min(1).max(253),
});

export const getDomainExpiration = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(inputSchema)
  .handler(async ({ data }) => {
    // `false` = collapse to the registrable domain. A subdomain cannot expire
    // independently, so it must not get its own cache entry or its own charge.
    const domain = normalizeDomainInput(data.domain, false);

    const cache: ExpirationCache = {
      get: (key) => env.KV.get(key),
      put: (key, value, options) => env.KV.put(key, value, options),
    };

    return resolveDomainExpiration(domain, cache, Date.now());
  });
```

- [ ] **Step 2: Typecheck**

```bash
pnpm tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/serverFunctions/domainExpiration.ts
git commit -m "Expose domain expiry as a project-scoped server function"
```

---

### Task 6: Domain Overview card

**Files:**

- Create: `src/client/features/domain/components/DomainExpirationCard.tsx`
- Modify: `src/client/features/domain/DomainOverviewPage.tsx`

**Interfaces:**

- Consumes: `getDomainExpiration` (Task 5); `DomainExpiration`, `DomainExpirationStatus` (Task 1).
- Produces: `DomainExpirationCard({ projectId, domain }: { projectId: string; domain: string })`.

`DomainOverviewPage.tsx` is already 945 lines and carries an eslint-disable for `max-lines`. Do not add markup to it — the card is self-contained and mounted with one element, matching `DomainCompetitorsCard` and `DomainVisibilityTrend`.

`useMeteredQuery` omits `retry` from its options type, so the no-auto-retry rule is enforced by using it. `useAuthorizedRun` is what keeps the call behind a click.

- [ ] **Step 1: Write the component**

Create `src/client/features/domain/components/DomainExpirationCard.tsx`:

```tsx
import { getDomainExpiration } from "@/serverFunctions/domainExpiration";
import {
  createMeteredRunKey,
  useAuthorizedRun,
  useMeteredQuery,
} from "@/client/lib/useMeteredQuery";
import { InlineQueryError } from "@/client/components/InlineQueryError";
import type { DomainExpirationStatus } from "@/shared/domainExpiration";
import { Button } from "@cloudflare/kumo/components/button";
import { Loader } from "@cloudflare/kumo/components/loader";

const STATUS_LABELS: Record<DomainExpirationStatus, string> = {
  expired: "Expired",
  critical: "Expires soon",
  warning: "Renew this quarter",
  healthy: "Healthy",
};

const STATUS_CLASSES: Record<DomainExpirationStatus, string> = {
  expired: "text-error",
  critical: "text-error",
  warning: "text-warning",
  healthy: "text-success",
};

/** Unknown renders as an em dash, never as 0 or "healthy". */
function formatDays(value: number | null): string {
  return value == null ? "—" : Math.round(value).toLocaleString();
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatYears(value: number | null): string {
  return value == null ? "—" : `${value.toLocaleString()} yrs`;
}

/** Registration health for the project's own domain: when it expires, how long
 *  it has been around. One APIVerve call per domain per week. */
export function DomainExpirationCard({
  projectId,
  domain,
}: {
  projectId: string;
  domain: string;
}) {
  const run = useAuthorizedRun(
    createMeteredRunKey(projectId, domain.trim(), 1),
  );
  const expirationQuery = useMeteredQuery({
    authorized: run.authorized,
    runNonce: run.runNonce,
    queryKey: ["domain-expiration", projectId, domain],
    queryFn: () => getDomainExpiration({ data: { projectId, domain } }),
  });
  const data = expirationQuery.data ?? null;
  const status = data?.status ?? null;

  return (
    <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-2 p-4 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs uppercase tracking-wide text-base-content/60">
            Domain registration
          </p>
          {status ? (
            <span className={`text-xs font-medium ${STATUS_CLASSES[status]}`}>
              {STATUS_LABELS[status]}
            </span>
          ) : null}
        </div>

        {!run.authorized ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="self-start"
            onClick={() => run.authorize()}
          >
            Check domain health
          </Button>
        ) : expirationQuery.isLoading ? (
          <div className="flex justify-center py-4">
            <Loader size="sm" />
          </div>
        ) : expirationQuery.isError ? (
          <InlineQueryError
            message="Domain registration data could not be loaded."
            retrying={expirationQuery.isFetching}
            onRetry={() => void expirationQuery.refetch()}
          />
        ) : data ? (
          <dl className="grid grid-cols-3 gap-3">
            <div>
              <dt className="text-xs text-base-content/60">Expires</dt>
              <dd className="font-medium">{formatDate(data.expirationDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-base-content/60">Days left</dt>
              <dd className="font-medium">
                {formatDays(data.daysToExpiration)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-base-content/60">Age</dt>
              <dd className="font-medium">
                {formatYears(data.domainAgeYears)}
              </dd>
            </div>
          </dl>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mount it**

In `src/client/features/domain/DomainOverviewPage.tsx`, add the import beside the existing `DomainCompetitorsCard` import (around line 57):

```tsx
import { DomainExpirationCard } from "@/client/features/domain/components/DomainExpirationCard";
```

Then render it directly after the existing `DomainCompetitorsCard` block, which sits at roughly line 873. Match its `hasData` guard exactly — without it the card renders against an empty domain string:

```tsx
{
  state.overview.hasData ? (
    <DomainExpirationCard
      projectId={projectId}
      domain={state.overview.domain}
    />
  ) : null;
}
```

- [ ] **Step 3: Typecheck and lint**

```bash
pnpm tsc --noEmit && pnpm oxlint src/client/features/domain --type-aware
```

Expected: clean.

- [ ] **Step 4: Verify in the browser**

Start the dev server and open a project's Domain tab. Confirm:

1. The card renders with a **"Check domain health" button and no data** on load — if any request fires before the click, the no-auto-spend rule is broken and this must be fixed before commit.
2. Clicking it populates expiry date, days left and age.
3. A reload returns to the un-authorized button state.

This step needs `APIVERVE_API_KEY` in `.env.local`. Ask the operator for it — do not attempt to source or enter a key.

- [ ] **Step 5: Commit**

```bash
git add src/client/features/domain/components/DomainExpirationCard.tsx src/client/features/domain/DomainOverviewPage.tsx
git commit -m "Show domain registration health on the Domain Overview tab"
```

---

### Task 7: SAM/MCP tool

**Files:**

- Create: `src/server/mcp/tools/domain-expiration-tools.ts`
- Modify: `src/server/mcp/register-research-tools.ts`

**Files (revised):**

- Modify: `src/server/mcp/schemas.ts`
- Modify: `src/server/mcp/tools/domain-analytics-tools.ts:13-24`
- Create: `src/server/mcp/tools/domain-expiration-tools.ts`
- Modify: `src/server/mcp/register-research-tools.ts`

**Interfaces:**

- Consumes: `resolveDomainExpiration`, `ExpirationCache` (Task 4); `projectIdSchema` from `@/server/mcp/schemas`; `withMcpProjectAuth` from `@/server/mcp/project-auth`; `mcpResponse` from `@/server/mcp/formatters`; `buildProjectMeta` from `@/server/mcp/context`; `optionalMetaOutputSchema` from `@/server/mcp/output-schemas`.
- Produces: `domainTargetSchema` (relocated, now exported from `@/server/mcp/schemas`) and `getDomainExpirationTool`.

The existing `get_domain_whois` tool stays exactly as it is. This one is additive, and unlike that tool it does not charge DataForSEO credits — say so in the description so the agent picks the cheaper tool when either would do.

- [ ] **Step 1: Relocate the shared domain schema**

`domainTargetSchema` is currently a module-local `const` in `domain-analytics-tools.ts:13-24` and is **not exported**, so it cannot be imported. Move it to `src/server/mcp/schemas.ts` — the file that already owns `projectIdSchema` — by appending:

```ts
export const domainTargetSchema = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (value) =>
      /^(?!https?:\/\/)(?!www\.)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(
        value,
      ),
    "Use a domain or subdomain without protocol and without www.",
  );
```

Then delete the local `const domainTargetSchema = ...` block from `domain-analytics-tools.ts` and add `domainTargetSchema` to its existing `@/server/mcp/schemas` import, which already brings in `projectIdSchema`.

- [ ] **Step 2: Write the tool**

Create `src/server/mcp/tools/domain-expiration-tools.ts`:

```ts
import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  resolveDomainExpiration,
  type ExpirationCache,
} from "@/server/lib/apiverve/domainExpiration";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { domainTargetSchema, projectIdSchema } from "@/server/mcp/schemas";

const expirationOutputSchema = z.object({
  domain: z.string(),
  expirationDate: z.string().nullable(),
  createdDate: z.string().nullable(),
  lastUpdatedDate: z.string().nullable(),
  daysToExpiration: z.number().nullable(),
  domainAgeDays: z.number().nullable(),
  domainAgeYears: z.number().nullable(),
  daysSinceLastUpdate: z.number().nullable(),
  status: z.enum(["expired", "critical", "warning", "healthy"]).nullable(),
});

const getDomainExpirationInputSchema = {
  projectId: projectIdSchema,
  domain: domainTargetSchema.describe(
    "Registrable domain (no protocol/www/subdomain) to check registration expiry for.",
  ),
} as const;

type GetDomainExpirationArgs = z.infer<
  z.ZodObject<typeof getDomainExpirationInputSchema>
>;

export const getDomainExpirationTool = {
  name: "get_domain_expiration",
  config: {
    title: "Get domain expiration",
    description:
      "Returns a domain's registration expiry date, days remaining, health status and age. Does NOT charge DataForSEO credits — prefer this over get_domain_whois when only expiry or age is needed.",
    inputSchema: getDomainExpirationInputSchema,
    outputSchema: {
      expiration: expirationOutputSchema.nullable(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: GetDomainExpirationArgs, context) => {
      const cache: ExpirationCache = {
        get: (key) => env.KV.get(key),
        put: (key, value, options) => env.KV.put(key, value, options),
      };
      const expiration = await resolveDomainExpiration(
        args.domain,
        cache,
        Date.now(),
      );

      const text = [
        `Registration for ${expiration.domain}:`,
        `- expires: ${expiration.expirationDate ?? "—"}`,
        `- days remaining: ${expiration.daysToExpiration ?? "unknown"}`,
        `- status: ${expiration.status ?? "unknown"}`,
        `- age: ${expiration.domainAgeYears == null ? "unknown" : `${expiration.domainAgeYears} years`}`,
      ].join("\n");

      return mcpResponse({
        text,
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/domain`,
        ),
        structuredContent: { expiration },
      });
    },
  ),
};
```

- [ ] **Step 3: Register it**

In `src/server/mcp/register-research-tools.ts`, add the import beside the existing `domain-analytics-tools` import (around line 38):

```ts
import { getDomainExpirationTool } from "@/server/mcp/tools/domain-expiration-tools";
```

Then inside `registerMarketIntelligenceTools`, append a registration block in the exact shape of the surrounding ones:

```ts
server.registerTool(
  getDomainExpirationTool.name,
  getDomainExpirationTool.config,
  instrumentMcpToolHandler(
    getDomainExpirationTool.name,
    getDomainExpirationTool.config.outputSchema,
    getDomainExpirationTool.handler,
  ),
);
```

- [ ] **Step 4: Typecheck**

```bash
pnpm tsc --noEmit
```

Expected: clean. If `src/server/mcp/tools/output-schema-validation.test.ts` enumerates tools, add `getDomainExpirationTool` to it and re-run.

- [ ] **Step 5: Run the full suite**

```bash
pnpm ci:check && pnpm test
```

Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/server/mcp/tools/domain-expiration-tools.ts src/server/mcp/register-research-tools.ts
git commit -m "Give SAM a credit-free domain expiry tool"
```

---

## Deliberately deferred from the spec

The spec lists `getBulkDomainExpiration` (capped array, concurrency 5,
`MAX_DOMAINS_PER_CALL = 100`) as a Phase 1 module. **This plan does not build
it**, because Phase 1 has no consumer for it — the card looks up exactly one
domain. Its first real callers are the Phase 2 finder and the Phase 3 table, and
a bulk API shaped before either exists would be guesswork, and would ship
untested against real use.

It is cheap to add later: `resolveDomainExpiration` already takes the cache and
the clock as parameters, so a bulk wrapper is a concurrency-limited `map` over
it with no changes to Tasks 1–4. Build it in Phase 2, alongside the caller that
defines what it actually needs.

## Done criteria

- [ ] `pnpm ci:check && pnpm test` both clean.
- [ ] Domain tab shows the card, and **fires no request until clicked**.
- [ ] A second click within 7 days serves from KV with no APIVerve call (check the Worker log or add a temporary counter — remove it before commit).
- [ ] With `APIVERVE_API_KEY` unset, the card surfaces the `APIVERVE_NOT_CONFIGURED` copy instead of crashing.
- [ ] `wrangler secret put APIVERVE_API_KEY` run against prod **by the operator** before deploy.
