import type { BillingCustomerContext } from "@/server/billing/subscription";
import { AppError } from "@/server/lib/errors";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { getBrandLookup } from "@/server/features/ai-search/services/brandLookup";
import { BrandVisibilitySnapshotRepository } from "@/server/features/ai-search/repositories/BrandVisibilitySnapshotRepository";
import { snapshotFromResult } from "@/server/lib/brand-visibility/snapshot";
import {
  buildTrend,
  type BrandVisibilityTrend,
  type TrendInputRow,
} from "@/server/lib/brand-visibility/trend";
import {
  buildOpportunities,
  type Opportunity,
} from "@/server/lib/brand-visibility/opportunities";
import {
  brandLookupResultSchema,
  type BrandLookupResult,
} from "@/types/schemas/ai-search";
import { detectTarget } from "@/shared/targetDetection";

/**
 * Project-centric AI-visibility tracking layered on top of the stateless Brand
 * Lookup service. `analyze` runs a lookup for the project's OWN domain and
 * records a daily snapshot; `history` reads those snapshots back for the trend,
 * the tab, and the Client Report. Only `analyze` spends — it's the metered path.
 */

function parseStoredResult(resultJson: string): BrandLookupResult | null {
  try {
    const parsed = brandLookupResultSchema.safeParse(JSON.parse(resultJson));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Run the project's own brand analysis and persist a snapshot. Metered exactly
 * like Brand Lookup (the caller enforces the paid gate); the snapshot write is
 * a free side effect. Throws VALIDATION_ERROR if the project has no domain.
 */
async function analyze(
  projectId: string,
  billingCustomer: BillingCustomerContext,
  competitors: string[] = [],
): Promise<BrandLookupResult> {
  const project = await ProjectRepository.getProjectById(projectId);
  const domain = project?.domain?.trim();
  if (!domain) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Add a domain to this project to track its AI visibility.",
    );
  }

  const result = await getBrandLookup(
    {
      projectId,
      query: domain,
      competitors,
      locationCode: project.locationCode,
      languageCode: project.languageCode,
    },
    billingCustomer,
  );

  // Only record a snapshot when the lookup actually returned data, so an empty
  // or fully-failed run never becomes a misleading zero in the trend. Best
  // effort: a storage failure must never discard a result the user just paid
  // for — tracking is secondary to returning the analysis.
  if (result.hasData) {
    try {
      await BrandVisibilitySnapshotRepository.upsertDaily(
        projectId,
        snapshotFromResult(
          result,
          new Date(result.fetchedAt).toISOString().slice(0, 10),
        ),
      );
    } catch (error) {
      console.error("ai-search.brand-visibility.snapshot-write failed:", error);
    }
  }

  return result;
}

type BrandVisibilityHistory = {
  target: string | null;
  trend: BrandVisibilityTrend;
  latestResult: BrandLookupResult | null;
  latestCapturedOn: string | null;
  /** Gap opportunities from the latest snapshot; computed here so the client
   * bundle never pulls in the server-side rules. */
  opportunities: Opportunity[];
};

const EMPTY_HISTORY: BrandVisibilityHistory = {
  target: null,
  trend: buildTrend([]),
  latestResult: null,
  latestCapturedOn: null,
  opportunities: [],
};

/**
 * Stored snapshots for a project: trend series + the latest full result. Free.
 * Scoped to the project's CURRENT domain, so changing the project's domain never
 * mixes a previous target's snapshots into the trend, deltas, or report.
 */
const comparisonKeys = (result: BrandLookupResult) =>
  JSON.stringify(
    result.shareOfVoice?.entries
      .map((entry) => entry.label.toLowerCase())
      .toSorted() ?? [],
  );

async function history(projectId: string): Promise<BrandVisibilityHistory> {
  const project = await ProjectRepository.getProjectById(projectId);
  const domain = project?.domain?.trim();
  const currentTarget = domain ? detectTarget(domain).value : null;
  if (!currentTarget) return EMPTY_HISTORY;

  const rows = (
    await BrandVisibilitySnapshotRepository.listForProject(projectId)
  ).filter((row) => row.target === currentTarget);
  const parsed = rows
    .map((row) => parseStoredResult(row.resultJson))
    .filter((result): result is BrandLookupResult => result !== null);
  const scoped = parsed
    .filter(
      (result) =>
        result.contractVersion === 2 &&
        result.scope?.locationCode === project.locationCode &&
        result.scope?.languageCode.toLowerCase() ===
          project.languageCode.toLowerCase(),
    )
    .toSorted((a, b) => Date.parse(a.fetchedAt) - Date.parse(b.fetchedAt));
  const latestResult =
    scoped.at(-1) ??
    parsed.filter((result) => result.contractVersion !== 2).at(-1) ??
    null;
  const latestComparison = latestResult ? comparisonKeys(latestResult) : null;
  // Earlier releases copied cached captures into multiple calendar rows. Read
  // the immutable result date and metrics, not those denormalized columns.
  const byDay = new Map<string, TrendInputRow>();
  for (const result of scoped) {
    const capturedOn = new Date(result.fetchedAt).toISOString().slice(0, 10);
    byDay.set(capturedOn, {
      capturedOn,
      totalMentions: result.totalMentions,
      chatgptMentions:
        result.perPlatform.find((entry) => entry.platform === "chat_gpt")
          ?.mentions ?? null,
      googleMentions:
        result.perPlatform.find((entry) => entry.platform === "google")
          ?.mentions ?? null,
      targetSharePct:
        comparisonKeys(result) === latestComparison
          ? (result.shareOfVoice?.entries.find((entry) => entry.isTarget)
              ?.sharePct ?? null)
          : null,
    });
  }
  const trendRows = [...byDay.values()];

  return {
    target: currentTarget,
    trend: buildTrend(trendRows),
    latestResult,
    latestCapturedOn: latestResult
      ? new Date(latestResult.fetchedAt).toISOString().slice(0, 10)
      : null,
    opportunities: latestResult ? buildOpportunities(latestResult) : [],
  };
}

export const BrandVisibilityService = {
  analyze,
  history,
} as const;
