import { describe, expect, it } from "vitest";
import {
  advanceBacklinksRestoredRefresh,
  hasBacklinksTarget,
  resolveBacklinksRestoredResults,
} from "./backlinksRestoredState";

describe("backlinks restored results", () => {
  it("offers the exact refresh action for a stored target", () => {
    expect(
      resolveBacklinksRestoredResults({
        phase: "idle",
        storedTarget: "example.com",
        canOpenTab: true,
      }),
    ).toEqual({
      kind: "empty",
      title: "Individual links aren't loaded",
      description:
        "This saved run kept the summary. Loading individual links starts a fresh lookup.",
      actionLabel: "Refresh & load links",
      actionLoading: false,
      errorMessage: null,
    });
  });

  it("treats a whitespace-only stored target as corrupt", () => {
    expect(hasBacklinksTarget(" \t ")).toBe(false);
    expect(
      resolveBacklinksRestoredResults({
        phase: "idle",
        storedTarget: " \t ",
        canOpenTab: false,
      }),
    ).toEqual({
      kind: "empty",
      title: "Individual links aren't loaded",
      description: "This saved run can't load its links. Enter a target above.",
      actionLabel: null,
      actionLoading: false,
      errorMessage: null,
    });
  });

  it("blocks before authorization when the search-tab limit is reached", () => {
    expect(
      resolveBacklinksRestoredResults({
        phase: "idle",
        storedTarget: "example.com",
        canOpenTab: false,
      }),
    ).toMatchObject({
      kind: "empty",
      description: "Close a tab to load these links.",
      actionLabel: null,
    });
  });

  it("returns the failure copy and explicit retry action", () => {
    expect(
      resolveBacklinksRestoredResults({
        phase: "failed",
        storedTarget: "example.com",
        canOpenTab: true,
      }),
    ).toMatchObject({
      kind: "empty",
      description:
        "This saved run kept the summary. Loading individual links starts a fresh lookup.",
      actionLabel: "Try again",
      actionLoading: false,
      errorMessage:
        "Individual links couldn't be loaded. The saved summary is still available.",
    });
  });

  it("loads ordinary chrome from row success without consulting row count", () => {
    expect(
      resolveBacklinksRestoredResults({
        phase: "succeeded",
        storedTarget: "example.com",
        canOpenTab: true,
      }),
    ).toEqual({ kind: "loaded" });
  });

  it("latches row success across later query-state changes", () => {
    expect(
      advanceBacklinksRestoredRefresh({
        phase: "succeeded",
        expectedRunNonce: 1,
        currentRunNonce: 1,
        rowsSucceeded: false,
        rowsFailed: true,
      }),
    ).toBe("succeeded");
  });

  it("advances only the expected run from row success or failure", () => {
    expect(
      advanceBacklinksRestoredRefresh({
        phase: "loading",
        expectedRunNonce: 2,
        currentRunNonce: 2,
        rowsSucceeded: true,
        rowsFailed: false,
      }),
    ).toBe("succeeded");
    expect(
      advanceBacklinksRestoredRefresh({
        phase: "loading",
        expectedRunNonce: 3,
        currentRunNonce: 3,
        rowsSucceeded: false,
        rowsFailed: true,
      }),
    ).toBe("failed");
    expect(
      advanceBacklinksRestoredRefresh({
        phase: "loading",
        expectedRunNonce: 4,
        currentRunNonce: 3,
        rowsSucceeded: false,
        rowsFailed: true,
      }),
    ).toBe("loading");
  });

  it("keeps the refresh CTA visible but busy while rows load", () => {
    expect(
      resolveBacklinksRestoredResults({
        phase: "loading",
        storedTarget: "example.com",
        canOpenTab: true,
      }),
    ).toMatchObject({
      kind: "empty",
      actionLabel: "Refresh & load links",
      actionLoading: true,
      errorMessage: null,
    });
  });
});
