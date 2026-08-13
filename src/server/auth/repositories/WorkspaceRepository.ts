import { and, asc, eq, notLike } from "drizzle-orm";
import { db } from "@/db";
import { member, organization } from "@/db/schema";
import { DELEGATED_ORGANIZATION_ID_PATTERN } from "@/server/auth/delegated-organization-id";

/**
 * The workspaces a user may actually stand in.
 *
 * This query is the only definition of that set: the switcher lists it, and the
 * switch itself is authorized against it (see `workspaces-handler.ts`), so
 * "what you can see" and "where you can go" cannot drift apart into a
 * cross-tenant hole.
 *
 * Two properties are load-bearing:
 *
 * 1. It reads FROM `member`, not from `organization`. Every row therefore
 *    starts life as one of this user's own membership rows, and the join can
 *    only narrow it. An organization nobody joined them to is unreachable here
 *    by construction rather than by a filter someone has to remember.
 *
 * 2. Delegated organizations are excluded, by the same pattern the rest of the
 *    codebase uses. They are per-user scaffolding for Cloudflare Access and
 *    local_noauth, and `resolveHostedContext` re-resolves away from one on
 *    every request — so a switcher that offered one would be silently undone by
 *    the next page load. Offering it would be a lie, not merely useless.
 */
async function listWorkspacesForUser(userId: string) {
  return (
    db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(
        and(
          eq(member.userId, userId),
          notLike(member.organizationId, DELEGATED_ORGANIZATION_ID_PATTERN),
        ),
      )
      // Alphabetical, because the list is a menu a person reads. Join date — the
      // ordering that picked the wrong workspace in the first place — says
      // nothing a user could act on.
      .orderBy(asc(organization.name))
  );
}

export const WorkspaceRepository = {
  listWorkspacesForUser,
} as const;
