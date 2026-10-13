import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  ranked: vi.fn(),
  pages: vi.fn(),
  cache: new Map<string, unknown>(),
  fallback: null as unknown,
}));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({
    domain: { rankedKeywords: state.ranked, relevantPages: state.pages },
  }),
}));
vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: async (prefix: string, params: Record<string, unknown>) =>
    `${prefix}:${JSON.stringify(params)}`,
  getCached: async (key: string) => state.cache.get(key) ?? state.fallback,
  setCached: async (key: string, result: unknown) => {
    state.cache.set(key, result);
  },
}));
import { getKeywordsPage } from "./domainKeywordsPage";
import { getPagesPage } from "./domainPagesPage";
const input = {
  projectId: "project",
  domain: "example.com",
  includeSubdomains: false,
  locationCode: 2840,
  languageCode: "en",
  page: 1,
  pageSize: 50,
  sortMode: "traffic" as const,
  sortOrder: "desc" as const,
  filters: {},
};
const billing = {
  organizationId: "org",
  userId: "user",
  userEmail: "user@example.com",
};
beforeEach(() => {
  vi.clearAllMocks();
  state.cache.clear();
  state.fallback = null;
});
describe("Domain research pages scoped caches", () => {
  it("preserves pages estimates and treats invalid count as unknown", async () => {
    state.pages.mockResolvedValue({
      items: [
        {
          page_address: "https://example.com/page",
          metrics: { organic: { etv: 0.1234, count: 1.5 } },
        },
      ],
      totalCount: 1,
    });
    expect((await getPagesPage(input, billing)).pages[0]).toMatchObject({
      organicTraffic: 0.1234,
      keywords: null,
    });
  });
  it("versions keyword/pages caches, retains capture time and isolates tenants", async () => {
    state.ranked.mockResolvedValue({
      items: [{ keyword: "seo" }],
      totalCount: 0,
    });
    state.pages.mockResolvedValue({ items: [], totalCount: 0 });
    const first = await getKeywordsPage(input, billing);
    expect(first).toMatchObject({
      contractVersion: 2,
      source: "DataForSEO Labs",
      scope: {
        locationCode: 2840,
        languageCode: "en",
        includeSubdomains: false,
        providerScope: "target",
      },
    });
    expect((await getKeywordsPage(input, billing)).fetchedAt).toBe(
      first.fetchedAt,
    );
    expect(state.ranked).toHaveBeenCalledTimes(1);
    await getKeywordsPage(input, { ...billing, organizationId: "other" });
    expect(state.ranked).toHaveBeenCalledTimes(2);
    expect((await getPagesPage(input, billing)).contractVersion).toBe(2);
  });
  it("does not reuse legacy rounded mapped payloads", async () => {
    state.fallback = {
      domain: "example.com",
      page: 1,
      pageSize: 50,
      totalCount: 1,
      hasMore: false,
      keywords: [],
      pages: [],
      fetchedAt: "2020-01-01T00:00:00.000Z",
    };
    state.ranked.mockResolvedValue({ items: [], totalCount: 0 });
    state.pages.mockResolvedValue({ items: [], totalCount: 0 });
    expect((await getKeywordsPage(input, billing)).fetchedAt).not.toBe(
      "2020-01-01T00:00:00.000Z",
    );
    expect((await getPagesPage(input, billing)).fetchedAt).not.toBe(
      "2020-01-01T00:00:00.000Z",
    );
  });
  it("uses raw provider page length to infer continuation if some unusable rows are omitted", async () => {
    state.ranked.mockResolvedValue({
      items: Array.from({ length: 50 }, (_, i) =>
        i ? { keyword: `seo${i}` } : { keyword: null },
      ),
      totalCount: null,
    });
    expect((await getKeywordsPage(input, billing)).hasMore).toBe(true);
  });
});
