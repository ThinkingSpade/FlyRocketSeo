import { z } from "zod";
import {
  BacklinksBulkBacklinksLiveRequestInfo,
  BacklinksBulkNewLostReferringDomainsLiveRequestInfo,
  BacklinksBulkRanksLiveRequestInfo,
  BacklinksBulkReferringDomainsLiveRequestInfo,
  BacklinksReferringNetworksLiveRequestInfo,
} from "dataforseo-client";
import { createDataforseoBillingClassifier } from "@/server/lib/dataforseoBillingClassification";
import { backlinksApi } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  parseTaskItems,
  parseTaskTotalCount,
} from "@/server/lib/dataforseo/envelope";

/**
 * The `bulk_*` backlinks endpoints, which answer one question for up to 1,000
 * targets in a single billed request. That property is what makes a side-by-side
 * competitor comparison affordable: four calls cover the whole table no matter
 * how many competitors the user adds.
 *
 * DataForSEO does not guarantee that the response preserves request order, and
 * every item echoes its own `target`, so callers must correlate by that field
 * rather than by array position.
 *
 * Split from backlinks.ts / backlinks-insights.ts to keep all three modules
 * under the file-size ceiling. Conventions are identical: passthrough Zod item
 * schemas and the shared billing classifier.
 */

const classifyBacklinksError = createDataforseoBillingClassifier({
  pathPrefix: "/backlinks/",
  billingIssueCode: "BACKLINKS_BILLING_ISSUE",
  billingIssueMessage:
    "The connected DataForSEO account has a billing or balance issue",
});

const assertOptions = (path: string) =>
  ({ classify: classifyBacklinksError, classifyPath: path }) as const;

const bulkRankItemSchema = z
  .object({
    target: z.string().nullable().optional(),
    rank: z.number().nullable().optional(),
  })
  .passthrough();

const bulkBacklinksItemSchema = z
  .object({
    target: z.string().nullable().optional(),
    backlinks: z.number().nullable().optional(),
  })
  .passthrough();

const bulkReferringDomainsItemSchema = z
  .object({
    target: z.string().nullable().optional(),
    referring_domains: z.number().nullable().optional(),
    referring_domains_nofollow: z.number().nullable().optional(),
    referring_main_domains: z.number().nullable().optional(),
    referring_main_domains_nofollow: z.number().nullable().optional(),
  })
  .passthrough();

const bulkNewLostReferringDomainsItemSchema = z
  .object({
    target: z.string().nullable().optional(),
    new_referring_domains: z.number().nullable().optional(),
    lost_referring_domains: z.number().nullable().optional(),
    new_referring_main_domains: z.number().nullable().optional(),
    lost_referring_main_domains: z.number().nullable().optional(),
  })
  .passthrough();

const referringNetworkItemSchema = z
  .object({
    network_address: z.string().nullable().optional(),
    rank: z.number().nullable().optional(),
    backlinks: z.number().nullable().optional(),
    referring_domains: z.number().nullable().optional(),
    referring_pages: z.number().nullable().optional(),
    first_seen: z.string().nullable().optional(),
  })
  .passthrough();

/**
 * Domain Rank for many targets at once. `rank_scale` is pinned to the hundred
 * point scale every other backlinks call in this codebase requests, so the
 * numbers line up with the ones already on screen — the API default is the
 * thousand point scale.
 */
export async function fetchBulkRanks(input: { targets: string[] }) {
  const response = await backlinksApi(classifyBacklinksError).bulkRanksLive([
    new BacklinksBulkRanksLiveRequestInfo({
      targets: input.targets,
      rank_scale: "one_hundred",
    }),
  ]);
  const task = assertOk(
    response,
    assertOptions("/v3/backlinks/bulk_ranks/live"),
  );
  return {
    data: parseTaskItems("bulk-ranks-live", task, bulkRankItemSchema),
    billing: buildTaskBilling(task),
  };
}

