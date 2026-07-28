import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NotConfiguredCard } from "./GbpNotConfiguredCard";

/**
 * Finding A6: NotConfiguredCard used to assert that all three setup steps
 * (Google's scope, Google's verification review, and both client env vars)
 * remain outstanding, no matter which single piece isGbpWriteConfigured()
 * actually failed on -- and never mentioned BETTER_AUTH_SECRET, even though
 * it's a real independent cause of the flag being false. Rendered directly
 * (mirrors SitePicker.test.ts/GbpLocationPicker.test.ts's own
 * renderToStaticMarkup recipe) rather than through the full
 * GbpConnectionCard, which would otherwise require mocking react-query and
 * useGbpWriteAvailable just to reach this same static markup.
 */
describe("NotConfiguredCard (finding A6)", () => {
  const markup = renderToStaticMarkup(createElement(NotConfiguredCard));

  it("does not assert that the scope/verification step is specifically incomplete", () => {
    // The exact failing input from finding A6: gbpWriteAvailable is false
    // because of ONE missing env var, but the old copy flatly said the
    // operator needs to "add" the scope and "complete" verification --
    // asserting steps this app has no way to check at all.
    expect(markup.toLowerCase()).not.toContain("needs the operator to add");
    expect(markup.toLowerCase()).not.toContain("complete google");
  });

  it("mentions all three actually-detectable requirements, including BETTER_AUTH_SECRET", () => {
    // BETTER_AUTH_SECRET is a real, independent cause of isGbpWriteConfigured()
    // returning false (see oauth-config.ts) that the old copy omitted entirely.
    expect(markup).toContain("GBP_GOOGLE_CLIENT_ID");
    expect(markup).toContain("GBP_GOOGLE_CLIENT_SECRET");
    expect(markup).toContain("BETTER_AUTH_SECRET");
  });

  it("says at least one requirement is unmet without asserting which", () => {
    expect(markup.toLowerCase()).toContain("at least one of these isn");
    expect(markup.toLowerCase()).not.toContain("all three");
  });
});
