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
  it.each([undefined, { items: {} }, { items: [42] }])(
    "rejects malformed successful observations with their billed evidence: %j",
    async (result) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          Response.json({
            status_code: 20000,
            tasks: [
              {
                status_code: 20000,
                path: ["v3", "on_page", "instant_pages"],
                cost: 0.00125,
                result: result ? [result] : [],
              },
            ],
          }),
        ),
      );
      await expect(
        fetchInstantPageAudit({ url: "https://example.com/" }),
      ).rejects.toMatchObject({
        billing: { costUsd: 0.00125 },
      });
    },
  );
  it("rejects another requested URL before assigning its analysis to this page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          status_code: 20000,
          tasks: [
            {
              status_code: 20000,
              path: ["v3", "on_page", "instant_pages"],
              cost: 0.00125,
              data: { url: "https://foreign.example/" },
              result: [{ items: [{ url: "https://example.com/", meta: {} }] }],
            },
          ],
        }),
      ),
    );
    await expect(
      fetchInstantPageAudit({ url: "https://example.com/" }),
    ).rejects.toMatchObject({ billing: { costUsd: 0.00125 } });
  });
  it("retains a successful explicit empty observation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          status_code: 20000,
          tasks: [
            {
              status_code: 20000,
              path: ["v3", "on_page", "instant_pages"],
              cost: 0.00125,
              data: { url: "https://example.com/" },
              result: [{ items: [] }],
            },
          ],
        }),
      ),
    );
    expect(
      await fetchInstantPageAudit({ url: "https://example.com/" }),
    ).toMatchObject({ data: null, billing: { costUsd: 0.00125 } });
  });
  it("selects the requested page when browser rendering also returns resources", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          status_code: 20000,
          tasks: [
            {
              status_code: 20000,
              path: ["v3", "on_page", "instant_pages"],
              cost: 0.00125,
              data: { url: "https://example.com/", enable_javascript: true },
              result: [
                {
                  items: [
                    {
                      url: "https://example.com/style.css",
                      resource_type: "stylesheet",
                    },
                    {
                      url: "https://example.com/",
                      resource_type: "html",
                      meta: { content: { plain_text_word_count: 10 } },
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ),
    );
    expect(
      (
        await fetchInstantPageAudit({
          url: "https://example.com/",
          enableJavascript: true,
        })
      ).data,
    ).toMatchObject({
      url: "https://example.com/",
      meta: { content: { plain_text_word_count: 10 } },
    });
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
