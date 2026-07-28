import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account } from "@/db/schema";
import { GBP_OAUTH_PROVIDER_ID } from "@/shared/gbp";
import {
  createGbpClient,
  GbpApiError,
  GbpTokenError,
  isNetworkTransportError,
} from "@/server/lib/gbpClient";
import {
  GbpConnectionRepository,
  type GbpConnection,
} from "@/server/features/gbp/repositories/GbpConnectionRepository";

/**
 * Connection-lifecycle half of GBP writing: which Google location a project
 * publishes/patches to, and whose business.manage grant backs it. Kept
 * separate from GbpWriteService (the actual publish/update actions) the same
 * way GscService bundles connection management with its read actions in one
 * module -- but split into its own file here purely to keep each file under
 * this repo's max-lines budget, not as a signal that the two are unrelated.
 */

// Neither type below is imported by name anywhere: serverFunctions/gbp.ts
// consumes listAvailableLocationsForUser's return structurally, and the
// client (GbpLocationPicker.tsx) deliberately declares its OWN local shape
// rather than importing a server-only module into client code.
//
// Two DIFFERENT "account name" concepts live side by side here, both sourced
// from Google's Account resource (see gbpClient.ts's GbpAccount) -- easy to
// conflate because Google itself names them confusingly close:
//  - accountName: the account's RESOURCE name ("accounts/123", from Google's
//    Account.name). This is what gets persisted (gbp_connections.accountName)
//    and later joined with the location's own resource name to compose the
//    v4 localPosts parent -- see GbpWriteService.publishPost.
//  - accountDisplayName: the human-readable business name on the account
//    (from Google's OWN field literally called Account.accountName, e.g.
//    "Joe's Pizza LLC"). Shown only in the picker so a grant covering more
//    than one account is still disambiguable; never stored.
type GbpLocationOption = {
  name: string;
  title: string;
  accountName: string;
  accountDisplayName: string;
};

// "access_denied" is deliberately its own reason, not folded into
// "requires_reconnect" (finding A4): a 403 means the request was
// authenticated but not authorized for this specific location -- a
// PERMISSIONS problem, not necessarily an expired or revoked token (which
// Google reports as 401). Conflating the two told a user whose grant was
// perfectly healthy to "reconnect", the wrong remedy for "this account
// doesn't manage this listing".
type GbpLocationsErrorReason =
  | "requires_reconnect"
  | "access_denied"
  | "temporary";

async function getConnection(projectId: string): Promise<GbpConnection | null> {
  return GbpConnectionRepository.getByProjectId(projectId);
}

/** Whether this user has linked a google-business-profile grant (regardless
 *  of whether they've picked a location yet). Drives the connect-vs-pick UI,
 *  mirroring GscService.userHasGrant exactly but against the SEPARATE
 *  GBP_OAUTH_PROVIDER_ID grant. */
async function userHasGrant(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, GBP_OAUTH_PROVIDER_ID),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Distinguishes what this can actually establish from the response's own
 * status semantics (finding A4), rather than collapsing every 4xx into
 * "your connection expired":
 *  - 401 (Unauthenticated) IS specifically about the credential itself --
 *    missing, invalid, or expired -- so "reconnect" is the honest remedy.
 *  - 403 (PermissionDenied) means the request WAS authenticated but isn't
 *    authorized for this location -- a permissions problem on that
 *    location, not evidence the connection itself is dead.
 *  - 429/5xx and a transport-level failure are retryable, not anything the
 *    user needs to act on.
 *  - Anything else this can't characterize returns null, which propagates
 *    the raw error rather than naming a cause that isn't established.
 */
function classifyGbpError(error: unknown): GbpLocationsErrorReason | null {
  if (error instanceof GbpTokenError) return "requires_reconnect";
  if (error instanceof GbpApiError) {
    if (error.status === 401) return "requires_reconnect";
    if (error.status === 403) return "access_denied";
    if (error.status === 429 || error.status >= 500) return "temporary";
    return null;
  }
  if (isNetworkTransportError(error)) return "temporary";
  return null;
}

/** Every location across every account this grant can act on, for the
 *  location-picker UI. Almost always a single account with one or a
 *  handful of locations, so a nested list-then-list-locations pair of calls
 *  (rather than a paginated combined endpoint -- Google doesn't offer one)
 *  stays cheap in practice. `incomplete: true` (final wave item 2) means
 *  the page cap was hit -- on EITHER the accounts.list call or any one
 *  account's locations.list call -- with a token still outstanding, so
 *  `locations` is a genuine partial. Before this, a truncated empty result
 *  was indistinguishable from "this grant genuinely has none", and the
 *  picker asserted the latter. */
async function listAvailableLocationsForUser(userId: string): Promise<{
  locations: GbpLocationOption[];
  errorReason: GbpLocationsErrorReason | null;
  incomplete: boolean;
}> {
  try {
    const client = createGbpClient({ userId });
    const { accounts, truncated: accountsTruncated } =
      await client.listAccounts();
    const locations: GbpLocationOption[] = [];
    let locationsTruncated = false;
    for (const acc of accounts) {
      const accountLocations = await client.listLocations(acc.name);
      if (accountLocations.truncated) locationsTruncated = true;
      for (const location of accountLocations.locations) {
        locations.push({
          name: location.name,
          title: location.title,
          accountName: acc.name,
          accountDisplayName: acc.accountName,
        });
      }
    }
    return {
      locations,
      errorReason: null,
      incomplete: accountsTruncated || locationsTruncated,
    };
  } catch (error) {
    const errorReason = classifyGbpError(error);
    if (!errorReason) throw error;
    // A decisive error, not a silent truncation -- nothing here was cut
    // short, so `incomplete` doesn't apply.
    return { locations: [], errorReason, incomplete: false };
  }
}

async function setConnection(input: {
  projectId: string;
  organizationId: string;
  locationName: string;
  // The chosen location's account resource name ("accounts/123") -- see
  // GbpLocationOption.accountName above. Required so publishing can compose
  // the v4 localPosts parent later (GbpWriteService.publishPost).
  accountName: string;
  userId: string;
  userEmail: string;
}): Promise<GbpConnection> {
  return GbpConnectionRepository.upsert({
    projectId: input.projectId,
    organizationId: input.organizationId,
    locationName: input.locationName,
    accountName: input.accountName,
    connectedByUserId: input.userId,
    connectedAccountEmail: input.userEmail,
  });
}

/** Remove this user's google-business-profile grant once no project still
 *  references it -- same "only unlink what's actually orphaned" reasoning as
 *  GscService.disconnect, applied to the separate GBP grant. */
async function unlinkUserGrant(userId: string): Promise<void> {
  await db
    .delete(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, GBP_OAUTH_PROVIDER_ID),
      ),
    );
}

async function disconnect(input: {
  projectId: string;
  userId: string;
}): Promise<void> {
  const connection = await GbpConnectionRepository.getByProjectId(
    input.projectId,
  );
  await GbpConnectionRepository.deleteByProjectId(input.projectId);
  if (!connection || connection.connectedByUserId === input.userId) {
    const stillUsed = await GbpConnectionRepository.existsForConnector(
      input.userId,
    );
    if (!stillUsed) {
      await unlinkUserGrant(input.userId);
    }
  }
}

export const GbpConnectionService = {
  getConnection,
  userHasGrant,
  listAvailableLocationsForUser,
  setConnection,
  disconnect,
};
