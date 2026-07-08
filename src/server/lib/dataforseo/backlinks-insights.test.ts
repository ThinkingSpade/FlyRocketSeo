import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

import {
  fetchBacklinksAnchors,
  fetchBacklinksDomainIntersection,
  fetchBulkSpamScores,
} from "@/server/lib/dataforseo/backlinks-insights";

function parseDataforseoRequestBody(init: RequestInit | undefined): unknown {
  const body = init?.body;
  if (typeof body !== "string") {
    throw new Error("Expected DataForSEO request body to be a string");
  }
  return JSON.parse(body) as unknown;
}

function mockTaskResponse(path: string[], result: unknown) {
  return Response.json({
    status_code: 20000,
    tasks: [
      {
        status_code: 20000,
        path,
        cost: 0.02,
        result_count: 1,
        result: [result],
      },
    ],
  });
}

describe("DataForSEO backlinks insight endpoints", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches anchors with the profile defaults and returns items + billing", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      mockTaskResponse(["v3", "backlinks", "anchors", "live"], {
        total_count: 90,
        items: [
          {
            anchor: "openseo",
            backlinks: 120,
            referring_domains: 45,
            rank: 62,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchBacklinksAnchors({
      target: "example.com",
      limit: 50,
    });

    expect(result.data.totalCount).toBe(90);
    expect(result.data.items[0]).toMatchObject({
      anchor: "openseo",
      backlinks: 120,
    });
    expect(result.billing.path).toEqual(["v3", "backlinks", "anchors", "live"]);
    expect(parseDataforseoRequestBody(fetchMock.mock.calls[0][1])).toEqual([
      {
        target: "example.com",
        include_subdomains: true,
        include_indirect_links: true,
        exclude_internal_backlinks: true,
        backlinks_status_type: "live",
        rank_scale: "one_hundred",
        limit: 50,
        order_by: ["backlinks,desc"],
      },
    ]);
  });

  it("serializes intersection targets as an index-keyed object with exclusions", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      mockTaskResponse(["v3", "backlinks", "domain_intersection", "live"], {
        total_count: 3,
        items: [
          {
            domain_intersection: {
              "1": {
                target: "linker.example",
                rank: 55,
                backlinks: 7,
              },
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchBacklinksDomainIntersection({
      targets: ["competitor.com"],
      excludeTargets: ["example.com"],
      limit: 100,
    });

    expect(result.data.items[0].domain_intersection?.["1"]).toMatchObject({
      target: "linker.example",
      rank: 55,
    });
    const payload = parseDataforseoRequestBody(fetchMock.mock.calls[0][1]);
    expect(payload).toEqual([
      {
        targets: { "1": "competitor.com" },
        exclude_targets: ["example.com"],
        include_subdomains: true,
        exclude_internal_backlinks: true,
        rank_scale: "one_hundred",
        limit: 100,
        order_by: ["1.rank,desc"],
      },
    ]);
  });

  it("returns bulk spam scores", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      mockTaskResponse(["v3", "backlinks", "bulk_spam_score", "live"], {
        items: [
          { target: "clean.example", spam_score: 5 },
          { target: "spammy.example", spam_score: 80 },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchBulkSpamScores({
      targets: ["clean.example", "spammy.example"],
    });

    expect(result.data).toEqual([
      { target: "clean.example", spam_score: 5 },
      { target: "spammy.example", spam_score: 80 },
    ]);
    expect(parseDataforseoRequestBody(fetchMock.mock.calls[0][1])).toEqual([
      { targets: ["clean.example", "spammy.example"] },
    ]);
  });
});
