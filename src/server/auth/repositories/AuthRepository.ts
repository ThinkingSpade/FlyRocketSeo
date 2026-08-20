import { and, asc, eq, notLike } from "drizzle-orm";
import { db } from "@/db";
import { member, organization, user as authUser } from "@/db/schema";
import { DELEGATED_ORGANIZATION_ID_PATTERN } from "@/server/auth/delegated-organization-id";

type DelegatedOrganizationInput = {
  id: string;
  name: string;
  slug: string;
};

async function upsertDelegatedOrganization(input: DelegatedOrganizationInput) {
  await db
    .insert(organization)
    .values({
      id: input.id,
      name: input.name,
      slug: input.slug,
      logo: null,
      createdAt: new Date(),
      metadata: null,
    })
    .onConflictDoUpdate({
      target: organization.id,
      set: {
        name: input.name,
        slug: input.slug,
      },
    });
}

/**
 * The user's own team workspace, never their delegated one.
 *
 * Delegated organizations are excluded because they are per-user scaffolding
 * for externally-authenticated requests, not somewhere projects live. A user
 * can belong to both, and ordering by join date returned whichever they
 * happened to acquire first.
 */
async function findFirstOrganizationIdForUser(userId: string) {
  const [existingMembership] = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(
      and(
        eq(member.userId, userId),
        notLike(member.organizationId, DELEGATED_ORGANIZATION_ID_PATTERN),
      ),
    )
    .orderBy(asc(member.createdAt))
    .limit(1);

  return existingMembership?.organizationId ?? null;
}

/**
 * The deployment's shared team workspace: the oldest REAL organization.
 *
 * The delegated exclusion is the whole point. This query decides where a
 * session with no active organization lands, and a delegated workspace that
 * predates the team's own — which is what happens the first time anyone hits
 * the app behind Cloudflare Access — made every later sign-in land in an empty
 * per-user workspace while the team's projects sat in the organization right
 * behind it in this ordering.
 */
async function findSharedOrganizationId(): Promise<string | null> {
  const [sharedOrganization] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(notLike(organization.id, DELEGATED_ORGANIZATION_ID_PATTERN))
    .orderBy(asc(organization.createdAt))
    .limit(1);

  return sharedOrganization?.id ?? null;
}

async function ensureMembership(input: {
  userId: string;
  organizationId: string;
  role?: string;
}): Promise<void> {
  const [existingMembership] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.userId, input.userId),
        eq(member.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (existingMembership) {
    return;
  }

  await db
    .insert(member)
    .values({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      userId: input.userId,
      role: input.role ?? "member",
      createdAt: new Date(),
    })
    .onConflictDoNothing();
}

async function getHostedUser(userId: string) {
  return db.query.user.findFirst({
    columns: {
      id: true,
      email: true,
      name: true,
    },
    where: eq(authUser.id, userId),
  });
}

export const AuthRepository = {
  upsertDelegatedOrganization,
  findFirstOrganizationIdForUser,
  findSharedOrganizationId,
  ensureMembership,
  getHostedUser,
} as const;
