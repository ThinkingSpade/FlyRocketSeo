import { describe, expect, it } from "vitest";
import { meteredActionLabel, meteredEstimateNote } from "./MeteredActionLabel";

describe("meteredActionLabel", () => {
  it("names credits when the call always spends", () => {
    expect(
      meteredActionLabel("Update keyword stats", { kind: "credits" }),
    ).toBe("Update keyword stats · uses credits");
  });

  /**
   * The softening is the whole point of `cacheAware`. Most of these controls
   * read a server cache first, so a second press inside the window spends
   * nothing — and "uses credits" there is a lie in the expensive-sounding
   * direction, which teaches people to distrust the labels that are accurate.
   */
  it("softens to may when a cache could absorb the call", () => {
    expect(
      meteredActionLabel("Analyze acme.com", { kind: "credits" }, true),
    ).toBe("Analyze acme.com · may use credits");
  });

  it("counts requests, singular and plural", () => {
    expect(
      meteredActionLabel("Fetch reviews", { kind: "paidRequests", count: 1 }),
    ).toBe("Fetch reviews · 1 paid request");
    expect(meteredActionLabel("Run", { kind: "paidRequests", count: 3 })).toBe(
      "Run · 3 paid requests",
    );
  });

  it("caps a cache-aware count with up to", () => {
    expect(
      meteredActionLabel(
        "Build brief",
        { kind: "paidRequests", count: 4 },
        true,
      ),
    ).toBe("Build brief · up to 4 paid requests");
  });

  it("quotes a measured estimate when the call always spends", () => {
    expect(
      meteredActionLabel("Look up", { kind: "estimateUsd", usd: 1.088 }),
    ).toBe("Look up · est. $1.09");
  });

  /**
   * A cached run costs nothing, so the figure moves off the button and into a
   * conditional beside it. Putting "$1.09" on a control that may charge zero
   * would be the same overclaim in reverse.
   */
  it("moves a cache-aware estimate off the button and into a note", () => {
    const disclosure = { kind: "estimateUsd", usd: 1.088 } as const;
    expect(meteredActionLabel("Re-analyze", disclosure, true)).toBe(
      "Re-analyze · may use credits",
    );
    expect(meteredEstimateNote(disclosure, true)).toBe(
      "If not cached: est. $1.09.",
    );
  });

  it("has no note to add when the price is already on the button", () => {
    expect(
      meteredEstimateNote({ kind: "estimateUsd", usd: 1 }, false),
    ).toBeNull();
    expect(meteredEstimateNote({ kind: "credits" }, true)).toBeNull();
    expect(
      meteredEstimateNote({ kind: "paidRequests", count: 2 }, true),
    ).toBeNull();
  });
});
