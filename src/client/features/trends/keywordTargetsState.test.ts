import { describe, expect, it } from "vitest";
import {
  describePaidFailure,
  pickDisplayGeo,
  resolveFailureReason,
  resolvePaidState,
} from "./keywordTargetsState";
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

const insufficientCreditsResult: KeywordDiscoveryResult = {
  status: "failed",
  reason: "insufficient_credits",
  attemptedAt: "2026-08-11T04:29:49.667Z",
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
        restoreFailed: true,
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
        restoreFailed: false,
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
        restoreFailed: false,
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
        restoreFailed: false,
        outcome: "ready",
        hasCredits: true,
      }),
    ).toBe("failed");
  });

  it("reports restore-failed rather than none when the history read itself errored", () => {
    // The dead end this state exists for: `restoreLatestRun` threw, so
    // `outcome` is null (no query.data at all) and `active` is null. Before
    // this branch existed that fell through to "none", which the card
    // rendered as NOTHING -- no banner, no button, no error -- while the
    // auto-run guard correctly refused to spend on a null outcome. Nothing
    // on the page could recover from it.
    expect(
      resolvePaidState({
        domain: "example.com",
        active: null,
        isError: false,
        restoreFailed: true,
        outcome: null,
        hasCredits: true,
      }),
    ).toBe("restore-failed");
  });

  it("still shows this mount's successful run when only the history read is broken", () => {
    // `active` here is the live `fresh` result. A broken history read must
    // not hide data we already have and already paid for.
    expect(
      resolvePaidState({
        domain: "example.com",
        active: okResult,
        isError: false,
        restoreFailed: true,
        outcome: null,
        hasCredits: true,
      }),
    ).toBe("ok");
  });

  it("prefers a live paid failure over a broken history read", () => {
    // Both are true at once when a paid call fails AND its own settle-time
    // invalidation refetch fails. The paid failure is the one that may have
    // cost money, so it is the one worth saying.
    expect(
      resolvePaidState({
        domain: "example.com",
        active: null,
        isError: true,
        restoreFailed: true,
        outcome: null,
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
        restoreFailed: false,
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
        restoreFailed: false,
        outcome: "unreadable",
        hasCredits: true,
      }),
    ).toBe("expired");
  });

  it("reports unknown, not none, while the restore has yet to answer", () => {
    // A null outcome means "we have not been told yet", the same convention
    // shouldAutoRunDiscovery reads it by. Collapsing it into "none" would
    // flash "Ranking data hasn't been loaded yet" -- with a button offering
    // to spend -- on every cold mount of a project that HAS already run.
    expect(
      resolvePaidState({
        domain: "example.com",
        active: null,
        isError: false,
        restoreFailed: false,
        outcome: null,
        hasCredits: true,
      }),
    ).toBe("unknown");
  });

  it("stays unknown rather than no-credits until the restore answers", () => {
    expect(
      resolvePaidState({
        domain: "example.com",
        active: null,
        isError: false,
        restoreFailed: false,
        outcome: null,
        hasCredits: false,
      }),
    ).toBe("unknown");
  });

  it("reports no-credits when nothing else explains the empty state", () => {
    expect(
      resolvePaidState({
        domain: "example.com",
        active: null,
        isError: false,
        restoreFailed: false,
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
        restoreFailed: false,
        outcome: "none",
        hasCredits: true,
      }),
    ).toBe("none");
  });
});

