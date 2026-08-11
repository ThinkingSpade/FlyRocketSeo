import { describe, expect, it } from "vitest";
import {
  INITIAL_AUTHORIZED_RUN_STATE,
  authorizeRunState,
  buildMeteredQueryOptions,
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

describe("metered query request multiplication", () => {
  // TanStack retries browser queries three times by default, so one click on a
  // paid lookup could reach the billed provider four times. Three call sites had
  // each patched this locally; the guarantee belongs to the wrapper.
  it("never retries a paid query, however it was configured", () => {
    const options = buildMeteredQueryOptions({
      authorized: true,
      queryKey: ["backlinksRows", "example.com"],
      queryFn: () => Promise.reject(new Error("provider timeout")),
    });

    expect(options.retry).toBe(0);
  });

  it("closes every automatic re-request path, not just retries", () => {
    const options = buildMeteredQueryOptions({
      authorized: true,
      queryKey: ["backlinksOverview", "example.com"],
      queryFn: () => Promise.resolve(null),
    });

    expect(options.retry).toBe(0);
    expect(options.refetchOnMount).toBe(false);
    expect(options.refetchOnReconnect).toBe(false);
    expect(options.refetchOnWindowFocus).toBe(false);
    expect(options.staleTime).toBe(Infinity);
  });

  it("stays disabled until an in-session authorization, so nothing fires on mount", () => {
    const options = buildMeteredQueryOptions({
      queryKey: ["backlinksRows", "example.com"],
      queryFn: () => Promise.resolve(null),
    });

    expect(options.enabled).toBe(false);
  });
});
