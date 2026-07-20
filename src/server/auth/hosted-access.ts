import { env } from "cloudflare:workers";
import { InviteRepository } from "@/server/auth/repositories/InviteRepository";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getHostedAllowedEmails(): string[] {
  return (env.HOSTED_ALLOWED_EMAILS ?? "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);
}

export async function isHostedEmailAllowed(email: string): Promise<boolean> {
  const normalizedEmail = normalizeEmail(email);

  if (getHostedAllowedEmails().includes(normalizedEmail)) {
    return true;
  }

  try {
    const invite =
      await InviteRepository.findActiveInviteByEmail(normalizedEmail);
    return invite?.status === "pending" || invite?.status === "accepted";
  } catch (error) {
    console.error("Failed to check hosted invitation access:", {
      email: normalizedEmail,
      error,
    });
    return false;
  }
}
