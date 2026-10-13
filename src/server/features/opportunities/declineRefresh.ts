import {
  GscService,
  toGscUnavailable,
} from "@/server/features/gsc/services/GscService";
import {
  resolveDateRange,
  type GscPerformanceFilter,
} from "@/server/features/gsc/searchAnalytics";
import { previousPeriod } from "@/server/features/gsc/searchPerformanceReport";
import { pullWasTruncated } from "@/server/features/gsc/fetchAllRows";
import { AppError } from "@/server/lib/errors";
import type { GscSearchAnalyticsRow } from "@/server/lib/gscClient";
import type { EvidenceSnapshot, OpportunityRun } from "@/shared/opportunities";
import {
  listOpportunitiesInputSchema,
  type ListOpportunitiesInput,
  type RefreshOpportunitiesInput,
} from "@/types/schemas/opportunities";
import { OpportunityRepository } from "./OpportunityRepository";
import { detectDecliningPages, matchingWeekdays } from "./detectors";
import {
  scoped,
  evidenceScope,
  digest,
  persistFinding,
  DETECTOR_VERSION,
  type OpportunityContext,
} from "./opportunityEvidence";
export async function list(
  context: OpportunityContext,
  input: Partial<Pick<ListOpportunitiesInput, "page" | "status">> = {},
) {
  const { page, status } = listOpportunitiesInputSchema.parse({
    ...input,
    projectId: context.projectId,
  });
  const scope = scoped(context);
  const [opportunities, latestRun] = await Promise.all([
    OpportunityRepository.list(scope, 101, { offset: page * 100, status }),
    OpportunityRepository.latestRun(scope),
  ]);
  return {
    target: scope.target,
    opportunities: opportunities.slice(0, 100),
    latestRun,
    coverage: {
      limit: 100,
      page,
      status: status ?? null,
      hasMore: opportunities.length > 100,
      hasPrevious: page > 0,
    },
  };
}

function validRows(rows: GscSearchAnalyticsRow[]) {
  return rows.every(
    (row) =>
      row.keys?.[0] &&
      Number.isFinite(row.clicks) &&
      row.clicks >= 0 &&
      Number.isFinite(row.impressions) &&
      row.impressions >= row.clicks &&
      Number.isFinite(row.position) &&
      (row.impressions === 0 || row.position > 0),
  );
}
function observation(row: GscSearchAnalyticsRow) {
  return {
    clicks: row.clicks,
    impressions: row.impressions,
    position: row.impressions > 0 ? row.position : null,
  };
}
function ownPage(url: string, target: string) {
  try {
    const parsed = new URL(url);
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password &&
      parsed.hostname === target
    );
  } catch {
    return false;
  }
}

