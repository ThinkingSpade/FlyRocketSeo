import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CACHE_PREFIX,
  CACHE_TTL_SECONDS,
  FETCH_CONCURRENCY,
  MAX_DOMAINS_PER_CALL,
  resolveDomainExpiration,
  resolveDomainExpirations,
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

  // Regression: the MCP tool passed its raw `domain` argument straight through
  // while the server function normalized first, so `blog.deliotx.com` and
  // `deliotx.com` produced two cache keys and two billed calls for one
  // registrable domain -- and the card and SAM stopped sharing a cache at all.
  // Normalizing inside resolve() makes that unrepresentable for every caller.
  it("collapses subdomains and www to one registrable-domain cache entry", async () => {
    const cache = fakeCache();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(apiResponse("2026-10-04T00:00:00Z"));
    vi.stubGlobal("fetch", fetchMock);

    await resolveDomainExpiration("deliotx.com", cache, NOW);
    await resolveDomainExpiration("www.deliotx.com", cache, NOW);
    await resolveDomainExpiration("blog.deliotx.com", cache, NOW);
    await resolveDomainExpiration("https://deliotx.com/pricing", cache, NOW);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect([...cache.store.keys()]).toEqual([`${CACHE_PREFIX}deliotx.com`]);
  });

  it("asks APIVerve for the registrable domain, not the raw input", async () => {
    const cache = fakeCache();
    let requestedUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn((url: unknown) => {
        requestedUrl = String(url);
        return Promise.resolve(apiResponse("2026-10-04T00:00:00Z"));
      }),
    );

    await resolveDomainExpiration("blog.deliotx.com", cache, NOW);

    expect(requestedUrl).toContain("domain=deliotx.com");
    expect(requestedUrl).not.toContain("blog.");
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
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            inFlight += 1;
            peak = Math.max(peak, inFlight);
            setTimeout(() => {
              inFlight -= 1;
              resolve(apiResponse("2026-10-04T00:00:00Z"));
            }, 5);
          }),
      ),
    );

    const domains = Array.from({ length: 20 }, (_, index) => `d${index}.com`);
    await resolveDomainExpirations(domains, cache, NOW);

    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(FETCH_CONCURRENCY);
  });

  // A truncated sweep that looks complete is worse than a refusal: the finder
  // would report "none expired" over domains it never actually checked.
  it("rejects an over-cap batch instead of silently truncating", async () => {
    const cache = fakeCache();
    const domains = Array.from(
      { length: MAX_DOMAINS_PER_CALL + 1 },
      (_, index) => `d${index}.com`,
    );

    await expect(resolveDomainExpirations(domains, cache, NOW)).rejects.toThrow(
      /exceeds the cap/,
    );
  });

  it("skips unparseable domains rather than throwing the batch away", async () => {
    const cache = fakeCache();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(apiResponse("2026-10-04T00:00:00Z")),
    );

    const result = await resolveDomainExpirations(
      ["good.com", "not a domain"],
      cache,
      NOW,
    );

    expect([...result.keys()]).toEqual(["good.com"]);
  });
});
