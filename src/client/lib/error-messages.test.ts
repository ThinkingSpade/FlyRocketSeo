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
});
