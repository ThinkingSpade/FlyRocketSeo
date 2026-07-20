import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { AppError } from "@/server/lib/errors";
import { InviteRepository } from "@/server/auth/repositories/InviteRepository";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import { createHostedInviteForContext } from "@/serverFunctions/invites-handler";

const inviteEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
});
const inviteIdSchema = z.object({ id: z.string().uuid() });

function requireHostedInvites(hosted: boolean) {
  if (!hosted) {
    throw new AppError("FORBIDDEN", "Team invitations are hosted-only.");
  }
}

// The hosted workspace is a single trusted internal team, so every
// authenticated member may create and manage invitations for the shared org.
export const createInvite = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(inviteEmailSchema)
  .handler(async ({ data, context }) => {
    requireHostedInvites(await isHostedServerAuthMode());
    return createHostedInviteForContext(data.email, context);
  });

export const listInvites = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    if (!(await isHostedServerAuthMode())) {
      return [];
    }
    return InviteRepository.listInvitesForOrganization(context.organizationId);
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(inviteIdSchema)
  .handler(async ({ data, context }) => {
    requireHostedInvites(await isHostedServerAuthMode());
    const invite = await InviteRepository.findInviteForOrganization(
      data.id,
      context.organizationId,
    );
    if (!invite) {
      throw new AppError("NOT_FOUND", "Invitation not found.");
    }
    await InviteRepository.revokeInvite(invite.id);
    return { ok: true as const };
  });
