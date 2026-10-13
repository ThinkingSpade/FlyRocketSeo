import { expect, it, vi } from "vitest";
import { createBacklinksService } from "./BacklinksService";

vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: async (prefix: string, params: Record<string, unknown>) =>
    `${prefix}:${JSON.stringify(params)}`,
  getCached: async () => null,
  setCached: async () => {},
}));
vi.mock("@/server/lib/dataforseo", async () => {
  const target = await import("@/server/lib/dataforseoBacklinksTarget");
  return {
    normalizeBacklinksTarget: target.normalizeBacklinksTarget,
    createDataforseoClient: () => ({
      backlinks: {
        rows: async () => ({ items: [{ anchor: "rocket" }], totalCount: 1 }),
      },
    }),
  };
});

it("persists normalized request provenance through tab cache reuse without replacing the capture date", async () => {
  const cache = new Map<string, string>();
  const service = createBacklinksService({
    get: async (key) => {
      const stored = cache.get(key);
      const parsed: unknown = stored ? JSON.parse(stored) : null;
      return parsed;
    },
    set: async (key, value) => {
      cache.set(key, JSON.stringify(value));
    },
  });
  const input = {
    projectId: "project",
    target: "https://docs.example.com/start",
    scope: "domain" as const,
    page: 1,
    pageSize: 25,
    sortField: "rank" as const,
    sortOrder: "desc" as const,
    filters: {},
    mode: "as_is" as const,
  };
  const customer = {
    organizationId: "org",
    userId: "user",
    userEmail: "test@example.com",
  };
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-09-12T03:04:05Z"));
    const first = await service.profileBacklinksPage(input, customer);
    vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
    const restored = await service.profileBacklinksPage(input, customer);
    expect(restored).toMatchObject({
      fetchedAt: "2026-09-12T03:04:05.000Z",
      provenance: {
        source: "DataForSEO",
        target: "docs.example.com",
        scope: "domain",
        includeSubdomains: true,
      },
    });
    expect(restored.rows).toEqual(first.rows);
  } finally {
    vi.useRealTimers();
  }
});
