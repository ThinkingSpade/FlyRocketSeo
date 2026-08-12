import { getAuth, hasHostedAuthConfig } from "@/lib/auth";
import { getActiveOrganizationId } from "@/lib/auth-session";
import { getOrJoinSharedHostedOrganization } from "@/server/auth/default-hosted-organization";
import { isDelegatedOrganizationId } from "@/server/auth/delegated-organization-id";
import {
  getHostedAllowedEmails,
  isHostedEmailAllowed,
} from "@/server/auth/hosted-access";
import { AppError } from "@/server/lib/errors";
import type { EnsuredUserContext } from "./types";

async function requireHostedSession(headers: Headers) {
  if (!hasHostedAuthConfig()) {
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      "Missing Better Auth hosted configuration",
    );
  }

  const session = await getAuth().api.getSession({ headers });

  if (!session?.user?.id || !session.user.email) {
    throw new AppError("UNAUTHENTICATED");
  }

  return session;
}

export async function resolveHostedContext(
  headers: Headers,
): Promise<EnsuredUserContext> {
  const session = await requireHostedSession(headers);

  // Private deployment: enforce HOSTED_ALLOWED_EMAILS on EVERY request, not just
  // at signup. This closes the gap where a pre-existing account (e.g. one
  // provisioned during the Cloudflare Access era) or a Google identity linked to
  // an existing email could sign in without passing the signup hook. Fail OPEN
  // only when the list is unset, so a missing secret can't lock the operator out.
  const allowListConfigured = getHostedAllowedEmails().length > 0;
  if (
    allowListConfigured &&
    !(await isHostedEmailAllowed(session.user.email))
  ) {
    throw new AppError("FORBIDDEN", "This deployment is private.");
  }

  const activeOrganizationId = getActiveOrganizationId(session);

  // A delegated organization is per-user scaffolding for Cloudflare Access and
  // local_noauth, which never reach this function -- they resolve through
  // `resolveDelegatedContext`. So on the hosted path an active delegated
  // organization is always wrong, and it is not hypothetical: sessions were
  // written pointing at one while the user's projects lived elsewhere, and the
  // app opened on an empty workspace with no way to switch. Falling through
  // re-resolves and rewrites the session, so an affected user is fixed by their
  // next request rather than by editing the database.
  if (
    activeOrganizationId &&
    !isDelegatedOrganizationId(activeOrganizationId)
  ) {
    return {
      userId: session.user.id,
      userEmail: session.user.email,
      emailVerified: session.user.emailVerified ?? false,
      organizationId: activeOrganizationId,
    };
  }

  const authApi = getAuth().api;
  const organizationId = await getOrJoinSharedHostedOrganization(
    session.user.id,
    (body) => authApi.createOrganization({ body }),
  );

  await authApi.setActiveOrganization({
    headers,
    body: { organizationId },
  });

  return {
    userId: session.user.id,
    userEmail: session.user.email,
    emailVerified: session.user.emailVerified ?? false,
    organizationId,
  };
}
