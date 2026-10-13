import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  fetchLlmAggregatedMetrics,
  fetchLlmMentionsSearch,
  fetchLlmTopPages,
  fetchLlmCrossAggregatedMetrics,
  fetchLlmResponse,
} from "./ai";
vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: async () => "isolated-fixture-key",
}));
const input = {
  target: { domain: "example.com" },
  platform: "google" as const,
  locationCode: 2840,
  languageCode: "en",
};
function serve(result: unknown[], data: unknown = {}) {
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    const requestUrl =
      typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    expect(requestUrl).toContain("api.dataforseo.com/v3/ai_optimization/");
    expect(typeof init?.body).toBe("string");
    if (typeof init?.body !== "string")
      throw new Error("Expected SDK JSON request");
    const body: unknown = JSON.parse(init.body);
    expect(Array.isArray(body)).toBe(true);
    return new Response(
      JSON.stringify({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            status_message: "Ok",
            path: new URL(requestUrl).pathname.slice(1).split("/"),
            cost: 0.01,
            data,
            result,
          },
        ],
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  });
}
beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());
it("retains billed-task evidence when mention rows are malformed", async () => {
  serve([{ items: [{ question: 42 }] }]);
  await expect(fetchLlmMentionsSearch(input)).rejects.toMatchObject({
    billing: {
      costUsd: 0.01,
      path: ["v3", "ai_optimization", "llm_mentions", "search", "live"],
    },
  });
});
it("does not turn a malformed successful envelope into an empty paid result", async () => {
  serve([]);
  await expect(fetchLlmAggregatedMetrics(input)).rejects.toMatchObject({
    billing: { costUsd: 0.01 },
  });
});
it("rejects declared market/platform mismatch while retaining billed evidence", async () => {
  serve(
    [
      {
        total: {
          platform: [{ key: "google", mentions: 0, ai_search_volume: 0 }],
        },
      },
    ],
    { platform: "chat_gpt", location_code: 2826, language_code: "fr" },
  );
  await expect(fetchLlmAggregatedMetrics(input)).rejects.toMatchObject({
    billing: { costUsd: 0.01 },
  });
});
it("normalizes semantic invalid observations without replacing genuine zero", async () => {
  serve([
    {
      items: [
        {
          question: "sample",
          ai_search_volume: 1.5,
          monthly_searches: [{ year: 2026, month: 10, search_volume: 0 }],
        },
      ],
    },
  ]);
  const result = await fetchLlmMentionsSearch(input);
  expect(result.data[0]).toMatchObject({
    ai_search_volume: null,
    monthly_searches: [{ search_volume: 0 }],
  });
});
it("rejects malformed top-page and comparison items with billed metadata", async () => {
  serve([{ items: [{ key: 4 }] }]);
  await expect(fetchLlmTopPages(input)).rejects.toMatchObject({
    billing: { costUsd: 0.01 },
  });
  await expect(
    fetchLlmCrossAggregatedMetrics({
      ...input,
      groups: [
        { key: "you", target: { domain: "example.com" } },
        { key: "rival", target: { domain: "rival.example" } },
      ],
    }),
  ).rejects.toMatchObject({ billing: { costUsd: 0.01 } });
});
it("preserves model output token zero and rejects malformed billed model output", async () => {
  serve([{ output_tokens: 0, items: [] }]);
  expect(
    (
      await fetchLlmResponse({
        modelSlug: "chat_gpt",
        userPrompt: "sample",
        modelName: "gpt-5",
        webSearch: false,
      })
    ).data.output_tokens,
  ).toBe(0);
  serve([{ output_tokens: "invalid" }]);
  await expect(
    fetchLlmResponse({
      modelSlug: "chat_gpt",
      userPrompt: "sample",
      modelName: "gpt-5",
      webSearch: false,
    }),
  ).rejects.toMatchObject({ billing: { costUsd: 0.01 } });
});
it("rejects an echoed different target and missing list payload with billed evidence", async () => {
  serve([{ items: [] }], { target: [{ domain: "other.example" }] });
  await expect(fetchLlmMentionsSearch(input)).rejects.toMatchObject({
    billing: { costUsd: 0.01 },
  });
  serve([{}]);
  await expect(fetchLlmMentionsSearch(input)).rejects.toMatchObject({
    billing: { costUsd: 0.01 },
  });
});
it("does not silently label model request scope mismatches as requested answers", async () => {
  serve([{ items: [], output_tokens: 0 }], {
    user_prompt: "Another prompt",
    web_search: true,
  });
  await expect(
    fetchLlmResponse({
      modelSlug: "chat_gpt",
      modelName: "gpt-5",
      userPrompt: "Requested prompt",
      webSearch: false,
    }),
  ).rejects.toMatchObject({ billing: { costUsd: 0.01 } });
});
