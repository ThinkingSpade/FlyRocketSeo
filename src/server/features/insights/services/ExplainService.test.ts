import { afterEach, describe, expect, it, vi } from "vitest";
import { ExplainService } from "./ExplainService";

// ExplainService imports getChatAgentModel -> runtime-env's getOptionalEnvValue,
// which only reaches `cloudflare:workers` through a dynamic import wrapped in
// try/catch (it resolves to null under plain Node rather than throwing), so
// the module itself is importable here. What isn't covered below is the
// actual `generateText` call: exercising that would mean mocking the `ai`
// package/OpenRouter provider, which is genuine test infra this suite doesn't
// have (OnPageAiService, the sibling this service was modeled on, has no
// test file for the same reason). The gate below is what matters most here
// anyway -- it's the backstop for the "hidden when unavailable" contract the
// client is also responsible for.
describe("ExplainService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("isExplainAvailable is false with no OPENROUTER_API_KEY configured", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");

    await expect(ExplainService.isExplainAvailable()).resolves.toBe(false);
  });

  it("isExplainAvailable is true once OPENROUTER_API_KEY is configured", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-test-key");

    await expect(ExplainService.isExplainAvailable()).resolves.toBe(true);
  });

  it("explainVerdict throws PAYMENT_REQUIRED instead of calling the model when the key is missing", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");

    await expect(
      ExplainService.explainVerdict({
        tab: "SERP Overview",
        read: "3 of 10 tracked keywords rank in the top 3.",
        actions: [],
      }),
    ).rejects.toMatchObject({ code: "PAYMENT_REQUIRED" });
  });
});
