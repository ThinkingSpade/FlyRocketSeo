import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: async () => "intersection-fixture-key",
}));
import { fetchBacklinksDomainIntersection } from "./backlinks-insights";

const input = {
  targets: ["rival.example", "second.example"],
  excludeTargets: ["owned.example"],
};
const targets = { "1": "rival.example", "2": "second.example" };
function fixture(
  data: Record<string, unknown>,
  resultScope: Record<string, unknown> = {},
) {
  return Response.json({
    status_code: 20000,
    tasks: [
      {
        status_code: 20000,
        cost: 0.02,
        path: ["v3", "backlinks", "domain_intersection", "live"],
        data,
        result: [
          {
            targets,
            items: [
              {
                domain_intersection: {
                  "1": { target: "link.example", backlinks: 0 },
                },
              },
            ],
            total_count: 1,
            ...resultScope,
          },
        ],
      },
    ],
  });
}
afterEach(() => vi.unstubAllGlobals());
describe("backlink intersection requested identities", () => {
  it.each([
    {
      targets: { "1": "second.example", "2": "rival.example" },
      exclude_targets: ["owned.example"],
    },
    {
      targets: { "1": "foreign.example", "2": "second.example" },
      exclude_targets: ["owned.example"],
    },
    { targets: { "1": "rival.example" }, exclude_targets: ["owned.example"] },
    { targets, exclude_targets: ["foreign.example"] },
    { targets, exclude_targets: [] },
    { targets, exclude_targets: ["owned.example"], rank_scale: "one_thousand" },
    { targets, exclude_targets: ["owned.example"], include_subdomains: false },
    {
      targets,
      exclude_targets: ["owned.example"],
      exclude_internal_backlinks: false,
    },
  ])(
    "rejects mismatched reported task request scope %# with original charged metadata",
    async (data) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fixture(data)));
      await expect(
        fetchBacklinksDomainIntersection(input),
      ).rejects.toMatchObject({
        name: "DataforseoChargedTaskError",
        billing: { costUsd: 0.02 },
      });
    },
  );
  it("rejects a different exclusion if the result reports one", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          fixture(
            { targets, exclude_targets: ["owned.example"] },
            { exclude_targets: ["foreign.example"] },
          ),
        ),
    );
    await expect(fetchBacklinksDomainIntersection(input)).rejects.toMatchObject(
      { name: "DataforseoChargedTaskError", billing: { costUsd: 0.02 } },
    );
  });
  it("keeps a matching request as one paid POST without replay and accepts absent optional echoes", async () => {
    const transport = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe("POST");
        return fixture({ targets, exclude_targets: ["WWW.Owned.Example"] });
      },
    );
    vi.stubGlobal("fetch", transport);
    expect(
      (await fetchBacklinksDomainIntersection(input)).data.items[0]
        .domain_intersection?.["1"]?.backlinks,
    ).toBe(0);
    expect(transport).toHaveBeenCalledOnce();
    transport.mockResolvedValueOnce(fixture({}));
    expect(
      (await fetchBacklinksDomainIntersection(input)).data.items,
    ).toHaveLength(1);
  });
});
