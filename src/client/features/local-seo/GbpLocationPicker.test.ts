import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GbpLocationPicker } from "./GbpLocationPicker";

// Mirrors src/client/features/gsc/SitePicker.test.ts's own recipe for
// testing a presentational component's error-state copy without a DOM.
function renderError(
  errorReason: Parameters<typeof GbpLocationPicker>[0]["errorReason"],
) {
  return renderToStaticMarkup(
    createElement(GbpLocationPicker, {
      loading: false,
      errorReason,
      locations: [],
      selectedLocationName: "",
      onSelect: vi.fn(),
      onSave: vi.fn(),
      saving: false,
      onReconnect: vi.fn(),
      onRetry: vi.fn(),
    }),
  );
}

describe("GbpLocationPicker error states (finding A4)", () => {
  it("shows a reconnect prompt for a genuinely expired/revoked connection", () => {
    const markup = renderError("requires_reconnect");
    expect(markup).toContain("Connection expired. Reconnect to continue.");
    expect(markup).toContain("Reconnect Google Business Profile");
  });

  it("does not call a 403 an expired connection -- shows a permissions message instead", () => {
    // The exact failing input from finding A4: a 403 previously rendered the
    // same "Connection expired" copy as an expired/revoked token (401).
    const markup = renderError("access_denied");
    expect(markup).not.toContain("Connection expired");
    expect(markup.toLowerCase()).toContain("doesn&#x27;t have permission");
  });

  it("offers retry for a temporary failure, not a reconnect prompt", () => {
    const markup = renderError("temporary");
    expect(markup).toContain(
      "Couldn&#x27;t load your Business Profile locations",
    );
    expect(markup).not.toContain("Connection expired");
    expect(markup.toLowerCase()).not.toContain("permission");
  });
});
