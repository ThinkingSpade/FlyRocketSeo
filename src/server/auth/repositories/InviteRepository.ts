import { and, desc, eq, gt, or } from "drizzle-orm";
import { db } from "@/db";
import { invitation } from "@/db/schema";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function createInvite(input: {
  email: string;
  organizationId: string;
  inviterId: string;
  expiresAt: Date;
  role?: string;
}): Promise<string> {
  const id = crypto.randomUUID();

  await db.insert(invitation).values({
    id,
    organizationId: input.organizationId,
    inviterId: input.inviterId,
    email: normalizeEmail(input.email),
    role: input.role ?? "member",
    status: "pending",
    expiresAt: input.expiresAt,
    createdAt: new Date(),
  });

  return id;
}

/**
 * The invitation that grants this email access, if any.
 *
 * Expiry gates ACCEPTING an invitation, not continuing to use an account that
 * already accepted one. The two statuses were previously filtered together on
 * `expiresAt > now`, which meant a teammate who had joined weeks earlier —
 * user row, credentials, member row and all — was locked out the moment the
 * invitation they had already consumed passed its date, with
 * `resolveHostedContext` telling them "This deployment is private." Access is
 * withdrawn by cancelling the invitation or removing the membership, both of
 * which are deliberate acts; a timestamp quietly passing is neither.
 *
 * `pending` keeps the expiry check: an invitation nobody accepted SHOULD go
 * stale.
 */
async function findActiveInviteByEmail(
  email: string,
): Promise<{ id: string; status: string } | null> {
  const [activeInvite] = await db
    .select({ id: invitation.id, status: invitation.status })
    .from(invitation)
    .where(
      and(
        eq(invitation.email, normalizeEmail(email)),
        or(
          eq(invitation.status, "accepted"),
          and(
            eq(invitation.status, "pending"),
            gt(invitation.expiresAt, new Date()),
          ),
        ),
      ),
    )
    .orderBy(desc(invitation.createdAt))
    .limit(1);

  return activeInvite ?? null;
}

async function listInvitesForOrganization(organizationId: string) {
  return db
    .select({
      id: invitation.id,
      email: invitation.email,
      status: invitation.status,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
    })
    .from(invitation)
    .where(eq(invitation.organizationId, organizationId))
    .orderBy(desc(invitation.createdAt));
}

async function markInviteAccepted(email: string): Promise<void> {
  await db
    .update(invitation)
    .set({ status: "accepted" })
    .where(
      and(
        eq(invitation.email, normalizeEmail(email)),
        eq(invitation.status, "pending"),
      ),
    );
}

async function findInviteForOrganization(
  id: string,
  organizationId: string,
): Promise<{ id: string } | null> {
  const [foundInvite] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(eq(invitation.id, id), eq(invitation.organizationId, organizationId)),
    )
    .limit(1);

  return foundInvite ?? null;
}

async function revokeInvite(id: string): Promise<void> {
  await db
    .update(invitation)
    .set({ status: "canceled" })
    .where(eq(invitation.id, id));
}

export const InviteRepository = {
  createInvite,
  findActiveInviteByEmail,
  listInvitesForOrganization,
  markInviteAccepted,
  findInviteForOrganization,
  revokeInvite,
} as const;
