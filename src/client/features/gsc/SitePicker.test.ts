import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SitePicker } from "./SitePicker";

function renderError(
  errorReason: Parameters<typeof SitePicker>[0]["errorReason"],
) {
  return renderToStaticMarkup(
    createElement(SitePicker, {
      loading: false,
      errorReason,
      sites: [],
      selectedSiteUrl: "",
      onSelect: vi.fn(),
      onSave: vi.fn(),
      saving: false,
      onReconnect: vi.fn(),
      onRetry: vi.fn(),
    }),
  );
}

describe("SitePicker error states", () => {
  it("shows reconnect only for an expired connection", () => {
    const markup = renderError("requires_reconnect");

    expect(markup).toContain("Connection expired. Reconnect to continue.");
    expect(markup).toContain("Reconnect with Google");
    expect(markup).not.toContain(">Retry<");
  });

  it("tells the user to enable the API for a configuration 403", () => {
    const markup = renderError("api_not_configured");

    expect(markup).toContain("Search Console API isn");
    expect(markup).toContain(
      "https://console.cloud.google.com/apis/library/searchconsole.googleapis.com",
    );
    expect(markup).toContain("then reconnect");
    expect(markup).not.toContain("Connection expired");
  });

  it("offers retry for a temporary failure", () => {
    const markup = renderError("temporary");

    expect(markup).toContain("Couldn&#x27;t load your Search Console sites");
    expect(markup).toContain(">Retry<");
    expect(markup).not.toContain("Connection expired");
  });
});
