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

/** Sorted top-level keys of a JSON string, or `[]` if it isn't an object.
 *  A guard rather than a cast, so the lint rule stays satisfied and a
 *  non-object cache entry fails the assertion instead of throwing. */
function sortedKeysOf(json: string): string[] {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null) return [];
  return Object.keys(parsed).toSorted();
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
    expect(sortedKeysOf(raw ?? "null")).toEqual([
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
