import { describe, expect, it } from "vitest";
import {
  brandLookupRunKey,
  isRunOnScreen,
  promptExplorerRunKey,
  type PromptExplorerRunInput,
} from "./activeRun";

function promptRun(
  overrides: Partial<PromptExplorerRunInput> = {},
): PromptExplorerRunInput {
  return {
    prompt: "best vending machine supplier in dallas",
    highlightBrand: "Delio TX",
    models: ["chat_gpt", "claude"],
    webSearch: true,
    webSearchCountryCode: "US",
    ...overrides,
  };
}

describe("brandLookupRunKey", () => {
  it("matches the same lookup submitted and read back from the URL", () => {
    expect(brandLookupRunKey({ query: "nike", competitors: [] })).toBe(
      brandLookupRunKey({ query: "nike", competitors: [] }),
    );
  });

  it("ignores surrounding whitespace, which the URL round trip can add", () => {
    expect(
      brandLookupRunKey({ query: "  nike ", competitors: [" adidas "] }),
    ).toBe(brandLookupRunKey({ query: "nike", competitors: ["adidas"] }));
  });

  it("treats competitor order as irrelevant", () => {
    expect(
      brandLookupRunKey({ query: "nike", competitors: ["puma", "adidas"] }),
    ).toBe(
      brandLookupRunKey({ query: "nike", competitors: ["adidas", "puma"] }),
    );
  });

  it("separates a different brand", () => {
    expect(brandLookupRunKey({ query: "nike", competitors: [] })).not.toBe(
      brandLookupRunKey({ query: "adidas", competitors: [] }),
    );
  });

  it("separates the same brand with a competitor added", () => {
    expect(brandLookupRunKey({ query: "nike", competitors: [] })).not.toBe(
      brandLookupRunKey({ query: "nike", competitors: ["adidas"] }),
    );
  });

  it("separates an empty query, which is what clearing the URL produces", () => {
    expect(brandLookupRunKey({ query: "", competitors: [] })).not.toBe(
      brandLookupRunKey({ query: "nike", competitors: [] }),
    );
  });
});

describe("promptExplorerRunKey", () => {
  it("matches the same run regardless of the order models were picked in", () => {
    expect(
      promptExplorerRunKey("p1", promptRun({ models: ["claude", "chat_gpt"] })),
    ).toBe(
      promptExplorerRunKey("p1", promptRun({ models: ["chat_gpt", "claude"] })),
    );
  });

  it("separates a different prompt", () => {
    expect(promptExplorerRunKey("p1", promptRun())).not.toBe(
      promptExplorerRunKey("p1", promptRun({ prompt: "something else" })),
    );
  });

  it("separates a cleared prompt, which is what the back link produces", () => {
    expect(promptExplorerRunKey("p1", promptRun())).not.toBe(
      promptExplorerRunKey("p1", promptRun({ prompt: "" })),
    );
  });

  it("separates a different highlighted brand", () => {
    expect(promptExplorerRunKey("p1", promptRun())).not.toBe(
      promptExplorerRunKey("p1", promptRun({ highlightBrand: "Someone Else" })),
    );
  });

  it("separates a different web-search country", () => {
    expect(promptExplorerRunKey("p1", promptRun())).not.toBe(
      promptExplorerRunKey("p1", promptRun({ webSearchCountryCode: "GB" })),
    );
  });

  it("separates the same run in a different project", () => {
    expect(promptExplorerRunKey("p1", promptRun())).not.toBe(
      promptExplorerRunKey("p2", promptRun()),
    );
  });
});

describe("isRunOnScreen", () => {
  it("is false before anything has been authorized", () => {
    expect(
      isRunOnScreen(
        null,
        brandLookupRunKey({ query: "nike", competitors: [] }),
      ),
    ).toBe(false);
  });

  it("is false once the URL has been cleared out from under the run", () => {
    const authorized = brandLookupRunKey({ query: "nike", competitors: [] });
    const cleared = brandLookupRunKey({ query: "", competitors: [] });
    expect(isRunOnScreen(authorized, cleared)).toBe(false);
  });

  it("is true while the URL still describes the authorized run", () => {
    const key = brandLookupRunKey({ query: "nike", competitors: ["adidas"] });
    expect(isRunOnScreen(key, key)).toBe(true);
  });
});
