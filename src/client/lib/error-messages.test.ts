import { describe, expect, it } from "vitest";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

describe("getStandardErrorMessage", () => {
  it("maps known error codes to standard copy", () => {
    expect(getStandardErrorMessage(new Error("PAYMENT_REQUIRED"))).toBe(
      "An active hosted subscription is required before you can use FlyRocketSEO.",
    );
  });

  it("returns custom messages when the error is not a shared code", () => {
    expect(
      getStandardErrorMessage(
        new Error("DataForSEO task missing billing metadata. Response: {...}"),
      ),
    ).toBe("DataForSEO task missing billing metadata. Response: {...}");
  });

  it("does not assert the Cloud Console setup or verification review specifically need finishing for GBP_NOT_CONFIGURED (final wave item 3)", () => {
    // Reached via createSelfHostedGbpAuthorizationUrl's AppError("GBP_NOT_CONFIGURED", ...)
    // when a user clicks Connect without the operator having set the GBP env
    // vars -- toClientError collapses the thrown error down to just the
    // code, so this map's own text is the ONLY thing the user ever sees.
    // isGbpWriteConfigured() can only confirm env vars are present; it has
    // no way to check Google's scope/verification status, so this must not
    // assert those specifically need finishing (the exact over-claim finding
    // A6 was supposed to remove, which this copy still carried).
    const message = getStandardErrorMessage(new Error("GBP_NOT_CONFIGURED"));
    expect(message.toLowerCase()).not.toContain(
      "finish the cloud console setup",
    );
  });

  // Every one of these was thrown with a written, user-actionable message and
  // an INTERNAL_ERROR (or PAYMENT_REQUIRED) code, so every one of them reached
  // the user as "check server logs" -- or, worse, as an invitation to buy a
  // subscription when the real problem was an empty OpenRouter balance. The
  // codes exist so the copy below is what the user actually reads; asserting
  // it here is what stops them being folded back into a generic code later.
  describe("profile drafting failures each say what actually happened", () => {
    const GENERIC =
      "An unexpected error occurred. Please check server logs and try again.";
    const SUBSCRIPTION =
      "An active hosted subscription is required before you can use FlyRocketSEO.";

    it.each([
      ["PROJECT_DOMAIN_MISSING", "domain"],
      ["PROFILE_SITE_UNREADABLE", "block"],
      ["PROFILE_DRAFT_UNREADABLE", "model"],
      ["MODEL_NOT_CONFIGURED", "OPENROUTER_API_KEY"],
      ["MODEL_CREDITS_EXHAUSTED", "credits"],
    ])("%s names its own cause and remedy", (code, expectedTerm) => {
      const message = getStandardErrorMessage(new Error(code));
      expect(message).not.toBe(GENERIC);
      expect(message).not.toBe(SUBSCRIPTION);
      expect(message).toContain(expectedTerm);
    });
  });
});
