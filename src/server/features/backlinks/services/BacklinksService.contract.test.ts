import { beforeEach, expect, it, vi } from "vitest";

const backlinksSummaryMock = vi.fn();
const backlinksRowsMock = vi.fn();
const referringDomainsMock = vi.fn();
const domainPagesMock = vi.fn();
const backlinksHistoryMock = vi.fn();
const anchorsMock = vi.fn();

vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: vi.fn(
    async (prefix: string, params: Record<string, unknown>) =>
      `${prefix}:${JSON.stringify(params)}`,
  ),
  getCached: vi.fn(async () => null),
  setCached: vi.fn(async () => undefined),
}));

vi.mock("@/server/lib/dataforseo", () => ({
  normalizeBacklinksTarget: vi.fn(),
  createDataforseoClient: vi.fn(() => ({
    backlinks: {
      summary: backlinksSummaryMock,
      rows: backlinksRowsMock,
      referringDomains: referringDomainsMock,
      domainPages: domainPagesMock,
      history: backlinksHistoryMock,
      anchors: anchorsMock,
    },
  })),
}));

import { normalizeBacklinksTarget } from "@/server/lib/dataforseo";
import { createBacklinksService } from "./BacklinksService";
import { buildBacklinksTabExport } from "@/client/features/backlinks/export";
import { buildCsv } from "@/client/lib/csv";
import { backlinksOverviewCacheSchema } from "@/types/schemas/backlinks-results";

const billingCustomer = {
  organizationId: "org_123",
  userId: "user_123",
  userEmail: "team@example.com",
};

const pageInputDefaults = {
  projectId: "project_123",
  page: 1,
  pageSize: 100,
  sortOrder: "desc",
  filters: {},
  mode: "as_is",
} as const;

const cache = new Map<string, string>();
const service = createBacklinksService({
  async get(key) {
    const raw = cache.get(key);
    return raw ? parseCachedValue(raw) : null;
  },
  async set(key, data) {
    cache.set(key, JSON.stringify(data));
  },
});

beforeEach(() => {
  cache.clear();
  vi.clearAllMocks();
});

it("settles the overview cache put before a caller can copy its saved-run envelope", async () => {
  vi.mocked(normalizeBacklinksTarget).mockReturnValue({
    apiTarget: "example.com",
    displayTarget: "example.com",
    scope: "domain",
  });
  backlinksSummaryMock.mockResolvedValue({ backlinks: 12 });
  backlinksHistoryMock.mockResolvedValue([]);
  let releasePut: () => void = vi.fn();
  let markPutStarted: () => void = vi.fn();
  const delayedPut = new Promise<void>((resolve) => {
    releasePut = resolve;
  });
  const putStarted = new Promise<void>((resolve) => {
    markPutStarted = resolve;
  });
  let storedEnvelope: unknown = null;
  const delayedService = createBacklinksService({
    get: async () => null,
    set: async (_key, value) => {
      markPutStarted();
      await delayedPut;
      storedEnvelope = value;
    },
  });
  let savedPayload: unknown = null;
  const record = vi.fn(async () => {
    savedPayload = storedEnvelope;
  });
  const resultPromise = delayedService
    .profileOverview({ target: "example.com" }, billingCustomer)
    .then(async (profile) => {
      await record();
      return profile;
    });
  await putStarted;
  const recordsBeforePutSettled = record.mock.calls.length;
  releasePut();
  const result = await resultPromise;
  expect(recordsBeforePutSettled).toBe(0);
  expect(savedPayload).toEqual({ overview: result.overview });
});

it("normalizes summary observations independently, preserving zero and nulling unsafe counts", async () => {
  vi.mocked(normalizeBacklinksTarget).mockReturnValue({
    apiTarget: "example.com",
    displayTarget: "example.com",
    scope: "domain",
  });
  backlinksSummaryMock.mockResolvedValue({
    rank: 101,
    backlinks: -1,
    referring_pages: 1.5,
    referring_domains: Number.MAX_SAFE_INTEGER + 1,
    broken_backlinks: 0,
    backlinks_spam_score: 101,
    info: { target_spam_score: -1 },
    new_backlinks: 0,
  });
  backlinksHistoryMock.mockResolvedValue([]);
  const { overview } = await service.profileOverview(
    { target: "example.com" },
    billingCustomer,
  );
  expect(overview.summary).toMatchObject({
    rank: null,
    backlinks: null,
    referringPages: null,
    referringDomains: null,
    brokenBacklinks: 0,
    backlinksSpamScore: null,
    targetSpamScore: null,
    newBacklinks: 0,
    lostBacklinks: null,
  });
});

