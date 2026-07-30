import { describe, expect, it, vi } from "vitest";
import {
  resolveQueryState,
  type QuerySamplingEvidence,
} from "@/client/components/state/queryState";

/**
 * The pure state resolver, tested before any JSX exists.
 *
 * Phase 1 spent most of its effort on pages that rendered a FAILURE as an empty
 * result, and on absence sentences derived from a capped pull. Both were branch-
 * order bugs, so the branch order is what gets tested here — in isolation, where
 * a wrong precedence is a one-line assertion rather than a screenshot.
 */

const freeRetry = { onRetry: () => {}, pending: false, cost: "free" as const };

const complete: QuerySamplingEvidence = {
  label: "Search Console query-and-page pull",
  truncated: false,
  rowsExamined: 412,
};

const capped: QuerySamplingEvidence = {
  label: "Search Console query-and-page pull",
  truncated: true,
  rowsExamined: 1000,
};

describe("resolveQueryState precedence", () => {
  it("puts loading first", () => {
    const state = resolveQueryState({
      isPending: true,
      isError: false,
      connected: true,
      rowCount: 0,
    });
    expect(state.kind).toBe("loading");
  });

  it("lets error win over zero rows", () => {
    // The Phase 1 defect in one assertion: a failed query that also has no rows
    // must never resolve to "empty", or the UI tells the user nothing exists
    // when in fact nothing was read.
    const state = resolveQueryState({
      isPending: false,
      isError: true,
      connected: true,
      rowCount: 0,
    });
    expect(state.kind).toBe("error");
  });

  it("lets not-connected win over zero rows", () => {
    const state = resolveQueryState({
      isPending: false,
      isError: false,
      connected: false,
      rowCount: 0,
    });
    expect(state.kind).toBe("not-connected");
  });

  it("requires an explicit disconnected signal, not merely absent data", () => {
    // `connected: undefined` means "we were never told". Treating that as
    // disconnected would make a loading or partial response look like a
    // provider problem.
    const state = resolveQueryState({
      isPending: false,
      isError: false,
      connected: undefined,
      rowCount: 3,
    });
    expect(state.kind).toBe("ready");
  });

  it("stays ready while refetching in the background with usable data", () => {
    // isFetching is not isPending. A background refresh must not blank the page.
    const state = resolveQueryState({
      isPending: false,
      isError: false,
      connected: true,
      rowCount: 7,
      isFetching: true,
    });
    expect(state.kind).toBe("ready");
  });
});

describe("resolveQueryState emptiness", () => {
  it("reports a complete genuine zero as genuine", () => {
    const state = resolveQueryState({
      isPending: false,
      isError: false,
      connected: true,
      rowCount: 0,
      sampling: [complete],
    });
    expect(state).toMatchObject({ kind: "empty", reason: "genuine-zero" });
  });

  it("reports a complete filtered zero as filtered", () => {
    const state = resolveQueryState({
      isPending: false,
      isError: false,
      connected: true,
      rowCount: 0,
      filtered: true,
      sampling: [complete],
    });
    expect(state).toMatchObject({ kind: "empty", reason: "filtered-zero" });
  });

  it("marks an empty result from a capped pull as not-established", () => {
    // The whole point: an empty result over a truncated pull is NOT an absence,
    // so it must not share a render path with a genuine zero.
    const state = resolveQueryState({
      isPending: false,
      isError: false,
      connected: true,
      rowCount: 0,
      sampling: [capped],
    });
    expect(state).toMatchObject({ kind: "empty", absenceEstablished: false });
  });

  it("establishes absence only when every pull was complete", () => {
    const state = resolveQueryState({
      isPending: false,
      isError: false,
      connected: true,
      rowCount: 0,
      sampling: [complete],
    });
    expect(state).toMatchObject({ absenceEstablished: true });
  });

  it("treats one capped pull among several as not-established", () => {
    // Flags are never ORed into a single boolean paired with one unrelated
    // count; the capped pulls are carried through individually.
    const state = resolveQueryState({
      isPending: false,
      isError: false,
      connected: true,
      rowCount: 0,
      sampling: [complete, capped],
    });
    expect(state).toMatchObject({ kind: "empty", absenceEstablished: false });
    expect(state.kind === "empty" && state.cappedPulls).toEqual([capped]);
  });

  it("cannot establish absence with no sampling evidence at all", () => {
    // Conservative default, matching pullWasTruncated on the server: with no
    // evidence of completeness we do not claim it.
    const state = resolveQueryState({
      isPending: false,
      isError: false,
      connected: true,
      rowCount: 0,
    });
    expect(state).toMatchObject({ absenceEstablished: false });
  });
});

describe("resolveQueryState ready sampling", () => {
  it("carries capped pulls through on a ready result", () => {
    const state = resolveQueryState({
      isPending: false,
      isError: false,
      connected: true,
      rowCount: 25,
      sampling: [capped],
    });
    expect(state).toMatchObject({ kind: "ready" });
    expect(state.kind === "ready" && state.cappedPulls).toEqual([capped]);
  });

  it("carries nothing through when every pull completed", () => {
    const state = resolveQueryState({
      isPending: false,
      isError: false,
      connected: true,
      rowCount: 25,
      sampling: [complete],
    });
    expect(state.kind === "ready" && state.cappedPulls).toEqual([]);
  });
});

describe("resolveQueryState is inert", () => {
  it("never invokes the retry callback while resolving", () => {
    // useMeteredQuery's protection against paid calls on page restore depends on
    // nothing triggering a request outside an explicit user action. Resolving
    // state is not a user action.
    const onRetry = vi.fn();
    resolveQueryState({
      isPending: false,
      isError: true,
      connected: true,
      rowCount: 0,
      retry: { ...freeRetry, onRetry },
    });
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("passes a credit-spending retry through unchanged", () => {
    // The control that costs money must be distinguishable from the one that
    // does not -- the same refresh icon meant both before this phase.
    const state = resolveQueryState({
      isPending: false,
      isError: true,
      connected: true,
      rowCount: 0,
      retry: { onRetry: () => {}, pending: false, cost: "credits" },
    });
    expect(state.kind === "error" && state.retry?.cost).toBe("credits");
  });
});
