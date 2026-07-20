import { and, desc, eq, gt, inArray } from "drizzle-orm";
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

async function findActiveInviteByEmail(
  email: string,
): Promise<{ id: string; status: string } | null> {
  const [activeInvite] = await db
    .select({ id: invitation.id, status: invitation.status })
    .from(invitation)
    .where(
      and(
        eq(invitation.email, normalizeEmail(email)),
        inArray(invitation.status, ["pending", "accepted"]),
        gt(invitation.expiresAt, new Date()),
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
