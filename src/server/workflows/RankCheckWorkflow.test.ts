import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowStep, WorkflowStepConfig } from "cloudflare:workers";
const state = vi.hoisted(() => ({
  run: {
    id: "run-1",
    status: "pending",
    keywordsTotal: 2,
    keywordsChecked: 0,
  } as Record<string, unknown>,
  snapshots: [] as Array<Record<string, unknown>>,
  rank: vi.fn(),
  updateConfig: vi.fn(),
  capture: vi.fn(),
  stepConfigs: [] as unknown[],
}));
vi.mock("cloudflare:workers", () => ({
  WorkflowEntrypoint: class {
    constructor(public env: unknown = {}) {}
  },
  env: {},
}));
vi.mock("cloudflare:workflows", () => ({
  NonRetryableError: class extends Error {},
}));
vi.mock("@/db", () => ({
  withPgClient: async (callback: () => Promise<unknown>) => callback(),
}));
vi.mock("@/server/lib/posthog", () => ({ captureServerEvent: state.capture }));
vi.mock("@/server/workflows/rankCheckBilling", () => ({
  assertRankCheckCreditsAvailable: async () => undefined,
}));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({ serp: { rankCheck: state.rank } }),
  MAX_TASKS_PER_POST: 100,
}));
vi.mock("@/server/features/rank-tracking/services/rankCheckRunGuards", () => ({
  failRunIfActive: async (_id: string, errorMessage: string) => {
    state.run.status = "failed";
    state.run.errorMessage = errorMessage;
  },
}));
vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({
    RankTrackingRepository: {
      getConfigById: async () => ({ isActive: true }),
      getRunById: async () => state.run,
      getKeywordsForConfig: async () => [
        { id: "kw-1", keyword: "alpha" },
        { id: "kw-2", keyword: "beta" },
      ],
      updateRun: async (_id: string, update: object) => {
        Object.assign(state.run, update);
      },
      insertSnapshots: async (rows: Array<Record<string, unknown>>) => {
        state.snapshots.push(...rows);
      },
      getSnapshotsForRun: async () => state.snapshots,
      updateConfig: state.updateConfig,
    },
  }),
);
import { RankCheckWorkflow } from "./RankCheckWorkflow";
const step: WorkflowStep = {
  do: async <T extends Rpc.Serializable<T>>(
    _name: string,
    config: WorkflowStepConfig | (() => Promise<T>),
    callback?: () => Promise<T>,
  ) => {
    state.stepConfigs.push(config);
    if (typeof config === "function") return config();
    if (!callback) throw new Error("Missing fixture callback");
    return callback();
  },
  sleep: async () => undefined,
  sleepUntil: async () => undefined,
  waitForEvent: async () => {
    throw new Error("No fixture events");
  },
};
function run() {
  const workflow: unknown = Reflect.construct(RankCheckWorkflow, []);
  if (!(workflow instanceof RankCheckWorkflow))
    throw new Error("Invalid workflow fixture");
  return workflow.run(
    {
      timestamp: new Date(),
      instanceId: "run-1",
      payload: {
        runId: "run-1",
        configId: "config-1",
        projectId: "project-1",
        billingCustomer: {
          organizationId: "org-1",
          userId: "user-1",
          userEmail: "user@example.com",
        },
        trigger: "manual",
        domain: "example.com",
        locationCode: 2840,
        languageCode: "en",
        devices: "both",
        serpDepth: 20,
      },
    },
    step,
  );
}
describe("configured rank workflow failures and partial results", () => {
  beforeEach(() => {
    state.run = {
      id: "run-1",
      status: "pending",
      keywordsTotal: 2,
      keywordsChecked: 0,
    };
    state.snapshots = [];
    state.rank.mockReset();
    state.stepConfigs = [];
    state.updateConfig.mockClear();
  });
  it("retains good device observations but records a failed device even when every keyword has one successful result", async () => {
    state.rank.mockImplementation(
      async (input: { keywordId: string; keyword: string; device: string }) => {
        if (input.keywordId === "kw-1" && input.device === "mobile")
          throw new Error("isolated provider failed cell");
        return {
          keywordId: input.keywordId,
          keyword: input.keyword,
          position: input.keywordId === "kw-2" ? null : 3,
          url: null,
          serpFeatures: [],
        };
      },
    );
    await run();
    expect(state.snapshots).toHaveLength(3);
    expect(state.run).toMatchObject({
      status: "completed",
      keywordsChecked: 2,
      errorMessage: "1 of 4 device check(s) could not be checked",
    });
    expect(state.stepConfigs).toContainEqual({
      retries: { limit: 0, delay: "1 second" },
      timeout: "2 minutes",
    });
  });
  it("marks an all-failed check as failed instead of a completed integration and never replays billable calls", async () => {
    state.rank.mockRejectedValue(new Error("isolated unavailable provider"));
    await run();
    expect(state.run).toMatchObject({ status: "failed", keywordsChecked: 0 });
    expect(state.snapshots).toEqual([]);
    expect(state.rank).toHaveBeenCalledTimes(4);
    expect(state.updateConfig).not.toHaveBeenCalled();
  });
});
