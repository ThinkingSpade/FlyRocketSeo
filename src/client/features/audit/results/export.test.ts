import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Papa from "papaparse";
import type { AuditResultsData } from "./types";
import { exportPages, exportPerformance } from "./export";

vi.mock("@/client/lib/exportToSheets", () => ({
  exportTableToSheets: vi.fn(),
}));

let downloaded: Blob;
beforeEach(() => {
  vi.stubGlobal("document", {
    createElement: () => ({ click() {}, href: "", download: "" }),
  });
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    if (!(blob instanceof Blob)) throw new Error("Expected CSV Blob");
    downloaded = blob;
    return "blob:isolated-export";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

const audit: AuditResultsData["audit"] = {
  id: "crawl-original",
  startUrl: "https://docs.example.com/",
  status: "completed",
  pagesCrawled: 1,
  pagesTotal: 12,
  startedAt: "2026-09-10T02:00:00Z",
  completedAt: "2026-09-10T02:04:00Z",
  config: { maxPages: 10, lighthouseStrategy: "auto" },
  domainExpirationJson: null,
};
const pages: AuditResultsData["pages"] = [
  {
    id: "page-1",
    auditId: "crawl-original",
    url: "https://docs.example.com/start",
    statusCode: 200,
    redirectUrl: null,
    title: "=original title",
    metaDescription: null,
    canonicalUrl: null,
    robotsMeta: null,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    h1Count: 1,
    h2Count: 0,
    h3Count: 0,
    h4Count: 0,
    h5Count: 0,
    h6Count: 0,
    headingOrderJson: null,
    wordCount: 456,
    imagesTotal: 2,
    imagesMissingAlt: 0,
    imagesJson: null,
    internalLinkCount: 2,
    externalLinkCount: 0,
    hasStructuredData: false,
    hreflangTagsJson: null,
    isIndexable: true,
    responseTimeMs: 123,
  },
];

it("downloads crawl CSV with stored run boundaries and scope, preserving formula protection", async () => {
  exportPages(pages, "csv", audit);
  const parsed = Papa.parse<Record<string, string>>(await downloaded.text(), {
    header: true,
  });
  expect(parsed.data[0]).toMatchObject({
    Title: "'=original title",
    Source: "FlyRocketSEO crawl",
    "Audit ID": "crawl-original",
    "Start URL": "https://docs.example.com/",
    "Capture Started At": "2026-09-10T02:00:00Z",
    "Capture Completed At": "2026-09-10T02:04:00Z",
    "Max Pages": "10",
    "Pages Crawled": "1",
    "Pages Discovered": "12",
    "Run Status": "completed",
  });
});

it("downloads Lighthouse CSV with original crawl scope and unrounded measurements", async () => {
  exportPerformance(
    [
      {
        id: "lh-1",
        auditId: "crawl-original",
        pageId: "page-1",
        strategy: "mobile",
        performanceScore: 80,
        accessibilityScore: 90,
        bestPracticesScore: 90,
        seoScore: 100,
        lcpMs: 1234.56789,
        cls: 0.001234567,
        inpMs: null,
        ttfbMs: 12.34567,
        errorMessage: null,
        r2Key: null,
        payloadSizeBytes: null,
      },
    ],
    pages,
    "csv",
    audit,
  );
  const parsed = Papa.parse<Record<string, string>>(await downloaded.text(), {
    header: true,
  });
  expect(parsed.data[0]).toMatchObject({
    Source: "Lighthouse",
    "Audit ID": "crawl-original",
    "LCP (ms)": "1234.56789",
    CLS: "0.001234567",
    "INP (ms)": "",
  });
});

it("marks unavailable historical completion/config as unknown instead of current time", async () => {
  exportPages(pages, "csv", { ...audit, completedAt: null, config: null });
  const parsed = Papa.parse<Record<string, string>>(await downloaded.text(), {
    header: true,
  });
  expect(parsed.data[0]).toMatchObject({
    "Capture Completed At": "unknown",
    "Max Pages": "unknown",
  });
});
