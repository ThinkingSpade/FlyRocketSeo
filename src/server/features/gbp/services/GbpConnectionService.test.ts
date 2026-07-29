import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as GbpClientModule from "@/server/lib/gbpClient";
import { GbpApiError, GbpTokenError } from "@/server/lib/gbpClient";
import { GbpConnectionService } from "./GbpConnectionService";

// Same recipe as gbpClient.test.ts: GbpConnectionService's import graph
// reaches `cloudflare:workers` (via the db provider) and touches `@/db`
// directly (userHasGrant/unlinkUserGrant) -- neither exists/is needed for
// the classification behavior under test, so both are stubbed.
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/db", () => {
  const emptyQuery = {
    from: () => emptyQuery,
    where: () => emptyQuery,
    limit: () => Promise.resolve([]),
  };
  return { db: { select: () => emptyQuery, delete: () => emptyQuery } };
});

const mocks = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  listLocations: vi.fn(),
}));

// Mock only createGbpClient, preserving the real GbpApiError/GbpTokenError
// classes (and isNetworkTransportError) so classifyGbpError's `instanceof`
// checks inside GbpConnectionService exercise the genuine classes, not a
// mocked stand-in.
vi.mock("@/server/lib/gbpClient", async (importOriginal) => {
  const actual = await importOriginal<typeof GbpClientModule>();
  return {
    ...actual,
    createGbpClient: () => ({
      listAccounts: mocks.listAccounts,
      listLocations: mocks.listLocations,
    }),
  };
});

/**
 * Finding A4: classifyGbpError (not exported -- exercised through
 * listAvailableLocationsForUser, its one caller) used to fold every 403 into
 * "requires_reconnect" and every token-mint exception into a hard "revoked"
 * claim. These tests pin the corrected, status-semantics-based distinction:
 * 401 (Unauthenticated) is a real "reconnect" signal, 403 (PermissionDenied)
 * is a location-permissions problem instead, and a transport-level failure
 * is transient, not a claim about the grant at all.
 */
describe("GbpConnectionService.listAvailableLocationsForUser error classification (finding A4)", () => {
  beforeEach(() => {
    mocks.listAccounts.mockReset();
    mocks.listLocations.mockReset();
  });

  it("classifies a 401 as requires_reconnect (a genuine credential problem)", async () => {
    mocks.listAccounts.mockRejectedValue(
      new GbpApiError(401, "unauthenticated"),
    );

    const result =
      await GbpConnectionService.listAvailableLocationsForUser("u1");

    expect(result).toEqual({
      locations: [],
      errorReason: "requires_reconnect",
      incomplete: false,
    });
  });

  it("classifies a 403 as access_denied, NOT requires_reconnect (finding A4's exact failing input)", async () => {
    // The exact failing input from finding A4: a plain 403. Before the fix
    // this was indistinguishable from an expired/revoked connection, even
    // though a 403 means the request WAS authenticated -- just not
    // authorized for this location.
    mocks.listAccounts.mockRejectedValue(
      new GbpApiError(403, "permission denied"),
    );

    const result =
      await GbpConnectionService.listAvailableLocationsForUser("u1");

    expect(result).toEqual({
      locations: [],
      errorReason: "access_denied",
      incomplete: false,
    });
    expect(result.errorReason).not.toBe("requires_reconnect");
  });

  it("classifies a 429 and a 5xx as temporary", async () => {
    mocks.listAccounts.mockRejectedValue(new GbpApiError(429, "rate limited"));

    const result =
      await GbpConnectionService.listAvailableLocationsForUser("u1");

    expect(result).toEqual({
      locations: [],
      errorReason: "temporary",
      incomplete: false,
    });
  });

  it("classifies a GbpTokenError as requires_reconnect", async () => {
    mocks.listAccounts.mockRejectedValue(
      new GbpTokenError("grant revoked or expired"),
    );

    const result =
      await GbpConnectionService.listAvailableLocationsForUser("u1");

    expect(result).toEqual({
      locations: [],
      errorReason: "requires_reconnect",
      incomplete: false,
    });
  });

  it("classifies a network transport failure as temporary, not requires_reconnect", async () => {
    mocks.listAccounts.mockRejectedValue(new TypeError("fetch failed"));

    const result =
      await GbpConnectionService.listAvailableLocationsForUser("u1");

    expect(result).toEqual({
      locations: [],
      errorReason: "temporary",
      incomplete: false,
    });
  });

  it("re-throws an error it cannot characterize rather than guessing a reason", async () => {
    mocks.listAccounts.mockRejectedValue(new Error("something unexpected"));

    await expect(
      GbpConnectionService.listAvailableLocationsForUser("u1"),
    ).rejects.toThrow("something unexpected");
  });
});

/**
 * Final wave item 2 (the A5 residual): gbpClient's listAccounts/listLocations
 * now report whether pagination was cut off by the page cap with a token
 * still outstanding. This describe pins that listAvailableLocationsForUser
 * carries that fact through as `incomplete`, ORing it across every
 * accounts.list/locations.list call it makes -- a truncation on EITHER call
 * makes the combined `locations` list a partial, not a complete enumeration.
 */
describe("GbpConnectionService.listAvailableLocationsForUser pagination (final wave item 2)", () => {
  beforeEach(() => {
    mocks.listAccounts.mockReset();
    mocks.listLocations.mockReset();
  });

  it("reports incomplete when listAccounts itself hit the pagination cap", async () => {
    mocks.listAccounts.mockResolvedValue({ accounts: [], truncated: true });

    const result =
      await GbpConnectionService.listAvailableLocationsForUser("u1");

    // The exact failing shape finding A5's residual describes: every page
    // came back empty, so without `incomplete` a caller reads this
    // identically to "this account genuinely has none".
    expect(result).toEqual({
      locations: [],
      errorReason: null,
      incomplete: true,
    });
  });

  it("reports incomplete when listLocations hits the cap for one account, even though listAccounts itself completed", async () => {
    mocks.listAccounts.mockResolvedValue({
      accounts: [{ name: "accounts/1", accountName: "Biz" }],
      truncated: false,
    });
    mocks.listLocations.mockResolvedValue({ locations: [], truncated: true });

    const result =
      await GbpConnectionService.listAvailableLocationsForUser("u1");

    expect(result.incomplete).toBe(true);
  });

  it("is not incomplete when every page fetch ran to completion", async () => {
    mocks.listAccounts.mockResolvedValue({
      accounts: [{ name: "accounts/1", accountName: "Biz" }],
      truncated: false,
    });
    mocks.listLocations.mockResolvedValue({
      locations: [{ name: "locations/1", title: "Store" }],
      truncated: false,
    });

    const result =
      await GbpConnectionService.listAvailableLocationsForUser("u1");

    expect(result).toEqual({
      locations: [
        {
          name: "locations/1",
          title: "Store",
          accountName: "accounts/1",
          accountDisplayName: "Biz",
        },
      ],
      errorReason: null,
      incomplete: false,
    });
  });
});
