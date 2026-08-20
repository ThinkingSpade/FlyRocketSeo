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

  // A cached `false` must be distinguishable from an absent key, exactly as
  // the Ahrefs DR cache had to distinguish a real 0 from "no answer".
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

  // Collapsing a failure to `false` would render as "taken" and bury a domain
  // that is in fact available -- the exact result the finder exists to surface.
  it("returns null rather than false when the lookup fails", async () => {
    const cache = fakeCache();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 500 })),
    );

    expect(await resolveDomainAvailability("example.com", cache)).toBeNull();
  });

  it("does not cache a failure, so the next run can retry", async () => {
    const cache = fakeCache();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 500 })),
    );

    await resolveDomainAvailability("example.com", cache);

    expect(cache.store.size).toBe(0);
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
