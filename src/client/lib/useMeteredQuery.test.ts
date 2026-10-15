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

  it("never re-runs a FAILED paid query when an observer mounts onto it", () => {
    // TanStack's retryOnMount defaults to true: a query sitting in error with
    // no data is fetched again whenever a component (or a key switch) attaches
    // to it -- e.g. switching back to the search tab whose paid run failed.
    const options = buildMeteredQueryOptions({
      authorized: true,
      queryKey: ["keywordResearch", "p_1", ["seo"]],
      queryFn: () => Promise.reject(new Error("provider timeout")),
    });

    expect(options.retryOnMount).toBe(false);
  });

  it("keeps a paid result for the life of the page, so returning to it never refetches", () => {
    // An enabled observer that finds nothing cached fetches. If a paid result
    // could be garbage-collected, coming back to its still-authorized view
    // (a search tab, a sort, a card) after gcTime would silently re-bill it.
    const options = buildMeteredQueryOptions({
      authorized: true,
      queryKey: ["domain-overview", "p_1", "example.com"],
      queryFn: () => Promise.resolve(null),
    });

    expect(options.gcTime).toBe(Infinity);
  });

  it("stays disabled until an in-session authorization, so nothing fires on mount", () => {
    const options = buildMeteredQueryOptions({
      queryKey: ["backlinksRows", "example.com"],
      queryFn: () => Promise.resolve(null),
    });

    expect(options.enabled).toBe(false);
  });
});
