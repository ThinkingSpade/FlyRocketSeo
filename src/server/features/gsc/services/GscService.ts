import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account } from "@/db/schema";
import { GSC_OAUTH_PROVIDER_ID, type GscSitesErrorReason } from "@/shared/gsc";
import { AppError } from "@/server/lib/errors";
import {
  createGscClient,
  GscApiError,
  GscTokenError,
  type GscSite,
  type UrlInspectionResult,
} from "@/server/lib/gscClient";
import {
  buildSearchAnalyticsRequest,
  type GscPerformanceInput,
} from "@/server/features/gsc/searchAnalytics";
import {
  GscConnectionRepository,
  type GscConnection,
} from "@/server/features/gsc/repositories/GscConnectionRepository";
import type {
  GscSearchAnalyticsRequest,
  GscSearchAnalyticsRow,
} from "@/server/lib/gscClient";

const SITE_UNVERIFIED_PERMISSION = "siteUnverifiedUser";

type GscPerformanceResult = {
  siteUrl: string;
  connectedBy: string | null;
  request: GscSearchAnalyticsRequest;
  rows: GscSearchAnalyticsRow[];
};

type GscSiteListResult = {
  sites: GscSite[];
  errorReason: GscSitesErrorReason | null;
  requiresReconnect: boolean;
};

/** Thrown when a project has no connected GSC property. */
export class GscNotConnectedError extends Error {
  constructor(public readonly projectId: string) {
    super("Search Console is not connected for this project");
    this.name = "GscNotConnectedError";
  }
}

async function getConnection(projectId: string): Promise<GscConnection | null> {
  return GscConnectionRepository.getByProjectId(projectId);
}

/** Whether this user has linked a google-search-console grant (regardless of
 *  whether they've picked a property yet). Drives the connect-vs-pick UI. */
async function userHasGrant(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, GSC_OAUTH_PROVIDER_ID),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** List verified properties available on a user's google-search-console grant. */
async function listSitesForUser(userId: string): Promise<GscSite[]> {
  return createGscClient({ userId }).listSites();
}

/** Whether a failure indicates that the stored grant itself may be unusable.
 *  Retryable API and network failures are classified separately below. */
export function isExpectedGrantFailure(error: unknown): boolean {
  if (error instanceof GscTokenError) return true;
  return (
    error instanceof GscApiError &&
    (error.status === 401 || error.status === 403)
  );
}

function isApiNotConfiguredError(error: GscApiError): boolean {
  if (error.status !== 403 || !error.body) return false;

  return (
    /accessNotConfigured/i.test(error.body) ||
    /SERVICE_DISABLED/i.test(error.body) ||
    /has not been used/i.test(error.body) ||
    /is disabled/i.test(error.body)
  );
}

function isInsufficientPermissionsError(error: GscApiError): boolean {
  if (error.status !== 403 || !error.body) return false;
  return (
    /insufficientPermissions/i.test(error.body) ||
    /PERMISSION_DENIED/i.test(error.body)
  );
}

function isNetworkTypeError(error: TypeError): boolean {
  return /fetch failed|failed to fetch|networkerror|network request failed|load failed/i.test(
    error.message,
  );
}

/** Classify site-list failures that have a safe, actionable client state. */
export function classifyGscSitesError(
  error: unknown,
): GscSitesErrorReason | null {
  if (error instanceof GscTokenError) return "requires_reconnect";
  if (error instanceof GscApiError) {
    if (error.status === 401) return "requires_reconnect";
    if (isApiNotConfiguredError(error)) return "api_not_configured";
    if (isInsufficientPermissionsError(error)) return "requires_reconnect";
    if (error.status === 403 || error.status === 429 || error.status >= 500) {
      return "temporary";
    }
    return null;
  }
  // Fetch reports transport/network failures as TypeError. Other TypeErrors are
  // programming defects and must remain visible to error tracking.
  if (error instanceof TypeError && isNetworkTypeError(error)) {
    return "temporary";
  }
  return null;
}

/** List properties for the picker UI. Known external failures become an
 *  actionable reason instead of being mistaken for an expired connection.
 *
 *  Only a GscTokenError unlinks the stored grant — the one unambiguous "this
 *  grant is dead" signal (Better Auth couldn't mint/refresh a token, i.e. the
 *  user revoked access or the refresh token expired). API and transport errors
 *  leave the grant intact. */
async function listSitesForUserWithGrantStatus(
  userId: string,
): Promise<GscSiteListResult> {
  try {
    return {
      sites: await listSitesForUser(userId),
      errorReason: null,
      requiresReconnect: false,
    };
  } catch (error) {
    const errorReason = classifyGscSitesError(error);
    if (!errorReason) throw error;

    if (error instanceof GscTokenError) {
      console.warn("[GSC] Unlinking stored grant after token failure", {
        reason: "requires_reconnect",
        status: null,
      });
      await unlinkUserGrant(userId);
    } else {
      console.warn("[GSC] Unable to list sites", {
        reason: errorReason,
        status: error instanceof GscApiError ? error.status : null,
      });
    }
    return {
      sites: [],
      errorReason,
      requiresReconnect: errorReason === "requires_reconnect",
    };
  }
}