it("applies the history contract to the saved overview, preserving missing coverage through cache reuse", async () => {
  vi.mocked(normalizeBacklinksTarget).mockReturnValue({
    apiTarget: "example.com",
    displayTarget: "example.com",
    scope: "domain",
  });
  backlinksSummaryMock.mockResolvedValue({ backlinks: 0 });
  backlinksHistoryMock.mockResolvedValue([
    {
      date: "2026-03-01",
      referring_domains: 0,
      new_referring_domains: 0,
      lost_referring_domains: 0,
      new_backlinks: 0,
      lost_backlinks: 0,
      rank: 0,
    },
    { date: "2026-02-30", referring_domains: 2 },
    { date: "bad-date", backlinks: 3 },
    {
      date: "2026-02-01",
      backlinks: -2,
      referring_domains: 1.5,
      new_referring_domains: 2,
    },
    {
      date: "2021-04-01",
      new_backlinks: 0,
      lost_backlinks: 0,
      new_referring_domains: 0,
      lost_referring_domains: 0,
    },
  ]);
  const first = await service.profileOverview(
    { target: "example.com" },
    billingCustomer,
  );
  expect(first.overview.trends.map((point) => point.date)).toEqual([
    "2021-04-01",
    "2026-02-01",
    "2026-03-01",
  ]);
  expect(first.overview.newLostTrends[0]).toMatchObject({
    newBacklinks: null,
    lostBacklinks: null,
  });
  expect(first.overview.trends[1]).toMatchObject({
    backlinks: null,
    referringDomains: null,
  });
  expect(first.overview.newLostTrends[1]).toMatchObject({
    newReferringDomains: 2,
    lostReferringDomains: null,
  });
  expect(first.overview.newLostTrends[2]).toMatchObject({
    newReferringDomains: 0,
    lostReferringDomains: 0,
  });
  expect(
    await service.profileOverview({ target: "example.com" }, billingCustomer),
  ).toEqual(first);
  expect(backlinksHistoryMock).toHaveBeenCalledOnce();
});

it("keeps invalid list observations out of tables and CSV without dropping the useful row", async () => {
  vi.mocked(normalizeBacklinksTarget).mockReturnValue({
    apiTarget: "example.com",
    displayTarget: "example.com",
    scope: "domain",
  });
  domainPagesMock.mockResolvedValue({
    items: [
      {
        page: "https://example.com/page",
        backlinks: -1,
        referring_domains: 0,
        rank: 150,
        broken_backlinks: 1.25,
      },
    ],
    totalCount: -1,
  });
  const result = await service.profileTopPagesPage(
    { target: "example.com", ...pageInputDefaults, sortField: "backlinks" },
    billingCustomer,
  );
  expect(result.rows).toEqual([
    {
      page: "https://example.com/page",
      backlinks: null,
      referringDomains: 0,
      rank: null,
      brokenBacklinks: null,
    },
  ]);
  expect(result.totalCount).toBeNull();
  const table = buildBacklinksTabExport({
    tab: "pages",
    rows: {
      backlinks: [],
      referringDomains: [],
      topPages: result.rows,
      anchors: [],
    },
  });
  expect(buildCsv(table.headers, table.rows).split("\n")[1]).toBe(
    '"https://example.com/page","","0","",""',
  );
});

