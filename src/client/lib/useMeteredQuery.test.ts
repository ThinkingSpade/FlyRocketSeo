import { describe, expect, it } from "vitest";
import {
  INITIAL_AUTHORIZED_RUN_STATE,
  authorizeRunState,
  isMeteredQueryEnabled,
  isRunAuthorized,
  withMeteredRunNonce,
} from "./useMeteredQuery";

describe("metered query authorization", () => {
  it("does not enable a prefilled request before an in-session authorization", () => {
    const prefilledKey = '["domain","example.com"]';

    expect(isRunAuthorized(INITIAL_AUTHORIZED_RUN_STATE, prefilledKey)).toBe(
      false,
    );
    expect(isMeteredQueryEnabled(false)).toBe(false);
  });

  it("synchronously deauthorizes when the current target key changes", () => {
    const domainAKey = '["domain","a.example"]';
    const domainBKey = '["domain","b.example"]';
    const authorized = authorizeRunState(
      INITIAL_AUTHORIZED_RUN_STATE,
      domainAKey,
    );

    expect(isRunAuthorized(authorized, domainAKey)).toBe(true);
    expect(isRunAuthorized(authorized, domainBKey)).toBe(false);
    expect(isMeteredQueryEnabled(isRunAuthorized(authorized, domainBKey))).toBe(
      false,
    );
  });

  it("increments the run nonce for a second click with identical inputs", () => {
    const key = '["domain","example.com"]';
    const firstRun = authorizeRunState(INITIAL_AUTHORIZED_RUN_STATE, key);
    const secondRun = authorizeRunState(firstRun, key);

    expect(secondRun.runNonce).toBe(firstRun.runNonce + 1);
    expect(isRunAuthorized(secondRun, key)).toBe(true);
    expect(
      withMeteredRunNonce(["domain", "example.com"], secondRun.runNonce),
    ).not.toEqual(
      withMeteredRunNonce(["domain", "example.com"], firstRun.runNonce),
    );
  });
});