describe("resolveFailureReason", () => {
  it("reads the restored run's reason when a live re-run failed over a stale successful `active` (finding: live isError masked by a sticky `fresh`)", () => {
    // Exact regression scenario: a first run succeeded so `fresh` (and
    // therefore `active`) holds that "ok" result permanently -- a throw
    // never reaches `onSuccess`, so nothing ever clears it. The user clicks
    // "Refresh" and THAT attempt fails with insufficient_credits. Before the
    // fix, reading the reason off `active` produced null (generic message,
    // WITH a retry button) for a failure that must suppress retry.
    expect(
      resolveFailureReason({
        active: okResult,
        isError: true,
        restoredResult: insufficientCreditsResult,
      }),
    ).toBe("insufficient_credits");
  });

  it("still returns null for a live error when the restore has no failure row to read", () => {
    expect(
      resolveFailureReason({
        active: null,
        isError: true,
        restoredResult: null,
      }),
    ).toBeNull();
  });

  it("reads a purely restored failure with no live call this mount, unchanged from before", () => {
    // `isError: false` -- no live call happened; `active` IS the restored
    // result here because `fresh` is null. This is the case that already
    // worked and must keep working.
    expect(
      resolveFailureReason({
        active: failedResult,
        isError: false,
        restoredResult: failedResult,
      }),
    ).toBe("provider_error");
  });

  it("does not let a stale restored failure outrank a genuinely current success", () => {
    // isError false and active is "ok" (this mount's own live success, or a
    // restore that has already caught up) -- must not fall through to
    // whatever restoredResult happens to still hold underneath it.
    expect(
      resolveFailureReason({
        active: okResult,
        isError: false,
        restoredResult: failedResult,
      }),
    ).toBeNull();
  });
});

describe("a live failure resolved through to its user-facing message (defect: live isError hid a specific restored reason)", () => {
  it("live error + restored failed-with-insufficient_credits shows the credits message and suppresses retry", () => {
    const reason = resolveFailureReason({
      active: okResult,
      isError: true,
      restoredResult: insufficientCreditsResult,
    });

    const failure = describePaidFailure({
      reason,
      domain: "example.com",
      hasFreeRows: false,
    });

    expect(failure.canRetry).toBe(false);
    expect(failure.message).toContain("credits");
    expect(failure.message).toContain("example.com");
  });

  it("live error + no reason available still shows the generic message with retry", () => {
    const reason = resolveFailureReason({
      active: null,
      isError: true,
      restoredResult: null,
    });

    const failure = describePaidFailure({
      reason,
      domain: "example.com",
      hasFreeRows: false,
    });

    expect(failure).toEqual({
      message: "Couldn’t load ranking data for example.com.",
      canRetry: true,
    });
  });
});

describe("pickDisplayGeo", () => {
  it("shows the restored geo before any live run has completed this mount", () => {
    expect(
      pickDisplayGeo({
        active: okResult,
        fresh: null,
        freshGeo: null,
        restoredGeo: unitedStates,
      }),
    ).toBe(unitedStates);
  });

  it("shows the fresh geo once a live run has succeeded", () => {
    expect(
      pickDisplayGeo({
        active: okResult,
        fresh: okResult,
        freshGeo: dfw,
        restoredGeo: unitedStates,
      }),
    ).toBe(dfw);
  });

  it("never surfaces a freshGeo that isn't backed by a successful fresh result (finding 5)", () => {
    // Simulates the exact bug: freshGeo desynced from fresh, e.g. a failed
    // re-run's newly-captured geo leaking in ahead of a result that never
    // arrived. Even with a stale/rogue freshGeo present, a null fresh must
    // still fall back to restoredGeo, never the rogue value.
    expect(
      pickDisplayGeo({
        active: okResult,
        fresh: null,
        freshGeo: dfw,
        restoredGeo: unitedStates,
      }),
    ).toBe(unitedStates);
  });

  it("labels nothing when the restored run was itself a failure", () => {
    // A `{status:"failed"}` run still parses and still carries its own
    // persisted geo bundle, so `restoredGeo` resolves fine. Rendering it put
    // "Rankings in Dallas-Fort Worth TX" over a table of Search-Console-only
    // rows, immediately above the banner saying ranking data could not be
    // loaded. The scope line has to describe the rows on screen.
    expect(
      pickDisplayGeo({
        active: failedResult,
        fresh: null,
        freshGeo: null,
        restoredGeo: dfw,
      }),
    ).toBeNull();
  });

  it("labels nothing before any run has produced rows", () => {
    expect(
      pickDisplayGeo({
        active: null,
        fresh: null,
        freshGeo: null,
        restoredGeo: dfw,
      }),
    ).toBeNull();
  });

  it("shows nothing when there is neither a fresh nor a restored geo", () => {
    expect(
      pickDisplayGeo({
        active: okResult,
        fresh: null,
        freshGeo: null,
        restoredGeo: null,
      }),
    ).toBeNull();
  });
});
