import type { EvidenceSnapshot } from "@/shared/opportunities";

export function evidence(
  overrides: Partial<EvidenceSnapshot> = {},
): EvidenceSnapshot {
  return {
    schemaVersion: 1,
    source: "Google Search Console",
    fetchedAt: "2026-10-13T12:00:00Z",
    scope: {
      organizationId: "org-a",
      projectId: "project-a",
      target: "example.com",
      siteUrl: "sc-domain:example.com",
      connectedBy: "user-a",
      country: null,
      device: null,
      searchType: "web",
    },
    url: "https://example.com/article",
    window: { startDate: "2026-09-13", endDate: "2026-10-10" },
    previousWindow: { startDate: "2026-08-16", endDate: "2026-09-12" },
    current: { clicks: 50, impressions: 1000, position: 8 },
    previous: { clicks: 100, impressions: 1200, position: 7 },
    coverage: {
      finalData: true,
      currentRows: 28,
      previousRows: 28,
      truncated: false,
      complete: true,
    },
    limitations: [],
    ...overrides,
  };
}
