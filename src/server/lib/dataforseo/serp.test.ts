import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

import {
  fetchLocalSerp,
  fetchLiveSerp,
  fetchRankCheckSerp,
  fetchRankCheckTaskResult,
  postRankCheckTasks,
} from "@/server/lib/dataforseo/serp";

function parseDataforseoRequestBody(init: RequestInit | undefined): unknown {
  const body = init?.body;
  if (typeof body !== "string") {
    throw new Error("Expected DataForSEO request body to be a string");
  }
  return JSON.parse(body) as unknown;
}

describe("rank check task queue", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts queued tasks, maps ids by tag, and sums cost over all entries", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            id: "task-a",
            status_code: 20100,
            cost: 0.0006,
            data: { tag: "kw-1:desktop" },
          },
          {
            id: "task-b",
            status_code: 20100,
            cost: 0.0006,
            data: { tag: "kw-1:mobile" },
          },
          {
            id: "task-c",
            status_code: 40006,
            status_message: "Task Limit Exceeded",
            cost: 0.0006,
            data: { tag: "kw-2:desktop" },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await postRankCheckTasks({
      tasks: [
        { keyword: "alpha", keywordId: "kw-1", device: "desktop" },
        { keyword: "alpha", keywordId: "kw-1", device: "mobile" },
        { keyword: "beta", keywordId: "kw-2", device: "desktop" },
      ],
      locationCode: 2840,
      languageCode: "en",
      depth: 20,
      targetDomain: "example.com",
    });

    expect(
      fetchMock.mock.calls.map(([url]) =>
        typeof url === "string" || url instanceof URL
          ? url.toString()
          : url.url,
      ),
    ).toEqual(["https://api.dataforseo.com/v3/serp/google/organic/task_post"]);

    // Every posted task asks DataForSEO to stop crawling at the target's
    // organic listing — that is what cuts the actual crawl cost for ranking
    // domains without false "not ranking" stops on sitelinks/PAA mentions.
    const stopCrawl = {
      stop_crawl_on_match: [
        { match_value: "example.com", match_type: "with_subdomains" },
      ],
      find_targets_in: ["organic"],
    };
    expect(
      parseDataforseoRequestBody(fetchMock.mock.calls[0]?.[1]),
    ).toMatchObject([stopCrawl, stopCrawl, stopCrawl]);
    expect(result.data).toEqual([
      {
        keyword: "alpha",
        keywordId: "kw-1",
        device: "desktop",
        taskId: "task-a",
      },
      {
        keyword: "alpha",
        keywordId: "kw-1",
        device: "mobile",
        taskId: "task-b",
      },
    ]);
    // The rejected entry's cost is still metered: a charge is a charge.
    expect(result.billing.costUsd).toBeCloseTo(0.0018, 10);
    expect(result.billing.path).toEqual([
      "v3",
      "serp",
      "google",
      "organic",
      "task_post",
    ]);
  });

  it("reports a queued task still in progress as pending", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [{ id: "task-a", status_code: 40602 }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await fetchRankCheckTaskResult({
      taskId: "task-a",
      keywordId: "kw-1",
      keyword: "alpha",
      targetDomain: "example.com",
      locationCode: 2840,
      languageCode: "en",
      device: "desktop",
      depth: 20,
    });

    expect(outcome).toEqual({ status: "pending" });
  });

  it("parses a completed queued task into a rank check result", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            id: "task-a",
            status_code: 20000,
            cost: 0,
            path: ["v3", "serp", "google", "organic", "task_get", "advanced"],
            result: [
              {
                items: [
                  {
                    type: "organic",
                    rank_group: 3,
                    rank_absolute: 4,
                    domain: "www.example.com",
                    url: "https://www.example.com/page",
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await fetchRankCheckTaskResult({
      taskId: "task-a",
      keywordId: "kw-1",
      keyword: "alpha",
      targetDomain: "example.com",
      locationCode: 2840,
      languageCode: "en",
      device: "desktop",
      depth: 20,
    });

    expect(outcome).toEqual({
      status: "completed",
      result: {
        keywordId: "kw-1",
        keyword: "alpha",
        position: 4,
        url: "https://www.example.com/page",
        serpFeatures: ["organic"],
      },
    });
  });
});

function liveResponse(items: unknown) {
  return Response.json({
    status_code: 20000,
    tasks: [
      {
        status_code: 20000,
        cost: 0.002,
        path: ["v3", "serp", "google", "organic", "live", "advanced"],
        result: [{ items }],
      },
    ],
  });
}

describe("SERP observation contracts", () => {
  it("preserves estimate precision and actual count zero while invalid SERP enrichment fields remain unknown", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          liveResponse([
            {
              type: "organic",
              domain: "example.com",
              rank_absolute: 1,
              etv: -1,
              estimated_paid_traffic_cost: 1.25,
              backlinks_info: { referring_domains: 0, backlinks: 0.5 },
              rank_changes: { previous_rank_absolute: 0 },
            },
          ]),
        ),
    );
    expect(
      (
        await fetchLiveSerp({
          keyword: "alpha",
          locationCode: 2840,
          languageCode: "en",
        })
      ).data[0],
    ).toMatchObject({
      etv: null,
      estimated_paid_traffic_cost: 1.25,
      backlinks_info: { referring_domains: 0, backlinks: null },
      rank_changes: { previous_rank_absolute: null },
    });
  });
  beforeEach(() => vi.restoreAllMocks());

  const input = {
    keyword: "alpha",
    keywordId: "kw-1",
    targetDomain: "example.com",
    locationCode: 2840,
    languageCode: "en",
    device: "desktop" as const,
    depth: 20,
  };

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects a target rank %s instead of recording an absence or corrupt position",
    async (rank) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            liveResponse([
              { type: "organic", domain: "example.com", rank_absolute: rank },
            ]),
          ),
      );
      await expect(fetchRankCheckSerp(input)).rejects.toMatchObject({
        name: "DataforseoChargedTaskError",
        billing: { costUsd: 0.002 },
      });
    },
  );

  it("rejects missing successful result items instead of treating them as not ranked", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(liveResponse(undefined)));
    await expect(fetchRankCheckSerp(input)).rejects.toMatchObject({
      name: "DataforseoChargedTaskError",
    });
  });

  it("preserves an explicitly observed empty SERP", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(liveResponse([])));
    expect((await fetchRankCheckSerp(input)).data.position).toBeNull();
  });

  it("rejects a mismatched observed keyword before attaching a rank to the requested keyword", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          status_code: 20000,
          tasks: [
            {
              status_code: 20000,
              cost: 0.002,
              path: ["v3", "serp", "google", "organic", "live", "advanced"],
              result: [
                { keyword: "different", location_code: 2840, items: [] },
              ],
            },
          ],
        }),
      ),
    );
    await expect(fetchRankCheckSerp(input)).rejects.toMatchObject({
      name: "DataforseoChargedTaskError",
    });
  });

  it("rejects an organic target without any observed rank", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          liveResponse([{ type: "organic", domain: "example.com" }]),
        ),
    );
    await expect(fetchRankCheckSerp(input)).rejects.toMatchObject({
      name: "DataforseoChargedTaskError",
    });
  });

  it("rejects a local row outside the requested search depth", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          liveResponse([{ type: "local_pack", rank_group: 21 }]),
        ),
    );
    await expect(
      fetchLocalSerp({
        keyword: "coffee",
        languageCode: "en",
        searchType: "local_finder",
        device: "desktop",
        depth: 20,
      }),
    ).rejects.toMatchObject({ name: "DataforseoChargedTaskError" });
  });

  it("rejects malformed local result rows with billed-task evidence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(liveResponse(["invalid-row"])),
    );
    await expect(
      fetchLocalSerp({
        keyword: "coffee",
        languageCode: "en",
        searchType: "local_finder",
        device: "desktop",
        depth: 20,
      }),
    ).rejects.toMatchObject({
      name: "DataforseoChargedTaskError",
      billing: { costUsd: 0.002 },
    });
  });
});
