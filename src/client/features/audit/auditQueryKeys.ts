import type { QueryKey } from "@tanstack/react-query";

/**
 * The cache keys for the audit server functions.
 *
 * There is one factory per function because there was previously one NAME per
 * caller: `getAuditHistory` was cached as "audit-history", "auditHistory" and
 * "report-audits", and `getAuditResults` as "audit-results", "auditResults" and
 * "report-audit-results". Six names, three server responses.
 *
 * That cost twice. The tab that deletes an audit invalidated only its own name,
 * so a deleted audit stayed on the dashboard card, Getting Started,
 * Opportunities, On-Page Fixes and the client report until something else
 * happened to refetch them. And every distinct name is a separate cache entry,
 * so five surfaces reading the same history each paid for their own request
 * instead of sharing one.
 *
 * Importing these is therefore not a tidiness rule: a caller that spells its
 * own key opts out of both invalidation and the shared cache, silently.
 */

export function auditHistoryKey(projectId: string): QueryKey {
  return ["audit-history", projectId];
}

/** `auditId` is part of the identity: results are per-audit, not per-project. */
export function auditResultsKey(
  projectId: string,
  auditId: string | undefined,
): QueryKey {
  return ["audit-results", projectId, auditId];
}

export function auditStatusKey(projectId: string, auditId: string): QueryKey {
  return ["audit-status", projectId, auditId];
}

/**
 * What to invalidate after an audit is created or deleted.
 *
 * Prefixes rather than exact keys: results and status carry an `auditId`
 * segment, and a deletion affects every audit in the project — the report and
 * the dashboard both read "the latest audit", which the deleted one may have
 * been.
 */
export function auditCacheKeysForProject(projectId: string): QueryKey[] {
  return [
    ["audit-history", projectId],
    ["audit-results", projectId],
    ["audit-status", projectId],
  ];
}
