import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ARCHIVE_CACHE_PREFIX,
  ARCHIVE_CACHE_TTL_SECONDS,
  hadArchivedSite,
} from "@/server/lib/wayback";

function fakeCache() {
  const store = new Map<string, string>();
  return {
    store,
    get: (key: string) => Promise.resolve(store.get(key) ?? null),
    put: (key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    },
  };
}

function archivedResponse(archived: boolean): Response {
  return new Response(
    JSON.stringify(
      archived
        ? {
            archived_snapshots: {
              closest: {
                available: true,
                url: "http://web.archive.org/web/2019/http://example.com/",
                timestamp: "20190101000000",
                status: "200",
              },
            },
          }
        : { archived_snapshots: {} },
    ),
    { headers: { "content-type": "application/json" } },
  );
}

describe("hadArchivedSite", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports a domain that was archived", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(archivedResponse(true)));
    expect(await hadArchivedSite("example.com")).toBe(true);
  });

  it("reports a domain that never was", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(archivedResponse(false)));
    expect(await hadArchivedSite("example.com")).toBe(false);
  });

  // Wayback is a free public service with no SLA. A blip must read as "we do
  // not know", not as "this domain never existed" -- the latter would silently
  // discard a real acquisition target.
  it("returns null rather than false when the lookup fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 503 })),
    );
    expect(await hadArchivedSite("example.com")).toBeNull();
  });

  it("returns null on a transport failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect(await hadArchivedSite("example.com")).toBeNull();
  });

  it("returns null on a body it cannot parse", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>")));
    expect(await hadArchivedSite("example.com")).toBeNull();
  });

  it("asks archive.org over https for the given domain", async () => {
    let requested = "";
    vi.stubGlobal(
      "fetch",
      vi.fn((url: unknown) => {
        requested = String(url);
        return Promise.resolve(archivedResponse(true));
      }),
    );

    await hadArchivedSite("example.com");

    expect(requested).toContain("https://archive.org/wayback/available");
    expect(requested).toContain("url=example.com");
  });
});

describe("hadArchivedSite caching", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves a repeat lookup from cache", async () => {
    const cache = fakeCache();
    const fetchMock = vi.fn().mockResolvedValue(archivedResponse(true));
    vi.stubGlobal("fetch", fetchMock);

    await hadArchivedSite("example.com", cache);
    await hadArchivedSite("example.com", cache);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cache.store.get(`${ARCHIVE_CACHE_PREFIX}example.com`)).toBe("true");
  });

  it("caches a false answer distinctly from an absent key", async () => {
    const cache = fakeCache();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(archivedResponse(false)));

    expect(await hadArchivedSite("example.com", cache)).toBe(false);
    expect(cache.store.get(`${ARCHIVE_CACHE_PREFIX}example.com`)).toBe("false");
  });

  // archive.org rate-limits. Caching a 429 would suppress retries for a month
  // over a transient throttle.
  it("does not cache a failed lookup", async () => {
    const cache = fakeCache();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("429", { status: 429 })),
    );

    expect(await hadArchivedSite("example.com", cache)).toBeNull();
    expect(cache.store.size).toBe(0);
  });

  it("writes with the long TTL", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(archivedResponse(true)));

    await hadArchivedSite("example.com", {
      get: () => Promise.resolve(null),
      put,
    });

    expect(put).toHaveBeenCalledWith(expect.any(String), "true", {
      expirationTtl: ARCHIVE_CACHE_TTL_SECONDS,
    });
  });
});
