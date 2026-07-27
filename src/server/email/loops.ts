import { env } from "cloudflare:workers";
import {
  getContactNameParts,
  updateLoopsContact,
} from "@/server/email/loops-client";

const LOOPS_TRANSACTIONAL_URL = "https://app.loops.so/api/v1/transactional";
const MAX_PROVIDER_ERROR_LENGTH = 1_000;

class LoopsConfigError extends Error {
  constructor(readonly variableName: string) {
    super(`${variableName} is required in hosted mode`);
    this.name = "LoopsConfigError";
  }
}

class LoopsTransactionalEmailError extends Error {
  constructor(
    readonly transactionalId: string,
    readonly providerStatus: number | null,
    providerMessage: string,
  ) {
    const status = providerStatus === null ? "network error" : providerStatus;
    super(
      `LOOPS_SEND_FAILED: Loops transactional email failed (${status}). Provider response: ${providerMessage}`,
    );
    this.name = "LoopsTransactionalEmailError";
  }
}

function getOptionalEnv(name: string) {
  const value: unknown = Reflect.get(env, name);
  const trimmed = typeof value === "string" ? value.trim() : "";

  return trimmed || null;
}

function getRequiredEnv(name: string) {
  const value = getOptionalEnv(name);

  if (!value) {
    console.error("LOOPS_CONFIG_MISSING", { variableName: name });
    throw new LoopsConfigError(name);
  }

  return value;
}

function getHostedVerificationEmailConfig() {
  return {
    apiKey: getRequiredEnv("LOOPS_API_KEY"),
    transactionalId: getRequiredEnv("LOOPS_TRANSACTIONAL_VERIFY_EMAIL_ID"),
  };
}

function getHostedPasswordResetEmailConfig() {
  return {
    apiKey: getRequiredEnv("LOOPS_API_KEY"),
    transactionalId: getRequiredEnv("LOOPS_TRANSACTIONAL_RESET_PASSWORD_ID"),
  };
}

export function hasHostedInviteEmailConfig() {
  return Boolean(
    getOptionalEnv("LOOPS_API_KEY") &&
    getOptionalEnv("LOOPS_TRANSACTIONAL_INVITE_ID"),
  );
}

async function sendLoopsTransactionalEmail({
  apiKey,
  email,
  transactionalId,
  dataVariables,
}: {
  apiKey: string;
  email: string;
  transactionalId: string;
  dataVariables: Record<string, string>;
}) {
  let response: Response;

  try {
    response = await fetch(LOOPS_TRANSACTIONAL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        transactionalId,
        email,
        addToAudience: false,
        dataVariables,
      }),
    });
  } catch (error) {
    const providerMessage = getErrorMessage(error);
    console.error("LOOPS_SEND_FAILED", {
      status: null,
      email,
      transactionalId,
      providerMessage,
      dataVariablesPresent: getDataVariablePresence(dataVariables),
    });
    throw new LoopsTransactionalEmailError(
      transactionalId,
      null,
      providerMessage,
    );
  }

  if (response.ok) {
    console.info("LOOPS_SEND_OK", { transactionalId, email });
    return;
  }

  const errorPayload = await getProviderErrorPayload(response, dataVariables);
  console.error("LOOPS_SEND_FAILED", {
    status: response.status,
    email,
    transactionalId,
    errorPayload,
    dataVariablesPresent: getDataVariablePresence(dataVariables),
  });

  throw new LoopsTransactionalEmailError(
    transactionalId,
    response.status,
    errorPayload,
  );
}

function getDataVariablePresence(dataVariables: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(dataVariables).map(([name, value]) => [
      name,
      value.length > 0,
    ]),
  );
}

async function getProviderErrorPayload(
  response: Response,
  dataVariables: Record<string, string>,
) {
  const responseText = await response.text().catch(() => "");
  let sanitizedPayload =
    responseText.trim() || response.statusText || "No provider error payload";

  for (const [name, value] of Object.entries(dataVariables)) {
    if (value && name.toLowerCase().includes("url")) {
      sanitizedPayload = sanitizedPayload.replaceAll(
        value,
        `[redacted ${name}; present=true]`,
      );
    }
  }

  return truncate(sanitizedPayload, MAX_PROVIDER_ERROR_LENGTH);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}…`;
}

export function getHostedEmailErrorContext(error: unknown) {
  if (error instanceof LoopsTransactionalEmailError) {
    return {
      transactionalId: error.transactionalId,
      providerStatus: error.providerStatus,
      configVariable: null,
      errorMessage: error.message,
    };
  }

  if (error instanceof LoopsConfigError) {
    return {
      transactionalId: null,
      providerStatus: null,
      configVariable: error.variableName,
      errorMessage: error.message,
    };
  }

  return {
    transactionalId: null,
    providerStatus: null,
    configVariable: null,
    errorMessage: getErrorMessage(error),
  };
}

export async function upsertHostedSignupContact({
  userId,
  email,
  name,
}: {
  userId: string;
  email: string;
  name?: string | null;
}) {
  const apiKey = getOptionalEnv("LOOPS_API_KEY");

  if (!apiKey) {
    console.warn(
      "Skipping Loops signup contact sync: LOOPS_API_KEY is not set",
    );
    return;
  }

  await updateLoopsContact({
    apiKey,
    payload: {
      email,
      userId,
      source: "flyrocketseo-signup",
      userGroup: "app-user",
      ...getContactNameParts(name),
    },
    logContext: { action: "signup-contact-sync" },
  });
}

export async function sendHostedVerificationEmail({
  email,
  confirmationUrl,
}: {
  email: string;
  confirmationUrl: string;
}) {
  const config = getHostedVerificationEmailConfig();
  await sendLoopsTransactionalEmail({
    apiKey: config.apiKey,
    email,
    transactionalId: config.transactionalId,
    dataVariables: {
      appName: "FlyRocketSEO",
      confirmationUrl,
    },
  });
}

export async function sendHostedPasswordResetEmail({
  email,
  resetUrl,
}: {
  email: string;
  resetUrl: string;
}) {
  const config = getHostedPasswordResetEmailConfig();
  await sendLoopsTransactionalEmail({
    apiKey: config.apiKey,
    email,
    transactionalId: config.transactionalId,
    dataVariables: {
      appName: "FlyRocketSEO",
      resetUrl,
    },
  });
}

export async function sendHostedInviteEmail({
  email,
  inviteUrl,
  invitedByName,
}: {
  email: string;
  inviteUrl: string;
  invitedByName: string;
}): Promise<void> {
  const apiKey = getOptionalEnv("LOOPS_API_KEY");
  const transactionalId = getOptionalEnv("LOOPS_TRANSACTIONAL_INVITE_ID");

  // Invite links are always returned to the caller, so email delivery remains
  // dormant until both provider values are explicitly configured.
  if (!apiKey || !transactionalId) {
    return;
  }

  await sendLoopsTransactionalEmail({
    apiKey,
    email: email.trim().toLowerCase(),
    transactionalId,
    dataVariables: {
      appName: "FlyRocketSEO",
      inviteUrl,
      invitedByName,
    },
  });
}
