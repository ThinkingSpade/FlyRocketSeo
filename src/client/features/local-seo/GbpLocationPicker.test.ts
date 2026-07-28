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
      incomplete: false,
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

function renderPicker(
  overrides: Partial<Parameters<typeof GbpLocationPicker>[0]> = {},
) {
  return renderToStaticMarkup(
    createElement(GbpLocationPicker, {
      loading: false,
      errorReason: null,
      incomplete: false,
      locations: [],
      selectedLocationName: "",
      onSelect: vi.fn(),
      onSave: vi.fn(),
      saving: false,
      onReconnect: vi.fn(),
      onRetry: vi.fn(),
      ...overrides,
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

/**
 * Final wave item 2 (the A5 residual): the page cap can be hit with a token
 * still outstanding, so an empty `locations` array is sometimes a genuine
 * partial, not proof this Google account has none. `incomplete` carries
 * that fact from gbpClient's pagination all the way to this component.
 */
describe("GbpLocationPicker pagination incompleteness (final wave item 2)", () => {
  it("does not claim none were found when the list is empty because enumeration was cut short", () => {
    const markup = renderPicker({ locations: [], incomplete: true });
    expect(markup).not.toContain(
      "No Google Business Profile locations were found",
    );
  });

  it("still says none were found when the list is genuinely empty and complete", () => {
    const markup = renderPicker({ locations: [], incomplete: false });
    expect(markup).toContain("No Google Business Profile locations were found");
  });

  it("notes the list may be incomplete even when some locations were found", () => {
    const markup = renderPicker({
      locations: [
        {
          name: "locations/1",
          title: "Store",
          accountName: "accounts/1",
          accountDisplayName: "Biz",
          isSelected: false,
        },
      ],
      incomplete: true,
    });
    expect(markup.toLowerCase()).toContain("incomplete");
  });
});
