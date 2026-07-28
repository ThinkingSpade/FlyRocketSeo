import { symmetricEncrypt } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { decodeJwt } from "jose";
import { z } from "zod";
import { db } from "@/db";
import { account } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { AppError } from "@/server/lib/errors";
import { GBP_OAUTH_PROVIDER_ID, GBP_OAUTH_SCOPES } from "@/shared/gbp";
import { getGbpOAuthClientConfig, isGbpWriteConfigured } from "./oauth-config";

/**
 * The Google Business Profile write OAuth dance. Structurally this is
 * selfHostedOAuth.ts (Search Console) copied and re-pointed at GBP's own
 * scope/provider/client -- NOT a refactor of that file into something shared.
 * Duplication is the safer choice here: this feature requests a Google
 * RESTRICTED scope, and touching selfHostedOAuth.ts (or its exports) to share
 * code would risk regressing an already-working GSC connection just to save
 * ~150 lines. Every stored value (state HMAC key, redirect path, grant
 * providerId) is independently namespaced from the GSC flow so nothing here
 * can read, forge, or invalidate a Search Console state or token.
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

type SelfHostedGbpUser = {
  userId: string;
  userEmail: string;
};

const oauthStateSchema = z.object({
  userId: z.string().min(1),
  callbackPath: z.string().min(1),
  exp: z.number().int(),
});

const googleTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  id_token: z.string().optional(),
  token_type: z.string().optional(),
});

const googleIdTokenSchema = z.object({
  sub: z.string().min(1),
});

type GoogleTokenResponse = z.infer<typeof googleTokenResponseSchema>;

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlToBytes(value: string) {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const binary = atob(padded.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

// "flyrocketseo:gbp:" -- distinct from selfHostedOAuth.ts's "flyrocketseo:gsc:"
// prefix, even though both may derive from the same clientSecret if an
// operator reuses one Google Cloud project for both. Without the distinct
// prefix a GBP state token and a GSC state token signed under the same secret
// would verify against each other, letting a GBP callback be replayed as a
// (still-invalid, but confusable) GSC one or vice versa.
async function getStateKey(clientSecret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`flyrocketseo:gbp:${clientSecret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signState(payload: string, clientSecret: string) {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await getStateKey(clientSecret),
    new TextEncoder().encode(payload),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

function getSafeCallbackPath(callbackURL: string, publicOrigin: string) {
  try {
    const url = new URL(callbackURL, publicOrigin);
    if (url.origin !== publicOrigin) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

async function createState(input: {
  clientSecret: string;
  userId: string;
  callbackURL: string;
  publicOrigin: string;
}) {
  const payload = bytesToBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        userId: input.userId,
        callbackPath: getSafeCallbackPath(
          input.callbackURL,
          input.publicOrigin,
        ),
        exp: Date.now() + 10 * 60 * 1_000,
      }),
    ),
  );
  const signature = await signState(payload, input.clientSecret);
  return `${payload}.${signature}`;
}

async function verifyState(state: string, clientSecret: string) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) {
    throw new AppError("VALIDATION_ERROR", "Invalid Business Profile state");
  }

  const ok = await crypto.subtle.verify(
    "HMAC",
    await getStateKey(clientSecret),
    base64UrlToBytes(signature),
    new TextEncoder().encode(payload),
  );
  if (!ok) {
    throw new AppError("VALIDATION_ERROR", "Invalid Business Profile state");
  }

  const parsed = oauthStateSchema.parse(
    JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))),
  );
  if (parsed.exp < Date.now()) {
    throw new AppError("VALIDATION_ERROR", "Expired Business Profile state");
  }

  return parsed;
}

function getRedirectUri(publicOrigin: string) {
  return `${publicOrigin}/api/gbp/oauth/callback`;
}

function accessTokenExpiresAt(tokens: GoogleTokenResponse) {
  return new Date(Date.now() + (tokens.expires_in ?? 3600) * 1_000);
}

function storedScope(tokens: GoogleTokenResponse) {
  return tokens.scope
    ? tokens.scope.trim().split(/\s+/).join(",")
    : GBP_OAUTH_SCOPES.join(",");
}

function getGoogleAccountId(tokens: GoogleTokenResponse) {
  if (!tokens.id_token) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Google did not return an ID token for Business Profile.",
    );
  }

  return googleIdTokenSchema.parse(decodeJwt(tokens.id_token)).sub;
}

async function upsertGrant(input: {
  user: SelfHostedGbpUser;
  tokens: GoogleTokenResponse;
}) {
  // Encrypt tokens at rest exactly the way Better Auth's setTokenUtil does
  // (same key from BETTER_AUTH_SECRET, same crypto, same encryptOAuthTokens
  // gate), so getAccessToken decrypts them on read -- identical reasoning to
  // selfHostedOAuth.ts's own upsertGrant.
  const ctx = await getAuth().$context;
  const encrypt = (value: string) =>
    ctx.options.account?.encryptOAuthTokens
      ? symmetricEncrypt({ key: ctx.secretConfig, data: value })
      : value;

  const existing = await db
    .select({ id: account.id, refreshToken: account.refreshToken })
    .from(account)
    .where(
      and(
        eq(account.userId, input.user.userId),
        eq(account.providerId, GBP_OAUTH_PROVIDER_ID),
      ),
    )
    .limit(1);

  const accountValues = {
    accountId: getGoogleAccountId(input.tokens),
    providerId: GBP_OAUTH_PROVIDER_ID,
    userId: input.user.userId,
    accessToken: await encrypt(input.tokens.access_token),
    // A fresh refresh token is encrypted here; an absent one falls back to the
    // already-encrypted value stored on the existing grant.
    refreshToken: input.tokens.refresh_token
      ? await encrypt(input.tokens.refresh_token)
      : (existing[0]?.refreshToken ?? null),
    idToken: input.tokens.id_token
      ? await encrypt(input.tokens.id_token)
      : null,
    accessTokenExpiresAt: accessTokenExpiresAt(input.tokens),
    refreshTokenExpiresAt: null,
    scope: storedScope(input.tokens),
    password: null,
  };

  if (existing[0]) {
    await db
      .update(account)
      .set({ ...accountValues, updatedAt: new Date() })
      .where(eq(account.id, existing[0].id));
    return;
  }

  await db.insert(account).values({
    id: crypto.randomUUID(),
    ...accountValues,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function exchangeCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Google rejected the Business Profile authorization code.",
    );
  }

  return googleTokenResponseSchema.parse(await response.json());
}

export async function createSelfHostedGbpAuthorizationUrl(input: {
  user: SelfHostedGbpUser;
  callbackURL: string;
  publicOrigin: string;
}) {
  const config = await getGbpOAuthClientConfig();
  if (!config || !(await isGbpWriteConfigured())) {
    // GBP_NOT_CONFIGURED, not AUTH_CONFIG_MISSING -- the latter's standard
    // message talks about Cloudflare Access, which would be actively
    // misleading here (see src/client/lib/error-messages.ts).
    throw new AppError(
      "GBP_NOT_CONFIGURED",
      "Business Profile writing is not configured. Set GBP_GOOGLE_CLIENT_ID, GBP_GOOGLE_CLIENT_SECRET, and BETTER_AUTH_SECRET.",
    );
  }

  const redirectUri = getRedirectUri(input.publicOrigin);
  const state = await createState({
    clientSecret: config.clientSecret,
    userId: input.user.userId,
    callbackURL: input.callbackURL,
    publicOrigin: input.publicOrigin,
  });
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GBP_OAUTH_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);

  return url.toString();
}

export async function handleSelfHostedGbpOAuthCallback(input: {
  request: Request;
  user: SelfHostedGbpUser;
  publicOrigin: string;
}) {
  const config = await getGbpOAuthClientConfig();
  if (!config) {
    return new Response("Missing Google Business Profile OAuth configuration", {
      status: 500,
    });
  }

  const url = new URL(input.request.url);
  const stateParam = url.searchParams.get("state");
  if (!stateParam) {
    return new Response("Missing Business Profile OAuth state", {
      status: 400,
    });
  }

  const state = await verifyState(stateParam, config.clientSecret);
  if (state.userId !== input.user.userId) {
    return new Response("Business Profile OAuth user mismatch", {
      status: 403,
    });
  }

  // state.callbackPath is a validated same-origin relative path
  // (getSafeCallbackPath). Redirect with a *relative* Location so the browser
  // resolves it against the real request origin -- this avoids trusting
  // x-forwarded-host for the final hop.
  const redirectToCallback = () =>
    new Response(null, {
      status: 303,
      headers: { Location: state.callbackPath },
    });

  if (url.searchParams.get("error")) {
    return redirectToCallback();
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return new Response("Missing Business Profile OAuth code", {
      status: 400,
    });
  }

  const tokens = await exchangeCode({
    code,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: getRedirectUri(input.publicOrigin),
  });
  await upsertGrant({ user: input.user, tokens });

  return redirectToCallback();
}