export async function refresh(
  input: RefreshOpportunitiesInput,
  context: OpportunityContext,
) {
  const scope = scoped(context);
  const range = resolveDateRange(input);
  const prev = previousPeriod(range.startDate, range.endDate);
  const fetchedAt = new Date().toISOString();
  const filters: GscPerformanceFilter[] = [];
  if (input.country)
    filters.push({
      dimension: "country",
      operator: "equals",
      expression: input.country,
    });
  if (input.device)
    filters.push({
      dimension: "device",
      operator: "equals",
      expression: input.device,
    });
  const request = {
    projectId: context.projectId,
    filters,
    type: input.searchType,
    dataState: "final" as const,
    dimensions: ["page"] as ["page"],
    rowLimit: 1000,
  };
  let current;
  let prior;
  try {
    [current, prior] = await Promise.all([
      GscService.getAnalyticsPerformance({ ...request, ...range }),
      GscService.getAnalyticsPerformance({ ...request, ...prev }),
    ]);
  } catch (error) {
    const unavailable = toGscUnavailable(error, {
      projectId: context.projectId,
      surface: "opportunities",
    });
    const run: OpportunityRun = {
      id: crypto.randomUUID(),
      fetchedAt,
      observedFrom: range.startDate,
      observedTo: range.endDate,
      availability: "unavailable",
      reasons: [unavailable.reason],
    };
    await OpportunityRepository.recordRun(
      scope,
      "unavailable",
      run,
      "page-decline",
      DETECTOR_VERSION,
    );
    return {
      ...(await list(context)),
      availability: run.availability,
      reasons: run.reasons,
      runId: run.id,
    };
  }
  if (
    current.siteUrl !== prior.siteUrl ||
    current.connectedBy !== prior.connectedBy
  )
    throw new AppError(
      "CONFLICT",
      "Property or connector changed during evidence capture.",
    );
  let coversTarget = false;
  if (current.siteUrl.startsWith("sc-domain:")) {
    const property = current.siteUrl.slice("sc-domain:".length).toLowerCase();
    coversTarget =
      scope.target === property || scope.target.endsWith(`.${property}`);
  } else {
    try {
      coversTarget = new URL(current.siteUrl).hostname === scope.target;
    } catch {
      /* An invalid stored property cannot authorize reconciliation. */
    }
  }
  if (!coversTarget)
    throw new AppError(
      "VALIDATION_ERROR",
      "The connected Search Console property does not cover this project's current website.",
    );
  const sourceScope = evidenceScope(
    context,
    input,
    current.siteUrl,
    current.connectedBy,
  );
  const scopeKey = await digest(sourceScope);
  const reasons: string[] = [];
  if (
    current.request.startDate !== range.startDate ||
    current.request.endDate !== range.endDate ||
    prior.request.startDate !== prev.startDate ||
    prior.request.endDate !== prev.endDate
  )
    reasons.push(
      "The provider clamped or changed a requested date window. Complete equal windows are required for a decline comparison.",
    );
  if (pullWasTruncated(current) || pullWasTruncated(prior))
    reasons.push(
      "A page pull reached its row limit. Do not infer a page decline or absence from independently sampled populations.",
    );
  if (!validRows(current.rows) || !validRows(prior.rows))
    reasons.push("Invalid or missing GSC observations.");
  if (!matchingWeekdays(range, prev))
    reasons.push(
      "Use equal windows with matching weekday composition, such as 7 or 28 days.",
    );
  if (range.endDate > resolveDateRange({ dateRange: "last_7_days" }).endDate)
    reasons.push(
      "The selected window has not finished the Search Console reporting lag.",
    );
  if (!current.rows.length || !prior.rows.length)
    reasons.push("Both comparison periods need observed page data.");
  const complete = reasons.length === 0;
  const currentPages = new Map(current.rows.map((row) => [row.keys?.[0], row]));
  const priorPages = new Map(prior.rows.map((row) => [row.keys?.[0], row]));
  if (
    currentPages.size !== current.rows.length ||
    priorPages.size !== prior.rows.length
  )
    reasons.push("Duplicate page observations cannot be combined safely.");
  const snapshots: EvidenceSnapshot[] =
    complete && reasons.length === 0
      ? [...currentPages].flatMap(([url, row]) => {
          const before = priorPages.get(url);
          if (!url || !before || !ownPage(url, scope.target)) return [];
          return [
            {
              schemaVersion: 1,
              source: "Google Search Console",
              fetchedAt,
              scope: sourceScope,
              url,
              window: range,
              previousWindow: prev,
              current: observation(row),
              previous: observation(before),
              coverage: {
                finalData: true,
                currentRows: 1,
                previousRows: 1,
                truncated: false,
                complete: true,
              },
              limitations: [
                "GSC returns top observed rows rather than a complete keyword census. These page-level periods were captured with matching filters.",
              ],
            },
          ];
        })
      : [];
  const findings = detectDecliningPages(snapshots);
  const dedupeKeys = await Promise.all(
    findings.map((finding) =>
      digest({
        scope: sourceScope,
        kind: finding.kind,
        url: finding.url,
        assets: finding.assetRefs,
      }),
    ),
  );
  for (const finding of findings.slice(0, 25))
    await persistFinding(finding, context, "page-decline");
  if (findings.length > 25)
    reasons.push(
      "This bounded run saved the 25 largest supported declines. Additional findings remain outside the persisted subset; absence reconciliation was skipped.",
    );
  await OpportunityRepository.reconcileObserved(scope, {
    scopeKey,
    detectorId: "page-decline",
    observedDedupeKeys: dedupeKeys,
    complete: reasons.length === 0,
    fetchedAt,
    window: range,
  });
  const run: OpportunityRun = {
    id: crypto.randomUUID(),
    fetchedAt,
    observedFrom: range.startDate,
    observedTo: range.endDate,
    availability: reasons.length ? "insufficient" : "ready",
    reasons,
  };
  await OpportunityRepository.recordRun(
    scope,
    scopeKey,
    run,
    "page-decline",
    DETECTOR_VERSION,
  );
  return {
    ...(await list(context)),
    availability: run.availability,
    reasons,
    runId: run.id,
  };
}
