import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KeywordCaptureNotice } from "./KeywordCaptureNotice";
describe("Keyword result provenance notice", () => {
  it("discloses original capture, limited scope and restored status", () => {
    const html = renderToStaticMarkup(
      createElement(KeywordCaptureNotice, {
        observation: {
          source: "DataForSEO Labs",
          projectId: "p1",
          locationCode: 2840,
          languageCode: "en",
          clickstream: false,
          fetchedAt: "2026-01-01T00:00:00.000Z",
        },
        restored: true,
        rowCount: 2,
      }),
    );
    expect(html).toContain("Captured 2026-01-01");
    expect(html).toContain("2840/en");
    expect(html).toContain("limited provider sample");
    expect(html).toContain("Restored without a provider request");
  });
  it("does not relabel a legacy capture as current", () => {
    const html = renderToStaticMarkup(
      createElement(KeywordCaptureNotice, {
        observation: null,
        restored: true,
        rowCount: 1,
      }),
    );
    expect(html).toContain("original capture and provider scope are unknown");
  });
});
