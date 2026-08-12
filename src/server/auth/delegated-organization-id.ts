/**
 * What makes an organization "delegated", in one place.
 *
 * A delegated organization is a per-user artifact: Cloudflare Access and
 * local_noauth have no better-auth session to carry an active organization, so
 * each externally-authenticated user gets one keyed by their own id. It is
 * never a shared team workspace, and it is never a place another user's work
 * lives.
 *
 * That distinction used to exist only as a template literal inside
 * `delegated-organization.ts`, so the query that picks the deployment's shared
 * workspace could not tell the two kinds apart. It picked the OLDEST
 * organization, a delegated one happened to be four hours older than the real
 * team workspace, and every fresh hosted session was joined to it — an owner
 * signed in and found none of their projects, because the workspace holding
 * them was not the one the session activated.
 */
const DELEGATED_ORGANIZATION_PREFIX = "delegated-";

/** The id of the delegated organization belonging to `userId`. */
export function delegatedOrganizationId(userId: string): string {
  return `${DELEGATED_ORGANIZATION_PREFIX}${userId}`;
}

/**
 * A SQL LIKE pattern matching every delegated organization id.
 *
 * The prefix contains no `%` or `_`, so it needs no ESCAPE clause — asserted
 * in the tests rather than left as a reader's assumption, because a wildcard
 * creeping into the prefix would silently widen this to match real workspaces.
 */
export const DELEGATED_ORGANIZATION_ID_PATTERN = `${DELEGATED_ORGANIZATION_PREFIX}%`;

export function isDelegatedOrganizationId(organizationId: string): boolean {
  return organizationId.startsWith(DELEGATED_ORGANIZATION_PREFIX);
}
