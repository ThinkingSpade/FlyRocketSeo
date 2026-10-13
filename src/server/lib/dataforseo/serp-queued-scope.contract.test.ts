import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: async () => "queued-scope-fixture-key",
}));

import { fetchRankCheckTaskResult } from "./serp";

const input = {
  taskId: "task-alpha",
  keywordId: "keyword-alpha",
  keyword: "alpha",
  targetDomain: "example.com",
  locationCode: 2840,
  languageCode: "en",
  device: "desktop" as const,
  depth: 20,
};
const matchingScope = {
  keyword: "alpha",
  location_code: 2840,
  language_code: "en",
  device: "desktop",
  depth: 20,
};
const organic = {
  type: "organic",
  domain: "example.com",
  rank_absolute: 1,
  url: "https://example.com/guide",
};

function fixture(overrides: Record<string, unknown> = {}) {
  return Response.json({
    status_code: 20000,
    tasks: [
      {
        id: "task-alpha",
        status_code: 20000,
        cost: 0.005,
        path: ["v3", "serp", "google", "organic", "task_get", "advanced"],
        data: matchingScope,
        result: [{ ...matchingScope, items: [organic] }],
        ...overrides,
      },
    ],
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("queued SERP captured scope", () => {
  it("retains the position when task identity and all reported scopes match", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fixture()));
    await expect(fetchRankCheckTaskResult(input)).resolves.toMatchObject({
      status: "completed",
      result: { keywordId: "keyword-alpha", keyword: "alpha", position: 1 },
    });
  });

  it.each([
    ["location_code", 2826],
    ["language_code", "fr"],
    ["device", "mobile"],
    ["depth", 100],
  ])(
    "rejects mismatched result %s before persisting a captured-scope rank",
    async (field, value) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          fixture({
            result: [{ ...matchingScope, [field]: value, items: [organic] }],
          }),
        ),
      );
      await expect(fetchRankCheckTaskResult(input)).rejects.toMatchObject({
        name: "DataforseoChargedTaskError",
        billing: { costUsd: 0.005 },
      });
    },
  );

  it("rejects a conflicting posted-task scope even when the result echoes match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fixture({
          data: { ...matchingScope, device: "mobile" },
        }),
      ),
    );
    await expect(fetchRankCheckTaskResult(input)).rejects.toMatchObject({
      name: "DataforseoChargedTaskError",
      billing: { costUsd: 0.005 },
    });
  });

  it("rejects a different reported task ID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fixture({ id: "foreign-task" })),
    );
    await expect(fetchRankCheckTaskResult(input)).rejects.toMatchObject({
      name: "DataforseoChargedTaskError",
      billing: { costUsd: 0.005 },
    });
  });

  it("does not turn a foreign-market no-results task into observed absence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fixture({
          status_code: 40501,
          status_message: "No Search Results.",
          data: { ...matchingScope, location_code: 2826 },
          result: [],
        }),
      ),
    );
    await expect(fetchRankCheckTaskResult(input)).rejects.toMatchObject({
      name: "DataforseoChargedTaskError",
      billing: { costUsd: 0.005 },
    });
  });

  it("collects a matching scope through one free GET and accepts absent optional echoes", async () => {
    const transport = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const requestUrl =
          typeof url === "string"
            ? url
            : url instanceof URL
              ? url.href
              : url.url;
        expect(requestUrl).toBe(
          "https://api.dataforseo.com/v3/serp/google/organic/task_get/advanced/task-alpha",
        );
        expect(init?.method).toBe("GET");
        return fixture({ data: {}, result: [{ items: [organic] }] });
      },
    );
    vi.stubGlobal("fetch", transport);
    await expect(fetchRankCheckTaskResult(input)).resolves.toMatchObject({
      status: "completed",
      result: { keywordId: "keyword-alpha", keyword: "alpha", position: 1 },
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