export async function fetchBulkBacklinks(input: { targets: string[] }) {
  const response = await backlinksApi(classifyBacklinksError).bulkBacklinksLive(
    [new BacklinksBulkBacklinksLiveRequestInfo({ targets: input.targets })],
  );
  const task = assertOk(
    response,
    assertOptions("/v3/backlinks/bulk_backlinks/live"),
  );
  return {
    data: parseTaskItems("bulk-backlinks-live", task, bulkBacklinksItemSchema),
    billing: buildTaskBilling(task),
  };
}

export async function fetchBulkReferringDomains(input: { targets: string[] }) {
  const response = await backlinksApi(
    classifyBacklinksError,
  ).bulkReferringDomainsLive([
    new BacklinksBulkReferringDomainsLiveRequestInfo({
      targets: input.targets,
    }),
  ]);
  const task = assertOk(
    response,
    assertOptions("/v3/backlinks/bulk_referring_domains/live"),
  );
  return {
    data: parseTaskItems(
      "bulk-referring-domains-live",
      task,
      bulkReferringDomainsItemSchema,
    ),
    billing: buildTaskBilling(task),
  };
}

/**
 * Referring domains won and lost since `dateFrom`. The endpoint takes no
 * `date_to` — it counts forward from that date to today — and rejects a date
 * more than a year back.
 */
export async function fetchBulkNewLostReferringDomains(input: {
  targets: string[];
  dateFrom: string;
}) {
  const response = await backlinksApi(
    classifyBacklinksError,
  ).bulkNewLostReferringDomainsLive([
    new BacklinksBulkNewLostReferringDomainsLiveRequestInfo({
      targets: input.targets,
      date_from: input.dateFrom,
    }),
  ]);
  const task = assertOk(
    response,
    assertOptions("/v3/backlinks/bulk_new_lost_referring_domains/live"),
  );
  return {
    data: parseTaskItems(
      "bulk-new-lost-referring-domains-live",
      task,
      bulkNewLostReferringDomainsItemSchema,
    ),
    billing: buildTaskBilling(task),
  };
}

/**
 * Referring links grouped by the network their host sits on. A profile whose
 * links concentrate into a handful of subnets is the shape a private blog
 * network leaves behind, which no per-domain view surfaces.
 */
export async function fetchReferringNetworks(input: {
  target: string;
  /** "ip" groups by host address, "subnet" by the /24 block around it. */
  networkAddressType?: "ip" | "subnet";
  limit?: number;
  offset?: number;
}) {
  const response = await backlinksApi(
    classifyBacklinksError,
  ).referringNetworksLive([
    new BacklinksReferringNetworksLiveRequestInfo({
      target: input.target,
      network_address_type: input.networkAddressType ?? "subnet",
      include_subdomains: true,
      include_indirect_links: true,
      exclude_internal_backlinks: true,
      backlinks_status_type: "live",
      rank_scale: "one_hundred",
      limit: input.limit ?? 100,
      offset: input.offset,
      order_by: ["referring_domains,desc"],
    }),
  ]);
  const task = assertOk(
    response,
    assertOptions("/v3/backlinks/referring_networks/live"),
  );
  return {
    data: {
      items: parseTaskItems(
        "referring-networks-live",
        task,
        referringNetworkItemSchema,
      ),
      totalCount: parseTaskTotalCount(task),
    },
    billing: buildTaskBilling(task),
  };
}

export type BulkRankItem = z.infer<typeof bulkRankItemSchema>;
export type BulkBacklinksItem = z.infer<typeof bulkBacklinksItemSchema>;
export type BulkReferringDomainsItem = z.infer<
  typeof bulkReferringDomainsItemSchema
>;
export type BulkNewLostReferringDomainsItem = z.infer<
  typeof bulkNewLostReferringDomainsItemSchema
>;
export type ReferringNetworkItem = z.infer<typeof referringNetworkItemSchema>;
