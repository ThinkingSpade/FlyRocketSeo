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
  it("shows a reconnect prompt without asserting the connection is specifically expired (final wave item 1)", () => {
    // requires_reconnect covers BOTH a genuine 401 AND an unclassifiable
    // getAccessToken() exception (see gbpClient.ts's getToken) -- this copy
    // can't tell which, so it must not claim "expired" as an established
    // fact. "Reconnect" stays the same remedy either way.
    const markup = renderError("requires_reconnect");
    expect(markup.toLowerCase()).not.toContain("expired");
    expect(markup).toContain("Reconnect Google Business Profile");
  });

  it("does not call a 403 an expired connection -- shows a permissions message instead", () => {
    // The exact failing input from finding A4: a 403 previously rendered the
    // same "Connection expired" copy as an expired/revoked token (401).
    const markup = renderError("access_denied");
    expect(markup).not.toContain("Connection expired");
    expect(markup.toLowerCase()).toContain("doesn&#x27;t have permission");
  });

  it("does not say 'this location' for a 403 -- no location is known yet at this point in the flow (final wave item 1)", () => {
    // GbpLocationPicker only ever renders BEFORE a location is chosen
    // (accounts.list or locations.list failing), so "this Business Profile
    // location" presupposes something that doesn't exist yet -- exactly the
    // bug: a 403 from accounts.list, before any location is even known,
    // said "doesn't have permission to manage THIS location".
    const markup = renderError("access_denied");
    expect(markup.toLowerCase()).not.toContain(
      "this business profile location",
    );
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
