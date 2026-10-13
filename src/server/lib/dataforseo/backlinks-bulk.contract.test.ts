import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: async () => "isolated-fixture-key",
}));
import {
  fetchBulkBacklinks,
  fetchBulkNewLostReferringDomains,
  fetchBulkRanks,
  fetchBulkReferringDomains,
  fetchReferringNetworks,
} from "./backlinks-bulk";
import {
  fetchBacklinksAnchors,
  fetchBacklinksDomainIntersection,
  fetchBacklinksNewLostTimeseries,
  fetchBulkSpamScores,
} from "./backlinks-insights";
function fixture(items: unknown, extra: Record<string, unknown> = {}) {
  return Response.json({
    status_code: 20000,
    tasks: [
      {
        status_code: 20000,
        status_message: "Ok.",
        path: ["v3", "backlinks", "fixture", "live"],
        cost: 0.04,
        result: [{ items, ...extra }],
      },
    ],
  });
}
const input = { targets: ["example.com", "other.example.com"] };
describe("SDK bulk and insight backlink observation contracts", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());
  it("keeps zero bulk ranks but rejects observations outside the requested hundred-point scale", async () => {
    vi.mocked(fetch).mockResolvedValue(
      fixture([
        { target: "example.com", rank: 0 },
        { target: "other.example.com", rank: 1000 },
      ]),
    );
    expect((await fetchBulkRanks(input)).data).toMatchObject([
      { rank: 0 },
      { rank: null },
    ]);
  });
  it("keeps zero backlinks while fractional or unsafe counts remain unknown", async () => {
    vi.mocked(fetch).mockResolvedValue(
      fixture([
        { target: "example.com", backlinks: 0 },
        { target: "other.example.com", backlinks: 1.5 },
      ]),
    );
    expect((await fetchBulkBacklinks(input)).data).toMatchObject([
      { backlinks: 0 },
      { backlinks: null },
    ]);
    vi.mocked(fetch).mockResolvedValue(
      fixture([
        {
          target: "example.com",
          referring_domains: Number.MAX_SAFE_INTEGER + 1,
          referring_domains_nofollow: -1,
          referring_main_domains: 0,
        },
      ]),
    );
    expect((await fetchBulkReferringDomains(input)).data[0]).toMatchObject({
      referring_domains: null,
      referring_domains_nofollow: null,
      referring_main_domains: 0,
    });
  });
  it("keeps independently missing new/lost counts unknown", async () => {
    vi.mocked(fetch).mockResolvedValue(
      fixture([
        {
          target: "example.com",
          new_referring_domains: 0,
          lost_referring_domains: 0.5,
        },
      ]),
    );
    expect(
      (
        await fetchBulkNewLostReferringDomains({
          ...input,
          dateFrom: "2026-10-01",
        })
      ).data[0],
    ).toMatchObject({ new_referring_domains: 0, lost_referring_domains: null });
  });
  it("rejects unknown, duplicate or missing bulk target identity with billed-task evidence", async () => {
    for (const rows of [
      [{ target: "foreign.example.com", rank: 10 }],
      [
        { target: "example.com", rank: 10 },
        { target: "example.com", rank: 20 },
      ],
      [{ rank: 10 }],
    ]) {
      vi.mocked(fetch).mockResolvedValue(fixture(rows));
      await expect(fetchBulkRanks(input)).rejects.toMatchObject({
        name: "DataforseoChargedTaskError",
        billing: { costUsd: 0.04 },
      });
    }
  });
  it("rejects a missing successful payload instead of observing zero targets", async () => {
    vi.mocked(fetch).mockResolvedValue(fixture(undefined));
    await expect(fetchBulkBacklinks(input)).rejects.toMatchObject({
      name: "DataforseoChargedTaskError",
      billing: { costUsd: 0.04 },
    });
  });
  it("normalizes spam scores and anchor/network measurements without rounding bad evidence", async () => {
    vi.mocked(fetch).mockResolvedValue(
      fixture([{ target: "example.com", spam_score: 101 }]),
    );
    expect((await fetchBulkSpamScores(input)).data[0]?.spam_score).toBeNull();
    vi.mocked(fetch).mockResolvedValue(
      fixture(
        [
          {
            anchor: "Acme",
            rank: -1,
            backlinks: 1.5,
            referring_domains: 0,
            first_seen: "2026-02-31",
          },
        ],
        { target: "example.com", total_count: 0.5 },
      ),
    );
    expect(
      (await fetchBacklinksAnchors({ target: "example.com" })).data,
    ).toMatchObject({
      totalCount: null,
      items: [
        { rank: null, backlinks: null, referring_domains: 0, first_seen: null },
      ],
    });
    vi.mocked(fetch).mockResolvedValue(
      fixture(
        [
          {
            network_address: "192.0.2.0/24",
            rank: 500,
            referring_domains: -1,
            backlinks: 0,
          },
        ],
        { target: "example.com", total_count: 1 },
      ),
    );
    expect(
      (await fetchReferringNetworks({ target: "example.com" })).data.items[0],
    ).toMatchObject({ rank: null, referring_domains: null, backlinks: 0 });
  });
  it("rejects a list scoped to another target and unrequested intersection indexes", async () => {
    vi.mocked(fetch).mockResolvedValue(
      fixture([], { target: "foreign.example.com", total_count: 0 }),
    );
    await expect(
      fetchBacklinksAnchors({ target: "example.com" }),
    ).rejects.toMatchObject({ name: "DataforseoChargedTaskError" });
    vi.mocked(fetch).mockResolvedValue(
      fixture(
        [
          {
            domain_intersection: {
              "99": { target: "linker.example.com", backlinks: 10 },
            },
          },
        ],
        { total_count: 1 },
      ),
    );
    await expect(fetchBacklinksDomainIntersection(input)).rejects.toMatchObject(
      { name: "DataforseoChargedTaskError" },
    );
  });
  it("preserves explicit timeline zeros and partial events without invented dates", async () => {
    vi.mocked(fetch).mockResolvedValue(
      fixture(
        [
          {
            date: "2026-09-30 00:00:00 +00:00",
            new_backlinks: 0,
            lost_backlinks: 0.5,
          },
          { date: "2026-02-31", new_backlinks: 0 },
        ],
        {
          target: "example.com",
          date_from: "2026-09-01",
          date_to: "2026-09-30",
          group_range: "month",
        },
      ),
    );
    expect(
      (
        await fetchBacklinksNewLostTimeseries({
          target: "example.com",
          dateFrom: "2026-09-01",
          dateTo: "2026-09-30",
        })
      ).data,
    ).toMatchObject([
      { new_backlinks: 0, lost_backlinks: null },
      { date: null },
    ]);
  });
});