it("safely restores legacy summary/history without presenting invalid dates or numbers", () => {
  const restored = backlinksOverviewCacheSchema.parse({
    overview: {
      target: "example.com",
      displayTarget: "example.com",
      scope: "domain",
      summary: { backlinks: -1, referringDomains: 0 },
      trends: [
        { date: "2026-02-30", backlinks: 5 },
        { date: "2026-02-01", backlinks: 0, rank: 101 },
      ],
      newLostTrends: [
        {
          date: "2021-04-01",
          newBacklinks: 0,
          lostBacklinks: 0,
          newReferringDomains: 0,
          lostReferringDomains: 0,
        },
      ],
      fetchedAt: "2026-10-01T00:00:00.000Z",
    },
  });
  expect(restored.overview.summary).toMatchObject({
    backlinks: null,
    referringDomains: 0,
  });
  expect(restored.overview.trends).toEqual([
    { date: "2026-02-01", backlinks: 0, referringDomains: null, rank: null },
  ]);
  expect(restored.overview.newLostTrends[0]?.newBacklinks).toBeNull();
  expect(restored.overview.fetchedAt).toBe("2026-10-01T00:00:00.000Z");
});

it("distinguishes absent link status from explicit false and a valid lost-date observation", async () => {
  vi.mocked(normalizeBacklinksTarget).mockReturnValue({
    apiTarget: "example.com",
    displayTarget: "example.com",
    scope: "domain",
  });
  backlinksRowsMock.mockResolvedValue({
    items: [
      { url_from: "https://source.com/unknown", lost_date: "invalid" },
      {
        url_from: "https://source.com/live",
        is_lost: false,
        is_broken: false,
        dofollow: false,
      },
      {
        url_from: "https://source.com/lost",
        lost_date: "2026-01-01 12:00:00 +00:00",
      },
    ],
    totalCount: 3,
  });
  const result = await service.profileBacklinksPage(
    { target: "example.com", ...pageInputDefaults, sortField: "rank" },
    billingCustomer,
  );
  expect(result.rows.map((row) => [row.isLost, row.isBroken])).toEqual([
    [null, null],
    [false, false],
    [true, null],
  ]);
  expect(result.rows[0]?.lastSeen).toBeNull();
  expect(result.rows[2]?.lastSeen).toBe("2026-01-01T12:00:00.000Z");
  const table = buildBacklinksTabExport({
    tab: "backlinks",
    rows: {
      backlinks: result.rows,
      referringDomains: [],
      topPages: [],
      anchors: [],
    },
  });
  const lostIndex = table.headers.indexOf("Lost");
  expect(table.rows.map((row) => row[lostIndex])).toEqual([null, false, true]);
});

it("keeps safe count and score contracts on referring-domain and anchor lists", async () => {
  vi.mocked(normalizeBacklinksTarget).mockReturnValue({
    apiTarget: "example.com",
    displayTarget: "example.com",
    scope: "domain",
  });
  referringDomainsMock.mockResolvedValue({
    items: [
      {
        domain: "source.com",
        backlinks: 0,
        referring_pages: -1,
        rank: 101,
        backlinks_spam_score: 1.5,
        broken_backlinks: -2,
        broken_pages: 0,
        first_seen: "2026-02-30",
      },
    ],
    totalCount: 1,
  });
  anchorsMock.mockResolvedValue({
    items: [
      {
        anchor: "anchor",
        backlinks: 1.5,
        referring_domains: 0,
        rank: 100,
        backlinks_spam_score: 0,
        first_seen: "2026-01-01 12:00:00 +00:00",
      },
    ],
    totalCount: 1,
  });
  const domains = await service.profileReferringDomainsPage(
    { target: "example.com", ...pageInputDefaults, sortField: "backlinks" },
    billingCustomer,
  );
  const anchors = await service.profileAnchorsPage(
    { target: "example.com", ...pageInputDefaults, sortField: "backlinks" },
    billingCustomer,
  );
  expect(domains.rows[0]).toMatchObject({
    backlinks: 0,
    referringPages: null,
    rank: null,
    spamScore: null,
    brokenBacklinks: null,
    brokenPages: 0,
    firstSeen: null,
  });
  expect(anchors.rows[0]).toMatchObject({
    backlinks: null,
    referringDomains: 0,
    rank: 100,
    spamScore: 0,
    firstSeen: "2026-01-01T12:00:00.000Z",
  });
});

function parseCachedValue(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
