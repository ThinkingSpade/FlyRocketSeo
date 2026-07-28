import { describe, expect, it, vi } from "vitest";

// This module's import graph reaches @/serverFunctions/config (for
// getClientRuntimeConfig), which imports directly from `cloudflare:workers` --
// unavailable in vitest. Only resolveGbpCapabilityState (a pure function, no
// hooks) is under test here, so a bare stub is enough to let the module
// load; nothing in these tests reads `env`.
vi.mock("cloudflare:workers", () => ({ env: {} }));

async function resolveGbpCapabilityState(
  isResolved: boolean,
  gbpWriteAvailable: boolean,
): Promise<string> {
  const module = await import("./useEmailVerificationBypassed");
  return module.resolveGbpCapabilityState(isResolved, gbpWriteAvailable);
}

/**
 * Final wave item 3 (an A6 residual): GbpConnectionCard used to collapse
 * "the live runtime-config check hasn't resolved yet" and "the check
 * resolved and GBP writing is confirmed unavailable" into the same boolean
 * (useGbpWriteAvailable), then rendered NotConfiguredCard's confident "at
 * least one of these isn't in place yet" copy for BOTH -- asserting a
 * requirement is missing while it was merely unresolved. This pure resolver
 * makes the distinction explicit and independently testable, without needing
 * to render the query-hook-heavy card component itself.
 */
describe("resolveGbpCapabilityState (final wave item 3)", () => {
  it("is 'checking' while unresolved, even if the (untrusted) prerendered value says available", async () => {
    // The exact failing input: a hosted build's first mount, before
    // ClientRuntimeConfigBootstrap's forced live refetch completes.
    // gbpWriteAvailable might be a stale prerendered `true`, but this must
    // not be read as confirmed availability OR confirmed unavailability yet.
    expect(await resolveGbpCapabilityState(false, true)).toBe("checking");
  });

  it("is 'checking' while unresolved and the prerendered value says unavailable", async () => {
    expect(await resolveGbpCapabilityState(false, false)).toBe("checking");
  });

  it("is 'unavailable' once resolved and the live config says GBP writing is off", async () => {
    expect(await resolveGbpCapabilityState(true, false)).toBe("unavailable");
  });

  it("is 'available' once resolved and the live config confirms it", async () => {
    expect(await resolveGbpCapabilityState(true, true)).toBe("available");
  });
});
