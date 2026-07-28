import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account } from "@/db/schema";
import { GBP_OAUTH_PROVIDER_ID } from "@/shared/gbp";
import {
  createGbpClient,
  GbpApiError,
  GbpTokenError,
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
type GbpLocationOption = {
  name: string;
  title: string;
  accountName: string;
};

type GbpLocationsErrorReason = "requires_reconnect" | "temporary";

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

function classifyGbpError(error: unknown): GbpLocationsErrorReason | null {
  if (error instanceof GbpTokenError) return "requires_reconnect";
  if (error instanceof GbpApiError) {
    if (error.status === 401 || error.status === 403) {
      return "requires_reconnect";
    }
    if (error.status === 429 || error.status >= 500) return "temporary";
    return null;
  }
  if (
    error instanceof TypeError &&
    /fetch failed|failed to fetch|networkerror|network request failed|load failed/i.test(
      error.message,
    )
  ) {
    return "temporary";
  }
  return null;
}

/** Every location across every account this grant can act on, for the
 *  location-picker UI. Almost always a single account with one or a
 *  handful of locations, so a nested list-then-list-locations pair of calls
 *  (rather than a paginated combined endpoint -- Google doesn't offer one)
 *  stays cheap in practice. */
async function listAvailableLocationsForUser(userId: string): Promise<{
  locations: GbpLocationOption[];
  errorReason: GbpLocationsErrorReason | null;
}> {
  try {
    const client = createGbpClient({ userId });
    const accounts = await client.listAccounts();
    const locations: GbpLocationOption[] = [];
    for (const acc of accounts) {
      const accountLocations = await client.listLocations(acc.name);
      for (const location of accountLocations) {
        locations.push({
          name: location.name,
          title: location.title,
          accountName: acc.accountName,
        });
      }
    }
    return { locations, errorReason: null };
  } catch (error) {
    const errorReason = classifyGbpError(error);
    if (!errorReason) throw error;
    return { locations: [], errorReason };
  }
}

async function setConnection(input: {
  projectId: string;
  organizationId: string;
  locationName: string;
  userId: string;
  userEmail: string;
}): Promise<GbpConnection> {
  return GbpConnectionRepository.upsert({
    projectId: input.projectId,
    organizationId: input.organizationId,
    locationName: input.locationName,
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