/** Map a verified property to a project. Rejects unverified properties and
 *  properties not present on the connector's grant. */
async function setSite(input: {
  projectId: string;
  organizationId: string;
  siteUrl: string;
  userId: string;
  userEmail: string;
}): Promise<GscConnection> {
  const sites = await listSitesForUser(input.userId);
  const match = sites.find((s) => s.siteUrl === input.siteUrl);
  if (!match) {
    throw new AppError(
      "NOT_FOUND",
      "That Search Console property isn't available on your connected Google account.",
    );
  }
  if (match.permissionLevel === SITE_UNVERIFIED_PERMISSION) {
    throw new AppError(
      "FORBIDDEN",
      "You don't have verified access to that Search Console property.",
    );
  }
  return GscConnectionRepository.upsert({
    projectId: input.projectId,
    organizationId: input.organizationId,
    siteUrl: input.siteUrl,
    connectedByUserId: input.userId,
    connectedAccountEmail: input.userEmail,
  });
}

/** Remove this user's google-search-console grant (stored OAuth tokens). */
async function unlinkUserGrant(userId: string): Promise<void> {
  await db
    .delete(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, GSC_OAUTH_PROVIDER_ID),
      ),
    );
}

async function disconnect(input: {
  projectId: string;
  userId: string;
}): Promise<void> {
  const connection = await GscConnectionRepository.getByProjectId(
    input.projectId,
  );
  await GscConnectionRepository.deleteByProjectId(input.projectId);
  // Clean up the caller's *own* OAuth grant once none of their projects still
  // use it. Safe by construction: unlinkUserGrant only ever deletes the
  // caller's account row, never another member's. We skip cleanup only when the
  // binding we removed belonged to a *different* member, so unbinding their
  // property never revokes the caller's unrelated grant. A null connection
  // means the caller linked Google but never picked a property — that dangling
  // grant is theirs to drop.
  if (!connection || connection.connectedByUserId === input.userId) {
    const stillUsed = await GscConnectionRepository.existsForConnector(
      input.userId,
    );
    if (!stillUsed) {
      await unlinkUserGrant(input.userId);
    }
  }
}

/** Pass-through of GSC `searchAnalytics.query` for a project's connected property. */
async function getPerformance(
  input: GscPerformanceInput,
): Promise<GscPerformanceResult> {
  const connection = await GscConnectionRepository.getByProjectId(
    input.projectId,
  );
  if (!connection) {
    throw new GscNotConnectedError(input.projectId);
  }
  const request = buildSearchAnalyticsRequest(input);
  const client = createGscClient({ userId: connection.connectedByUserId });
  const rows = await client.querySearchAnalytics(connection.siteUrl, request);
  return {
    siteUrl: connection.siteUrl,
    connectedBy: connection.connectedAccountEmail,
    request,
    rows,
  };
}

type GscUrlInspection = {
  url: string;
  result: UrlInspectionResult | null;
  error?: string;
};

type GscInspectUrlsResult = {
  siteUrl: string;
  connectedBy: string | null;
  results: GscUrlInspection[];
};

/** Inspect 1–N URLs against a project's connected property. Resolves the
 *  connection once, then inspects each URL; per-URL failures are captured
 *  inline so one bad URL doesn't fail the batch. Token/grant failures
 *  propagate so the caller can prompt a reconnect. */
async function inspectUrls(input: {
  projectId: string;
  urls: string[];
  languageCode?: string;
}): Promise<GscInspectUrlsResult> {
  const connection = await GscConnectionRepository.getByProjectId(
    input.projectId,
  );
  if (!connection) {
    throw new GscNotConnectedError(input.projectId);
  }
  const client = createGscClient({ userId: connection.connectedByUserId });
  const results: GscUrlInspection[] = [];
  for (const url of input.urls) {
    try {
      const result = await client.inspectUrl(
        connection.siteUrl,
        url,
        input.languageCode,
      );
      results.push({ url, result });
    } catch (error) {
      if (error instanceof GscTokenError) throw error;
      results.push({
        url,
        result: null,
        error: error instanceof Error ? error.message : "Inspection failed",
      });
    }
  }
  return {
    siteUrl: connection.siteUrl,
    connectedBy: connection.connectedAccountEmail,
    results,
  };
}

export const GscService = {
  getConnection,
  userHasGrant,
  listSitesForUserWithGrantStatus,
  setSite,
  disconnect,
  getPerformance,
  inspectUrls,
};
