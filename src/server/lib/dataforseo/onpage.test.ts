import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

import { fetchInstantPageAudit } from "@/server/lib/dataforseo/onpage";

function parseDataforseoRequestBody(init: RequestInit | undefined): unknown {
  const body = init?.body;
  if (typeof body !== "string") {
    throw new Error("Expected DataForSEO request body to be a string");
  }
  return JSON.parse(body) as unknown;
}

describe("DataForSEO on-page instant audit", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("audits a single URL and parses score, meta, and checks", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            path: ["v3", "on_page", "instant_pages"],
            cost: 0.00125,
            result_count: 1,
            result: [
              {
                crawl_progress: "finished",
                items: [
                  {
                    url: "https://example.com/",
                    status_code: 200,
                    onpage_score: 91.2,
                    checks: {
                      no_description: true,
                      is_https: true,
                      low_content_rate: false,
                    },
                    meta: {
                      title: "Example Domain",
                      title_length: 14,
                      internal_links_count: 1,
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchInstantPageAudit({ url: "https://example.com/" });

    expect(result.data).toMatchObject({
      url: "https://example.com/",
      status_code: 200,
      onpage_score: 91.2,
    });
    expect(result.data?.checks?.no_description).toBe(true);
    expect(result.billing.costUsd).toBe(0.00125);
    expect(parseDataforseoRequestBody(fetchMock.mock.calls[0][1])).toEqual([
      { url: "https://example.com/" },
    ]);
  });
});
