import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createOpenRouter: vi.fn(),
  selectModel: vi.fn(),
}));

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: mocks.createOpenRouter,
}));

import { buildChatAgentModel } from "@/server/lib/openrouter";

describe("buildChatAgentModel", () => {
  it("keeps reasoning separation, usage accounting, and the ZDR route", () => {
    const model = { modelId: "minimax/minimax-m3" };
    mocks.createOpenRouter.mockReturnValue(mocks.selectModel);
    mocks.selectModel.mockReturnValue(model);

    expect(buildChatAgentModel("sk-test", "minimax/minimax-m3")).toBe(model);
    expect(mocks.createOpenRouter).toHaveBeenCalledWith({ apiKey: "sk-test" });
    expect(mocks.selectModel).toHaveBeenCalledWith("minimax/minimax-m3", {
      usage: { include: true },
      reasoning: { effort: "medium" },
      provider: {
        order: ["together", "atlas-cloud/fp8"],
        zdr: true,
        allow_fallbacks: true,
      },
    });
  });
});
