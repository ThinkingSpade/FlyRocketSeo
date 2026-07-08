import { z } from "zod";
import {
  BacklinksAnchorsLiveRequestInfo,
  BacklinksBulkSpamScoreLiveRequestInfo,
  BacklinksCompetitorsLiveRequestInfo,
  BacklinksDomainIntersectionLiveRequestInfo,
  BacklinksTimeseriesNewLostSummaryLiveRequestInfo,
} from "dataforseo-client";
import { createDataforseoBillingClassifier } from "@/server/lib/dataforseoBillingClassification";
import { backlinksApi } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  parseTaskItems,
  parseTaskTotalCount,
} from "@/server/lib/dataforseo/envelope";

// Deeper backlink analytics (anchors, link competitors, link gap, spam scores,
// new/lost timeline), split from backlinks.ts to keep both modules under the
// size ceiling. Conventions match backlinks.ts: Zod item schemas with
// passthrough, and the shared billing classifier.

const classifyBacklinksError = createDataforseoBillingClassifier({
  pathPrefix: "/backlinks/",
  billingIssueCode: "BACKLINKS_BILLING_ISSUE",
  billingIssueMessage:
    "The connected DataForSEO account has a billing or balance issue",
});

const assertOptions = (path: string) =>
  ({ classify: classifyBacklinksError, classifyPath: path }) as const;

const backlinksAnchorItemSchema = z
  .object({
    anchor: z.string().nullable().optional(),
    rank: z.number().nullable().optional(),
    backlinks: z.number().nullable().optional(),
    referring_domains: z.number().nullable().optional(),
    referring_pages: z.number().nullable().optional(),
    backlinks_spam_score: z.number().nullable().optional(),
    first_seen: z.string().nullable().optional(),
    lost_date: z.string().nullable().optional(),
  })
  .passthrough();

const backlinksCompetitorItemSchema = z
  .object({
    target: z.string().nullable().optional(),
    rank: z.number().nullable().optional(),
    intersections: z.number().nullable().optional(),
  })
  .passthrough();

// Each entry describes the referring domain (its `target` field) and the
// backlinks it points at the corresponding POST target.
const intersectionEntrySchema = z
  .object({
    target: z.string().nullable().optional(),
    rank: z.number().nullable().optional(),
    backlinks: z.number().nullable().optional(),
    referring_pages: z.number().nullable().optional(),
    backlinks_spam_score: z.number().nullable().optional(),
    first_seen: z.string().nullable().optional(),
  })
  .passthrough();

export const backlinksIntersectionItemSchema = z
  .object({
    domain_intersection: z
      .record(z.string(), intersectionEntrySchema)
      .nullable()
      .optional(),
  })
  .passthrough();

const bulkSpamScoreItemSchema = z
  .object({
    target: z.string().nullable().optional(),
    spam_score: z.number().nullable().optional(),
  })
  .passthrough();

const backlinksNewLostItemSchema = z
  .object({
    date: z.string().nullable().optional(),
    new_backlinks: z.number().nullable().optional(),
    lost_backlinks: z.number().nullable().optional(),
    new_referring_domains: z.number().nullable().optional(),
    lost_referring_domains: z.number().nullable().optional(),
  })
  .passthrough();

export async function fetchBacklinksAnchors(input: {
  target: string;
  limit?: number;
  offset?: number;
  orderBy?: string[];
  filters?: unknown[];
}) {
  const response = await backlinksApi(classifyBacklinksError).anchorsLive([
    new BacklinksAnchorsLiveRequestInfo({
      target: input.target,
      include_subdomains: true,
      include_indirect_links: true,
      exclude_internal_backlinks: true,
      backlinks_status_type: "live",
      rank_scale: "one_hundred",
      limit: input.limit ?? 100,
      offset: input.offset,
      order_by: input.orderBy ?? ["backlinks,desc"],
      ...(input.filters && input.filters.length > 0
        ? { filters: input.filters }
        : {}),
    }),
  ]);
  const task = assertOk(response, assertOptions("/v3/backlinks/anchors/live"));
  return {
    data: {
      items: parseTaskItems("anchors-live", task, backlinksAnchorItemSchema),
      totalCount: parseTaskTotalCount(task),
    },
    billing: buildTaskBilling(task),
  };
}

