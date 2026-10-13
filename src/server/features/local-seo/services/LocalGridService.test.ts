import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  cache: new Map<string, unknown>(),
  local: vi.fn(),
}));
vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: async (prefix: string, params: unknown) =>
    `${prefix}:${JSON.stringify(params)}`,
  getCached: async (key: string) => state.cache.get(key) ?? null,
  setCached: async (key: string, data: unknown) => {
    state.cache.set(key, data);
  },
}));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({ serp: { local: state.local } }),
}));
vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: {
    getProjectById: async () => ({ domain: "example.com" }),
  },
}));
// Run the real server-function handler without the RPC transport; actual hosted
// authentication/validation remains covered by application acceptance tests.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      middleware: () => chain,
      validator: () => chain,
      handler: (handler: unknown) => handler,
    };
    return chain;
  },
}));
vi.mock("@/serverFunctions/middleware", () => ({ requireProjectContext: [] }));
import {
  getCachedLocalGridCells,
  getLocalGridCell,
} from "@/serverFunctions/local-grid";
const context = {
  organizationId: "org-1",
  userId: "user-1",
  userEmail: "user@example.com",
  projectId: "project-1",
};
const data = { projectId: "project-1", keyword: "coffee", lat: 0, lng: 0 };
// The test shim above returns the real handler instead of its RPC wrapper.
// eslint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- The shape is fixed by the createServerFn test shim.
const cellHandler = getLocalGridCell as unknown as (args: {
  data: typeof data;
  context: typeof context;
}) => Promise<Awaited<ReturnType<typeof getLocalGridCell>>>;
// eslint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- The shape is fixed by the createServerFn test shim.
const restoreHandler = getCachedLocalGridCells as unknown as (args: {
  data: {
    projectId: string;
    keyword: string;
    points: { lat: number; lng: number }[];
  };
  context: typeof context;
}) => Promise<Awaited<ReturnType<typeof getCachedLocalGridCells>>>;
function cell() {
  return cellHandler({ data, context });
}
function restore(projectId = "project-1") {
  return restoreHandler({
    data: { projectId, keyword: "coffee", points: [{ lat: 0, lng: 0 }] },
    context: { ...context, projectId },
  });
}
describe("Local grid scoped cache observation", () => {
  beforeEach(() => {
    state.cache.clear();
    state.local.mockReset().mockResolvedValue([]);
  });
  it("returns source/depth/scope and preserves the original observed empty capture in cache", async () => {
    const first = await cell();
    expect(first).toMatchObject({
      contractVersion: 2,
      position: null,
      source: "DataForSEO Local Finder",
      scope: {
        organizationId: "org-1",
        projectId: "project-1",
        domain: "example.com",
        keyword: "coffee",
        lat: "0.0000",
        lng: "0.0000",
        languageCode: "en",
        device: "desktop",
        depth: 20,
      },
    });
    expect(await cell()).toEqual(first);
    expect(await restore()).toEqual([{ lat: 0, lng: 0, ...first }]);
    expect(state.local).toHaveBeenCalledTimes(1);
  });
  it("never restores another project's same-domain grid or calls a provider on a restore miss", async () => {
    await cell();
    expect(await restore("project-2")).toEqual([]);
    expect(state.local).toHaveBeenCalledTimes(1);
  });
});
