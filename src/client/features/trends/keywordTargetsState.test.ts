import { describe, expect, it } from "vitest";
import { pickDisplayGeo, resolvePaidState } from "./keywordTargetsState";
import type { KeywordDiscoveryResult } from "@/types/schemas/keyword-discovery";
import type { ResolvedGeo } from "@/shared/geo/types";

const okResult: KeywordDiscoveryResult = {
  status: "ok",
  domain: "example.com",
  fetchedAt: "2026-08-10T00:00:00.000Z",
  keywords: [],
};

const failedResult: KeywordDiscoveryResult = {
  status: "failed",
  reason: "provider_error",
  attemptedAt: "2026-08-10T00:00:00.000Z",
};

const dfw: ResolvedGeo = {
  locationCode: 200623,
  languageCode: "en",
  provider: "google_ads",
  scope: "local",
  label: "Dallas-Fort Worth TX",
};

const unitedStates: ResolvedGeo = {
  locationCode: 2840,
  languageCode: "en",
  provider: "google_ads",
  scope: "national",
  label: "United States",
};

describe("resolvePaidState", () => {
  it("reports no-domain regardless of every other input", () => {
    expect(
      resolvePaidState({
        domain: null,
        active: okResult,
        isError: true,
        outcome: "expired",
        hasCredits: false,
      }),
    ).toBe("no-domain");
  });

  it("surfaces a failed re-run even though the last successful result is still active (finding 4)", () => {
    // Exact regression scenario: a prior run succeeded (active is "ok"),
    // then the user clicked "Run again" and THAT attempt threw. Before the
    // fix, `ok` was checked first and the failure never surfaced -- money
    // could move with nothing changing on screen.
    expect(
      resolvePaidState({
        domain: "example.com",
        active: okResult,
        isError: true,
        outcome: "ready",
        hasCredits: true,
      }),
    ).toBe("failed");
  });

  it("reports ok once the failing attempt clears and the last result is still success", () => {
    expect(
      resolvePaidState({
        domain: "example.com",
        active: okResult,
        isError: false,
        outcome: "ready",
        hasCredits: true,
      }),
    ).toBe("ok");
  });

  it("reports failed for a restored run that was itself recorded as a failure", () => {
    // No live call happened this mount (isError: false) -- the failure is
    // read back from a restored analysis_runs row instead.
    expect(
      resolvePaidState({
        domain: "example.com",
        active: failedResult,
        isError: false,
        outcome: "ready",
        hasCredits: true,
      }),
    ).toBe("failed");
  });

  it("reports expired ahead of no-credits when the restore outcome says so", () => {
    expect(
      resolvePaidState({
        domain: "example.com",
        active: null,
        isError: false,
        outcome: "expired",
        hasCredits: false,
      }),
    ).toBe("expired");
  });

  it("treats an unreadable restore the same as an expired one", () => {
    expect(
      resolvePaidState({
        domain: "example.com",
        active: null,
        isError: false,
        outcome: "unreadable",
        hasCredits: true,
      }),
    ).toBe("expired");
  });

  it("reports no-credits when nothing else explains the empty state", () => {
    expect(
      resolvePaidState({
        domain: "example.com",
        active: null,
        isError: false,
        outcome: "none",
        hasCredits: false,
      }),
    ).toBe("no-credits");
  });

  it("reports none when a run simply hasn't happened yet and nothing blocks it", () => {
    expect(
      resolvePaidState({
        domain: "example.com",
        active: null,
        isError: false,
        outcome: "none",
        hasCredits: true,
      }),
    ).toBe("none");
  });
});

describe("pickDisplayGeo", () => {
  it("shows the restored geo before any live run has completed this mount", () => {
    expect(pickDisplayGeo(null, null, unitedStates)).toBe(unitedStates);
  });

  it("shows the fresh geo once a live run has succeeded", () => {
    expect(pickDisplayGeo(okResult, dfw, unitedStates)).toBe(dfw);
  });

  it("never surfaces a freshGeo that isn't backed by a successful fresh result (finding 5)", () => {
    // Simulates the exact bug: freshGeo desynced from fresh, e.g. a failed
    // re-run's newly-captured geo leaking in ahead of a result that never
    // arrived. Even with a stale/rogue freshGeo present, a null fresh must
    // still fall back to restoredGeo, never the rogue value.
    expect(pickDisplayGeo(null, dfw, unitedStates)).toBe(unitedStates);
  });

  it("shows nothing when there is neither a fresh nor a restored geo", () => {
    expect(pickDisplayGeo(null, null, null)).toBeNull();
  });
});
