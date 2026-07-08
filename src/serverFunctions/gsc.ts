import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { waitUntil } from "cloudflare:workers";
import { z } from "zod";
import { GscService } from "@/server/features/gsc/services/GscService";
import { hasSelfHostedGscConfig } from "@/server/features/gsc/oauth-config";
import { createSelfHostedGscAuthorizationUrl } from "@/server/features/gsc/selfHostedOAuth";
import {
  clearStoredGscOAuthConfig,
  getStoredGscOAuthMeta,
  setStoredGscOAuthConfig,
} from "@/server/features/gsc/oauthConfigStore";
import { captureServerEvent } from "@/server/lib/posthog";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import { AppError } from "@/server/lib/errors";
import {
  getOptionalEnvValue,
  isHostedServerAuthMode,
} from "@/server/lib/runtime-env";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });
const setSiteSchema = projectScopedSchema.extend({
  siteUrl: z.string().min(1),
});
const startSelfHostedLinkSchema = z.object({
  callbackURL: z.string().min(1),
});

// Account-level grant check (no project needed) for surfaces like onboarding
// where the user hasn't picked a project yet. The OAuth grant is per-account;
// binding a property to a project happens later in Integrations.
export const getGscGrantStatus = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    return { connected: await GscService.userHasGrant(context.userId) };
  });

export const getGscConnection = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const [connection, currentUserHasGrant, hosted, gscConfigured] =
      await Promise.all([
        GscService.getConnection(context.projectId),
        GscService.userHasGrant(context.userId),
        isHostedServerAuthMode(),
        hasSelfHostedGscConfig(),
      ]);
    return {
      connected: Boolean(connection),
      currentUserHasGrant,
      googleOAuthConfigured: hosted || gscConfigured,
      siteUrl: connection?.siteUrl ?? null,
      connectedByEmail: connection?.connectedAccountEmail ?? null,
      connectedAt: connection?.createdAt ?? null,
    };
  });

export const listGscSites = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const [siteList, connection] = await Promise.all([
      GscService.listSitesForUserWithGrantStatus(context.userId),
      GscService.getConnection(context.projectId),
    ]);
    return {
      requiresReconnect: siteList.requiresReconnect,
      sites: siteList.sites.map((s) => ({
        siteUrl: s.siteUrl,
        permissionLevel: s.permissionLevel,
        selectable: s.permissionLevel !== "siteUnverifiedUser",
        isSelected: s.siteUrl === connection?.siteUrl,
      })),
    };
  });

export const setGscSite = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(setSiteSchema)
  .handler(async ({ data, context }) => {
    const connection = await GscService.setSite({
      projectId: context.projectId,
      organizationId: context.organizationId,
      siteUrl: data.siteUrl,
      userId: context.userId,
      userEmail: context.userEmail,
    });
    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "gsc:property_select",
        organizationId: context.organizationId,
        properties: { project_id: context.projectId, site_url: data.siteUrl },
      }),
    );
    return { connected: true as const, siteUrl: connection.siteUrl };
  });

export const disconnectGsc = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    await GscService.disconnect({
      projectId: context.projectId,
      userId: context.userId,
    });
    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "gsc:disconnect",
        organizationId: context.organizationId,
        properties: { project_id: context.projectId },
      }),
    );
    return { connected: false as const };
  });

export const startSelfHostedGscLink = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(startSelfHostedLinkSchema)
  .handler(async ({ data, context }) => {
    const publicOrigin = getPublicOrigin(getRequest());
    const url = await createSelfHostedGscAuthorizationUrl({
      user: {
        userId: context.userId,
        userEmail: context.userEmail,
      },
      callbackURL: data.callbackURL,
      publicOrigin,
    });

    return { url };
  });

const setGscOAuthConfigSchema = z.object({
  clientId: z.string().trim().min(1).max(512),
  clientSecret: z.string().trim().min(1).max(512),
});

// Deployment-level Google OAuth client override, editable from the app so the
// operator can change credentials without a redeploy. Self-hosted only — in
// hosted mode the operator manages the client via env.
export const getGscOAuthConfigStatus = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async () => {
    if (await isHostedServerAuthMode()) {
      return { supported: false as const };
    }
    const [override, envClientId, envClientSecret, betterAuthSecret] =
      await Promise.all([
        getStoredGscOAuthMeta(),
        getOptionalEnvValue("GOOGLE_CLIENT_ID"),
        getOptionalEnvValue("GOOGLE_CLIENT_SECRET"),
        getOptionalEnvValue("BETTER_AUTH_SECRET"),
      ]);
    const hasEnvCredentials = Boolean(
      envClientId?.trim() && envClientSecret?.trim(),
    );
    return {
      supported: true as const,
      // Client ids aren't secret; the secret is never returned by any of these.
      source: override
        ? ("custom" as const)
        : hasEnvCredentials
          ? ("env" as const)
          : ("none" as const),
      hasEnvCredentials,
      betterAuthSecretConfigured: Boolean(
        betterAuthSecret && betterAuthSecret.trim().length >= 32,
      ),
      override,
    };
  });

export const setGscOAuthConfig = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(setGscOAuthConfigSchema)
  .handler(async ({ data }) => {
    if (await isHostedServerAuthMode()) {
      throw new AppError(
        "FORBIDDEN",
        "Search Console OAuth is managed by the operator in hosted mode.",
      );
    }
    await setStoredGscOAuthConfig(data);
    return { ok: true as const };
  });

export const clearGscOAuthConfig = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async () => {
    if (await isHostedServerAuthMode()) {
      throw new AppError(
        "FORBIDDEN",
        "Search Console OAuth is managed by the operator in hosted mode.",
      );
    }
    await clearStoredGscOAuthConfig();
    return { ok: true as const };
  });
