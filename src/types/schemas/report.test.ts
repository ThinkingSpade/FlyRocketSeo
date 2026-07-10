import { describe, expect, it } from "vitest";
import {
  createReportShareSchema,
  reportShareSnapshotSchema,
  updateReportBrandingSchema,
} from "./report";

const TINY_PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const minimalSnapshot = {
  projectTitle: "acme-demo.com",
  rangeLabel: "Last 30 days",
  generatedAt: "Jul 10, 2026",
  rankBlocks: [],
  events: [],
  audit: null,
  gsc: null,
  branding: null,
};

describe("updateReportBrandingSchema", () => {
  it("accepts a raster data-URI logo and trims text fields", () => {
    const parsed = updateReportBrandingSchema.parse({
      projectId: "p1",
      brandName: "  Northwind SEO  ",
      preparedBy: "",
      logoDataUri: TINY_PNG_DATA_URI,
    });
    expect(parsed.brandName).toBe("Northwind SEO");
    expect(parsed.preparedBy).toBeUndefined();
    expect(parsed.logoDataUri).toBe(TINY_PNG_DATA_URI);
  });

  it("rejects SVG and non-data-URI logos", () => {
    for (const logoDataUri of [
      "data:image/svg+xml;base64,PHN2Zy8+", // scriptable format
      "https://example.com/logo.png", // external host
      "data:image/png;base64,not*base64*",
    ]) {
      expect(
        updateReportBrandingSchema.safeParse({ projectId: "p1", logoDataUri })
          .success,
        logoDataUri,
      ).toBe(false);
    }
  });
});

describe("reportShareSnapshotSchema", () => {
  it("accepts a minimal snapshot and strips unknown keys", () => {
    const parsed = reportShareSnapshotSchema.parse({
      ...minimalSnapshot,
      events: [
        {
          id: "e1",
          eventDate: "2026-06-15",
          title: "Published posts",
          note: null,
          projectId: "leak-me", // extra keys must not survive into storage
        },
      ],
    });
    expect(parsed.events[0]).toEqual({
      id: "e1",
      eventDate: "2026-06-15",
      title: "Published posts",
      note: null,
    });
  });

  it("bounds list sizes so a snapshot cannot balloon", () => {
    const oversized = {
      ...minimalSnapshot,
      events: Array.from({ length: 101 }, (_, i) => ({
        id: `e${i}`,
        eventDate: "2026-06-15",
        title: "x",
        note: null,
      })),
    };
    expect(reportShareSnapshotSchema.safeParse(oversized).success).toBe(false);
  });

  it("rejects non-finite numbers smuggled into metrics", () => {
    const bad = {
      ...minimalSnapshot,
      gsc: {
        clicks: Infinity,
        impressions: 1,
        ctr: 0.1,
        position: 2,
        prevClicks: 1,
        prevImpressions: 1,
      },
    };
    expect(reportShareSnapshotSchema.safeParse(bad).success).toBe(false);
  });
});

describe("createReportShareSchema", () => {
  it("requires a non-empty title and a known range", () => {
    expect(
      createReportShareSchema.safeParse({
        projectId: "p1",
        rangeKey: "30d",
        title: "acme-demo.com",
        snapshot: minimalSnapshot,
      }).success,
    ).toBe(true);
    expect(
      createReportShareSchema.safeParse({
        projectId: "p1",
        rangeKey: "7d",
        title: "acme-demo.com",
        snapshot: minimalSnapshot,
      }).success,
    ).toBe(false);
  });
});
