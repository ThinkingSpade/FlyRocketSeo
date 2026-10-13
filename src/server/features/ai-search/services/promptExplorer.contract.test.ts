import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  llmResponse: vi.fn(),
  getCached: vi.fn(),
  setCached: vi.fn(
    async (_key: string, _value: unknown, _ttl: number) => undefined,
  ),
}));
vi.mock("cloudflare:workers", () => ({ waitUntil: vi.fn() }));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({
    aiSearch: { llmResponse: mocks.llmResponse },
  }),
}));
vi.mock("@/server/lib/r2-cache", () => ({
  ...mocks,
  buildCacheKey: async (_prefix: string, params: unknown) =>
    JSON.stringify(params),
}));
import { explorePrompt } from "./promptExplorer";
const input = {
  projectId: "fixture-project",
  prompt: "What is Acme?",
  models: ["chat_gpt" as const],
  webSearch: true,
  webSearchCountryCode: "US" as const,
};
const customer = {
  organizationId: "fixture-org",
  userId: "fixture-user",
  userEmail: "fixture@example.test",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCached.mockResolvedValue(null);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
});
afterEach(() => vi.useRealTimers());
it("retains original model capture and scope on cache restore without another provider call", async () => {
  mocks.llmResponse.mockResolvedValue({
    model_name: "gpt-5",
    output_tokens: 0,
    web_search: true,
    items: [{ type: "message", sections: [{ text: "Acme answer" }] }],
  });
  const first = await explorePrompt(input, customer);
  expect(first.results[0]).toMatchObject({
    capturedAt: "2026-10-01T00:00:00.000Z",
    source: "DataForSEO LLM Responses",
    scope: { webSearchCountryCode: "US" },
    outputTokens: 0,
  });
  mocks.getCached.mockResolvedValue(mocks.setCached.mock.calls[0][1]);
  vi.setSystemTime(new Date("2026-10-13T00:00:00Z"));
  const restored = await explorePrompt(
    { ...input, highlightBrand: "Acme" },
    customer,
  );
  expect(restored.fetchedAt).toBe(first.fetchedAt);
  expect(restored.results[0]).toMatchObject({
    capturedAt: "2026-10-01T00:00:00.000Z",
    brandMentioned: true,
  });
  expect(mocks.llmResponse).toHaveBeenCalledTimes(1);
});
it("keeps legacy cached answers readable without inventing a capture time or metered refresh", async () => {
  mocks.getCached.mockResolvedValue({
    status: "success",
    model: "chat_gpt",
    modelName: "gpt-5",
    text: "Saved answer",
    citations: [],
    fanOutQueries: [],
    brandMentioned: null,
    outputTokens: 4,
    webSearch: false,
  });
  const result = await explorePrompt(input, customer);
  expect(result.fetchedAt).toBeNull();
  expect(result.results[0]).not.toHaveProperty("capturedAt");
  expect(mocks.llmResponse).not.toHaveBeenCalled();
});
it("does not round invalid token counts or report an unconfirmed web search setting", async () => {
  mocks.llmResponse.mockResolvedValue({ output_tokens: 1.5, items: [] });
  const result = await explorePrompt(input, customer);
  expect(result.results[0]).toMatchObject({
    outputTokens: null,
    webSearch: null,
  });
});
it("reads the provider's typeless citation annotations while rejecting unsafe and unsupported annotations", async () => {
  mocks.llmResponse.mockResolvedValue({
    items: [
      {
        type: "message",
        sections: [
          {
            text: "Answer",
            annotations: [
              {
                url: "https://example.com/guide",
                title: "Guide",
                start_index: 0,
                end_index: 6,
              },
              { url: "javascript:alert(1)", title: "Unsafe" },
              { type: "tool_event", url: "https://unrelated.example" },
            ],
          },
        ],
      },
    ],
  });
  const result = await explorePrompt(input, customer);
  expect(result.results[0]).toMatchObject({
    citations: [{ url: "https://example.com/guide", title: "Guide" }],
  });
});
