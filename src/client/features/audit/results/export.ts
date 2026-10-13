import type { AuditResultsData } from "@/client/features/audit/results/types";
import { buildCsv, type CsvValue, downloadCsv } from "@/client/lib/csv";
import { downloadFile } from "@/client/lib/download";
import { exportTableToSheets } from "@/client/lib/exportToSheets";

const PAGES_HEADERS = [
  "URL",
  "Status",
  "Title",
  "H1",
  "Words",
  "Images",
  "Missing Alt",
  "Response Time (ms)",
];

const RUN_HEADERS = [
  "Source",
  "Audit ID",
  "Start URL",
  "Capture Started At",
  "Capture Completed At",
  "Run Status",
  "Max Pages",
  "Lighthouse Strategy",
  "Pages Crawled",
  "Pages Discovered",
];

function runMetadata(
  source: string,
  audit?: AuditResultsData["audit"],
): CsvValue[] {
  return [
    source,
    audit?.id ?? "unknown",
    audit?.startUrl ?? "unknown",
    audit?.startedAt ?? "unknown",
    audit?.completedAt ?? "unknown",
    audit?.status ?? "unknown",
    audit?.config?.maxPages ?? "unknown",
    audit?.config?.lighthouseStrategy ?? "unknown",
    audit?.pagesCrawled ?? "unknown",
    audit?.pagesTotal ?? "unknown",
  ];
}

function runJsonMetadata(source: string, audit?: AuditResultsData["audit"]) {
  return {
    source,
    auditId: audit?.id ?? null,
    startUrl: audit?.startUrl ?? null,
    captureStartedAt: audit?.startedAt ?? null,
    captureCompletedAt: audit?.completedAt ?? null,
    runStatus: audit?.status ?? null,
    config: audit?.config ?? null,
    pagesCrawled: audit?.pagesCrawled ?? null,
    pagesDiscovered: audit?.pagesTotal ?? null,
  };
}

function pagesRows(pages: AuditResultsData["pages"]): CsvValue[][] {
  return pages.map((page) => [
    page.url,
    page.statusCode,
    page.title ?? "",
    page.h1Count,
    page.wordCount,
    page.imagesTotal,
    page.imagesMissingAlt,
    page.responseTimeMs,
  ]);
}

const PERFORMANCE_HEADERS = [
  "URL",
  "Device",
  "Performance",
  "Accessibility",
  "SEO",
  "LCP (ms)",
  "CLS",
  "INP (ms)",
  "TTFB (ms)",
];

function performanceRows(
  lighthouse: AuditResultsData["lighthouse"],
  pages: AuditResultsData["pages"],
): CsvValue[][] {
  return lighthouse.map((result) => {
    const page = pages.find((candidate) => candidate.id === result.pageId);
    return [
      page?.url ?? "",
      result.strategy,
      result.performanceScore,
      result.accessibilityScore,
      result.seoScore,
      result.lcpMs,
      result.cls,
      result.inpMs,
      result.ttfbMs,
    ];
  });
}

export function exportPages(
  pages: AuditResultsData["pages"],
  format: "csv" | "json" | "sheets",
  audit?: AuditResultsData["audit"],
) {
  if (format === "json") {
    const rows = pages.map((page) => ({
      url: page.url,
      statusCode: page.statusCode,
      title: page.title ?? "",
      h1Count: page.h1Count,
      wordCount: page.wordCount,
      imagesTotal: page.imagesTotal,
      imagesMissingAlt: page.imagesMissingAlt,
      responseTimeMs: page.responseTimeMs,
      ...runJsonMetadata("FlyRocketSEO crawl", audit),
    }));
    downloadFile(
      JSON.stringify(rows, null, 2),
      "audit-pages.json",
      "application/json",
    );
    return;
  }

  const headers = [...PAGES_HEADERS, ...RUN_HEADERS];
  const rows = pagesRows(pages).map((row) => [
    ...row,
    ...runMetadata("FlyRocketSEO crawl", audit),
  ]);
  if (format === "sheets") {
    void exportTableToSheets({
      headers,
      rows,
      feature: "audit_pages",
      preservePrecision: true,
    });
    return;
  }

  downloadCsv(
    "audit-pages.csv",
    buildCsv(headers, rows, { preservePrecision: true }),
  );
}

export function exportPerformance(
  lighthouse: AuditResultsData["lighthouse"],
  pages: AuditResultsData["pages"],
  format: "csv" | "json" | "sheets",
  audit?: AuditResultsData["audit"],
) {
  if (format === "json") {
    const rows = lighthouse.map((result) => {
      const page = pages.find((candidate) => candidate.id === result.pageId);
      return {
        url: page?.url ?? "",
        strategy: result.strategy,
        performance: result.performanceScore,
        accessibility: result.accessibilityScore,
        seo: result.seoScore,
        lcpMs: result.lcpMs,
        cls: result.cls,
        inpMs: result.inpMs,
        ttfbMs: result.ttfbMs,
        ...runJsonMetadata("Lighthouse", audit),
      };
    });
    downloadFile(
      JSON.stringify(rows, null, 2),
      "audit-performance.json",
      "application/json",
    );
    return;
  }

  const headers = [...PERFORMANCE_HEADERS, ...RUN_HEADERS];
  const rows = performanceRows(lighthouse, pages).map((row) => [
    ...row,
    ...runMetadata("Lighthouse", audit),
  ]);

  if (format === "sheets") {
    void exportTableToSheets({
      headers,
      rows,
      feature: "audit_performance",
      preservePrecision: true,
    });
    return;
  }

  downloadCsv(
    "audit-performance.csv",
    buildCsv(headers, rows, { preservePrecision: true }),
  );
}
