import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: { getAnalyticsPerformance: vi.fn() },
  toGscUnavailable: (error: unknown) => {
    throw error;
  },
}));
import { GscService } from "@/server/features/gsc/services/GscService";
import { getPagePerformance } from "./pagePerformance";

const read = vi.mocked(GscService.getAnalyticsPerformance);
const input = {
  projectId: "project-a",
  url: "https://example.com/services?city=ny",
  startDate: "2026-09-01",
  endDate: "2026-09-28",
  country: "usa",
  device: "MOBILE" as const,
  searchType: "web" as const,
};
const pull = (
  rows: Array<{
    keys: string[];
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }> = [],
) => ({
  siteUrl: "sc-domain:example.com",
  connectedBy: "account-a",
  request: {
    startDate: input.startDate,
    endDate: input.endDate,
    rowLimit: 1000,
  },
  rows,
});

function mockPageReads(rows: Parameters<typeof pull>[0] = []) {
  read.mockImplementation(async (request) => ({
    ...pull(rows),
    request: {
      ...pull().request,
      startDate: request.startDate ?? input.startDate,
      endDate: request.endDate ?? input.endDate,
    },
  }));
}
beforeEach(() => {
  read.mockReset();
  mockPageReads();
});

describe("own-site page performance", () => {
  it("keeps exact page, property, device, country and equal final windows", async () => {
    mockPageReads([
      {
        keys: ["2026-09-01"],
        clicks: 3,
        impressions: 30,
        ctr: 0.1,
        position: 9,
      },
    ]);
    const result = await getPagePerformance(input, "example.com");
    expect(result.connected).toBe(true);
    if (!result.connected) throw new Error("No report");
    expect(result.scope).toMatchObject({
      ...input,
      siteUrl: "sc-domain:example.com",
      connectedBy: "account-a",
    });
    expect(result.range).toEqual({
      startDate: "2026-09-01",
      endDate: "2026-09-28",
      prevStartDate: "2026-08-04",
      prevEndDate: "2026-08-31",
    });
    expect(result.totals.clicks).toBe(3);
    expect(read).toHaveBeenCalledTimes(3);
    for (const [request] of read.mock.calls) {
      expect(request.filters).toEqual(
        expect.arrayContaining([
          { dimension: "page", operator: "equals", expression: input.url },
          { dimension: "device", operator: "equals", expression: "MOBILE" },
          { dimension: "country", operator: "equals", expression: "usa" },
        ]),
      );
      expect(request.dataState).toBe("final");
      expect(request.type).toBe("web");
    }
  });
  it("rejects another site before any GSC read", async () => {
    await expect(
      getPagePerformance(
        { ...input, url: "https://another.example/page" },
        "example.com",
      ),
    ).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });
  it("refuses evidence mixed across changed properties or accounts", async () => {
    read
      .mockResolvedValueOnce(pull())
      .mockResolvedValueOnce({ ...pull(), siteUrl: "sc-domain:old.example" })
      .mockResolvedValueOnce(pull());
    await expect(getPagePerformance(input, "example.com")).rejects.toThrow(
      /changed/i,
    );
  });
  it("preserves real observed zero and capture metadata", async () => {
    mockPageReads();
    const result = await getPagePerformance(input, "example.com");
    expect(result.connected).toBe(true);
    if (!result.connected) return;
    expect(result.totals.clicks).toBe(0);
    expect(result.source).toBe("Google Search Console");
    expect(result.fetchedAt).toMatch(/^\d{4}-/);
    expect(result.coverage.queryTruncated).toBe(false);
  });
  it("rejects a connected property that does not cover the selected page", async () => {
    read.mockResolvedValue({
      ...pull(),
      siteUrl: "https://example.com/other-section/",
    });
    await expect(getPagePerformance(input, "example.com")).rejects.toThrow(
      /cover/i,
    );
  });
  it("keeps transport errors unavailable instead of an empty success", async () => {
    read.mockRejectedValue(new Error("transport unavailable"));
    await expect(getPagePerformance(input, "example.com")).rejects.toThrow(
      "transport unavailable",
    );
  });
  it("refuses invalid returned observations instead of displaying measured numbers", async () => {
    read.mockResolvedValue(
      pull([
        {
          keys: ["2026-09-01"],
          clicks: 2,
          impressions: Number.NaN,
          ctr: 0.2,
          position: 8,
        },
      ]),
    );
    await expect(getPagePerformance(input, "example.com")).rejects.toThrow(
      /invalid/i,
    );
  });
  it("refuses a clamped previous request instead of labelling unequal evidence windows", async () => {
    read.mockImplementation(async (request) => ({
      ...pull(),
      request: {
        ...pull().request,
        startDate:
          request.startDate === "2026-08-04"
            ? "2026-08-10"
            : (request.startDate ?? input.startDate),
        endDate: request.endDate ?? input.endDate,
      },
    }));
    await expect(getPagePerformance(input, "example.com")).rejects.toThrow(
      /window/i,
    );
  });
});
