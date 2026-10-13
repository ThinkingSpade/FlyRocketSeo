import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DomainTableTabSurface } from "./DomainTableTabSurface";

function render(overrides = {}) {
  return renderToStaticMarkup(
    createElement(
      DomainTableTabSurface,
      {
        showFilters: false,
        onToggleFilters: () => undefined,
        activeFilterCount: 0,
        countLabel: "keywords",
        totalCount: null,
        fallbackCount: 0,
        exportActions: [
          { label: "Download CSV", icon: null, onClick: () => undefined },
        ],
        isLoading: false,
        showTableLoading: false,
        pagination: createElement("p", null, "Page 1"),
        ...overrides,
      },
      createElement("p", null, "No matching keywords"),
    ),
  );
}

describe("domain result availability", () => {
  it("does not claim zero or offer exports before a paid run is authorized", () => {
    const html = render({ awaitingRun: true });
    expect(html).toContain("Results not loaded");
    expect(html).not.toContain("No matching keywords");
    expect(html).not.toContain("Page 1");
    expect(html).not.toContain(">Export<");
    expect(html).not.toContain("0 keywords");
  });
  it("surfaces errors without disguising them as empty results", () => {
    const html = render({
      error: createElement("p", { role: "alert" }, "Provider unavailable"),
    });
    expect(html).toContain("Provider unavailable");
    expect(html).not.toContain("No matching keywords");
    expect(html).not.toContain("Page 1");
  });
  it("announces loading without exposing a completed empty state", () => {
    const html = render({ isLoading: true, showTableLoading: true });
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("0 keywords");
    expect(html).not.toContain(">Export<");
  });
  it("keeps genuinely loaded zero results honest", () => {
    const html = render({ totalCount: 0 });
    expect(html).toContain("No matching keywords");
    expect(html).toContain("Page 1");
  });
});
