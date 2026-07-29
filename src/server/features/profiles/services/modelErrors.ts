import { AppError } from "@/server/lib/errors";

/**
 * Turns the one model failure a user can actually act on into words.
 *
 * An out-of-credit OpenRouter account returns a 402, which the generic
 * handler renders as "An unexpected error occurred. Please check server
 * logs." -- true, useless, and pointing at the wrong person. The remedy is a
 * link and a top-up, so say that. Everything else is genuinely unexpected and
 * is left alone to reach the logs unchanged.
 *
 * Shared by every model call in this feature rather than duplicated: the 402
 * is a property of the account, not of any one prompt.
 */
export function rethrowModelError(error: unknown): never {
  const status =
    typeof error === "object" && error !== null && "statusCode" in error
      ? (error as { statusCode?: unknown }).statusCode
      : undefined;
  if (status === 402) {
    throw new AppError(
      "PAYMENT_REQUIRED",
      "Your OpenRouter account is out of credits. Add some at https://openrouter.ai/settings/credits, or fill the fields in yourself — nothing else here needs a model.",
    );
  }
  throw error;
}
