import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { gscOauthConfig } from "@/db/schema";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

// The Google OAuth client is a per-deployment thing, so the override is a
// single row. `env` stays the default; this row, when present, wins.
const SINGLETON_ID = "default";

type StoredGscOAuthMeta = {
  clientId: string;
  updatedAt: string;
};

// The client secret is encrypted at rest with BETTER_AUTH_SECRET (same scheme
// as the stored OAuth tokens), so an override is only usable when that secret
// is set. Without it we can neither decrypt an existing override nor safely
// store a new one.
async function getEncryptionKey(): Promise<string | null> {
  const secret = (await getOptionalEnvValue("BETTER_AUTH_SECRET"))?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

/**
 * The deployment's stored OAuth client override (client id + decrypted secret),
 * or null when unset, when BETTER_AUTH_SECRET is missing, or when the stored
 * secret can't be decrypted (e.g. the key was rotated). Callers fall back to
 * env in every null case, so a bad override degrades to the env default rather
 * than breaking Search Console.
 */
export async function getStoredGscOAuthConfig(): Promise<{
  clientId: string;
  clientSecret: string;
} | null> {
  const key = await getEncryptionKey();
  if (!key) return null;

  try {
    const [row] = await db
      .select({
        clientId: gscOauthConfig.clientId,
        clientSecretEncrypted: gscOauthConfig.clientSecretEncrypted,
      })
      .from(gscOauthConfig)
      .where(eq(gscOauthConfig.id, SINGLETON_ID))
      .limit(1);
    if (!row) return null;

    const clientSecret = await symmetricDecrypt({
      key,
      data: row.clientSecretEncrypted,
    });
    const clientId = row.clientId.trim();
    if (!clientId || !clientSecret.trim()) return null;
    return { clientId, clientSecret: clientSecret.trim() };
  } catch {
    // Missing table (pre-migration) or undecryptable secret — behave as unset.
    return null;
  }
}

/** Client id + updated-at for the settings UI. Never returns the secret. */
export async function getStoredGscOAuthMeta(): Promise<StoredGscOAuthMeta | null> {
  try {
    const [row] = await db
      .select({
        clientId: gscOauthConfig.clientId,
        updatedAt: gscOauthConfig.updatedAt,
      })
      .from(gscOauthConfig)
      .where(eq(gscOauthConfig.id, SINGLETON_ID))
      .limit(1);
    return row ? { clientId: row.clientId, updatedAt: row.updatedAt } : null;
  } catch {
    return null;
  }
}

export async function setStoredGscOAuthConfig(input: {
  clientId: string;
  clientSecret: string;
}): Promise<void> {
  const key = await getEncryptionKey();
  if (!key) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Set BETTER_AUTH_SECRET (32+ characters) before saving Search Console credentials — it encrypts them at rest.",
    );
  }

  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  if (!clientId || !clientSecret) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Both the client ID and client secret are required.",
    );
  }

  const clientSecretEncrypted = await symmetricEncrypt({
    key,
    data: clientSecret,
  });
  const now = new Date().toISOString();
  await db
    .insert(gscOauthConfig)
    .values({
      id: SINGLETON_ID,
      clientId,
      clientSecretEncrypted,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: gscOauthConfig.id,
      set: { clientId, clientSecretEncrypted, updatedAt: now },
    });
}

/** Removes the override; Search Console falls back to the env credentials. */
export async function clearStoredGscOAuthConfig(): Promise<void> {
  try {
    await db.delete(gscOauthConfig).where(eq(gscOauthConfig.id, SINGLETON_ID));
  } catch {
    // Nothing to remove (or table absent) — treat as already cleared.
  }
}
