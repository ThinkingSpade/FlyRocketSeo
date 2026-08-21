import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildChatAgentModel: vi.fn(),
  generateText: vi.fn(),
  getChatAgentModel: vi.fn(),
  getOptionalEnvValue: vi.fn(),
}));

vi.mock("ai", () => ({ generateText: mocks.generateText }));
vi.mock("@/server/lib/openrouter", () => ({
  buildChatAgentModel: mocks.buildChatAgentModel,
  getChatAgentModel: mocks.getChatAgentModel,
}));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: mocks.getOptionalEnvValue,
}));

import {
  deriveAdjacentTerms,
  parseAdjacentTerms,
} from "@/server/features/expired-domains/adjacentTerms";

beforeEach(() => {
  mocks.buildChatAgentModel.mockReturnValue({ modelId: "test-model" });
  mocks.getChatAgentModel.mockResolvedValue({ modelId: "environment-model" });
  mocks.generateText.mockResolvedValue({
    text: "school",
    finishReason: "stop",
  });
  mocks.getOptionalEnvValue.mockImplementation((name: string) =>
    Promise.resolve(
      name === "OPENROUTER_API_KEY"
        ? "sk-test"
        : name === "OPENROUTER_MODEL"
          ? "openai/gpt-4.1-nano"
          : undefined,
    ),
  );
});

function maxOutputTokensFrom(value: unknown): number | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const maxOutputTokens: unknown = Reflect.get(value, "maxOutputTokens");
  return typeof maxOutputTokens === "number" ? maxOutputTokens : undefined;
}

describe("parseAdjacentTerms", () => {
  it("reads a plain comma list", () => {
    expect(parseAdjacentTerms("snack, nutrition, coffee")).toEqual([
      "snack",
      "nutrition",
      "coffee",
    ]);
  });

  it("reads a newline list, which models emit just as often", () => {
    expect(parseAdjacentTerms("snack\nnutrition\ncoffee")).toEqual([
      "snack",
      "nutrition",
      "coffee",
    ]);
  });

  it("strips list markers and numbering", () => {
    expect(parseAdjacentTerms("- snack\n2. nutrition\n* coffee")).toEqual([
      "snack",
      "nutrition",
      "coffee",
    ]);
  });

  // A model that decides to explain itself must not turn even the valid-looking
  // fragments of that explanation into domain names.
  it("rejects a prose-shaped reply as a whole", () => {
    expect(
      parseAdjacentTerms(
        "Here are some adjacent industries you might consider: snack, nutrition",
      ),
    ).toEqual([]);
  });

  it("rejects an inline MiniMax think trace instead of harvesting its words", () => {
    const leakedTrace = `<think>
We need produce a concise list. Let's reason about adjacent categories, and avoid duplicates.
The business serves schools, hospitals, offices. We should include venues.
</think>
school, hospital, gym`;

    expect(parseAdjacentTerms(leakedTrace)).toEqual([]);
  });

  it("lowercases and dedupes", () => {
    expect(parseAdjacentTerms("Snack, snack, NUTRITION")).toEqual([
      "snack",
      "nutrition",
    ]);
  });

  it("drops anything that cannot appear in a hostname", () => {
    expect(parseAdjacentTerms("snack, café!, nutrition")).toEqual([
      "snack",
      "nutrition",
    ]);
  });

  it("returns nothing for an empty or unusable answer", () => {
    expect(parseAdjacentTerms("")).toEqual([]);
    expect(parseAdjacentTerms("I'm sorry, I can't help with that.")).toEqual(
      [],
    );
  });

  it("caps the list, since each term multiplies generated names", () => {
    const many = Array.from(
      { length: 60 },
      (_, index) =>
        `term${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + (index % 26))}`,
    ).join(", ");

    expect(parseAdjacentTerms(many)).toHaveLength(50);
  });
});

describe("deriveAdjacentTerms", () => {
  it("pins adjacent-term generation to MiniMax M3", async () => {
    await expect(deriveAdjacentTerms(["vending"])).resolves.toEqual(["school"]);

    expect(mocks.buildChatAgentModel).toHaveBeenCalledWith(
      "sk-test",
      "minimax/minimax-m3",
    );
    expect(mocks.getOptionalEnvValue).not.toHaveBeenCalledWith(
      "OPENROUTER_MODEL",
    );
  });

  it("leaves enough output budget for realistic reasoning plus visible terms", async () => {
    await deriveAdjacentTerms(["vending"]);

    const request: unknown = mocks.generateText.mock.calls[0]?.[0];
    const realisticReasoningBurn = 1_000;
    expect(maxOutputTokensFrom(request)).toBeGreaterThan(
      realisticReasoningBurn,
    );
  });

  it("logs and rejects a whitespace-only model answer", async () => {
    mocks.generateText.mockResolvedValue({
      text: " \n ",
      finishReason: "length",
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(deriveAdjacentTerms(["vending"])).resolves.toEqual([]);
    expect(log).toHaveBeenCalledWith(
      "expired-domains.adjacentTerms empty response",
      { finishReason: "length", textLength: 3 },
    );
  });
});
