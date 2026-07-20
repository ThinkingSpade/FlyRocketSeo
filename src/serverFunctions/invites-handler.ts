import { getHostedBaseUrl } from "@/lib/auth";
import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { InviteRepository } from "@/server/auth/repositories/InviteRepository";
import {
  hasHostedInviteEmailConfig,
  sendHostedInviteEmail,
} from "@/server/email/loops";

const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

type InviteContext = {
  userId: string;
  userEmail: string;
  organizationId: string;
};

type CreateInviteDependencies = {
  now: () => Date;
  createInvite: typeof InviteRepository.createInvite;
  getHostedBaseUrl: typeof getHostedBaseUrl;
  getHostedUser: typeof AuthRepository.getHostedUser;
  hasHostedInviteEmailConfig: typeof hasHostedInviteEmailConfig;
  sendHostedInviteEmail: typeof sendHostedInviteEmail;
};

const defaultDependencies: CreateInviteDependencies = {
  now: () => new Date(),
  createInvite: InviteRepository.createInvite,
  getHostedBaseUrl,
  getHostedUser: AuthRepository.getHostedUser,
  hasHostedInviteEmailConfig,
  sendHostedInviteEmail,
};

export async function createHostedInviteForContext(
  email: string,
  context: InviteContext,
  dependencies: CreateInviteDependencies = defaultDependencies,
) {
  const normalizedEmail = email.trim().toLowerCase();
  const now = dependencies.now();
  const id = await dependencies.createInvite({
    email: normalizedEmail,
    organizationId: context.organizationId,
    inviterId: context.userId,
    expiresAt: new Date(now.getTime() + INVITE_LIFETIME_MS),
  });
  const baseUrl = dependencies.getHostedBaseUrl().replace(/\/$/, "");
  const inviteUrl = `${baseUrl}/sign-up?invite=${id}&email=${encodeURIComponent(normalizedEmail)}`;
  let emailSent = false;

  if (dependencies.hasHostedInviteEmailConfig()) {
    try {
      const inviter = await dependencies.getHostedUser(context.userId);
      await dependencies.sendHostedInviteEmail({
        email: normalizedEmail,
        inviteUrl,
        invitedByName:
          inviter?.name?.trim() || inviter?.email || context.userEmail,
      });
      emailSent = true;
    } catch (error) {
      console.error("Failed to send hosted invitation email:", {
        email: normalizedEmail,
        inviterId: context.userId,
        error,
      });
    }
  }

  return { inviteUrl, emailSent };
}