export async function fetchBacklinksCompetitors(input: {
  target: string;
  limit?: number;
  offset?: number;
  excludeLargeDomains?: boolean;
}) {
  const response = await backlinksApi(classifyBacklinksError).competitorsLive([
    new BacklinksCompetitorsLiveRequestInfo({
      target: input.target,
      exclude_internal_backlinks: true,
      exclude_large_domains: input.excludeLargeDomains ?? true,
      main_domain: true,
      rank_scale: "one_hundred",
      limit: input.limit ?? 100,
      offset: input.offset,
      order_by: ["intersections,desc"],
    }),
  ]);
  const task = assertOk(
    response,
    assertOptions("/v3/backlinks/competitors/live"),
  );
  return {
    data: {
      items: parseTaskItems(
        "backlinks-competitors-live",
        task,
        backlinksCompetitorItemSchema,
      ),
      totalCount: parseTaskTotalCount(task),
    },
    billing: buildTaskBilling(task),
  };
}

export async function fetchBacklinksDomainIntersection(input: {
  /** Domains whose referring domains to list, keyed "1", "2", ... in order. */
  targets: string[];
  /** Referring domains already linking to these targets are excluded. */
  excludeTargets?: string[];
  limit?: number;
  offset?: number;
  orderBy?: string[];
}) {
  const targets = Object.fromEntries(
    input.targets.map((target, index) => [String(index + 1), target]),
  );
  const response = await backlinksApi(
    classifyBacklinksError,
  ).domainIntersectionLive([
    new BacklinksDomainIntersectionLiveRequestInfo({
      targets,
      exclude_targets: input.excludeTargets,
      include_subdomains: true,
      exclude_internal_backlinks: true,
      rank_scale: "one_hundred",
      limit: input.limit ?? 100,
      offset: input.offset,
      order_by: input.orderBy ?? ["1.rank,desc"],
    }),
  ]);
  const task = assertOk(
    response,
    assertOptions("/v3/backlinks/domain_intersection/live"),
  );
  return {
    data: {
      items: parseTaskItems(
        "backlinks-domain-intersection-live",
        task,
        backlinksIntersectionItemSchema,
      ),
      totalCount: parseTaskTotalCount(task),
    },
    billing: buildTaskBilling(task),
  };
}

export async function fetchBulkSpamScores(input: { targets: string[] }) {
  const response = await backlinksApi(classifyBacklinksError).bulkSpamScoreLive(
    [
      new BacklinksBulkSpamScoreLiveRequestInfo({
        targets: input.targets,
      }),
    ],
  );
  const task = assertOk(
    response,
    assertOptions("/v3/backlinks/bulk_spam_score/live"),
  );
  return {
    data: parseTaskItems("bulk-spam-score-live", task, bulkSpamScoreItemSchema),
    billing: buildTaskBilling(task),
  };
}

export async function fetchBacklinksNewLostTimeseries(input: {
  target: string;
  dateFrom: string;
  dateTo: string;
  /** Aggregation bucket: "day" | "week" | "month" (DataForSEO group_range). */
  groupRange?: string;
}) {
  const response = await backlinksApi(
    classifyBacklinksError,
  ).timeseriesNewLostSummaryLive([
    new BacklinksTimeseriesNewLostSummaryLiveRequestInfo({
      target: input.target,
      include_subdomains: true,
      date_from: input.dateFrom,
      date_to: input.dateTo,
      group_range: input.groupRange ?? "month",
    }),
  ]);
  const task = assertOk(
    response,
    assertOptions("/v3/backlinks/timeseries_new_lost_summary/live"),
  );
  return {
    data: parseTaskItems(
      "timeseries-new-lost-summary-live",
      task,
      backlinksNewLostItemSchema,
    ),
    billing: buildTaskBilling(task),
  };
}

export type BacklinksIntersectionItem = z.infer<
  typeof backlinksIntersectionItemSchema
>;
