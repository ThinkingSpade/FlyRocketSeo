import { GscService } from "@/server/features/gsc/services/GscService";
import { getPagePerformance } from "@/server/features/page-explorer/services/pagePerformance";
import type { GscPerformanceFilter } from "@/server/features/gsc/searchAnalytics";
import { pullWasTruncated } from "@/server/features/gsc/fetchAllRows";
import { AppError } from "@/server/lib/errors";
import type { GscSearchAnalyticsRow } from "@/server/lib/gscClient";
import type { SaveInternalLinkOpportunityInput } from "@/types/schemas/opportunities";
import {
  persistFinding,
  snapshotFromPage,
  retainEvidence,
  opportunityDedupeKey,
  digest,
  scoped,
  type OpportunityContext,
} from "./opportunityEvidence";
import { detectInternalLink } from "./detectors";
import { OpportunityRepository } from "./OpportunityRepository";

function validRelevance(row: GscSearchAnalyticsRow) {
  return (
    Boolean(row.keys?.[0]) &&
    Number.isFinite(row.clicks) &&
    row.clicks >= 0 &&
    Number.isFinite(row.impressions) &&
    row.impressions >= row.clicks &&
    Number.isFinite(row.position) &&
    row.position > 0
  );
}

export async function saveInternalLink(
  input: SaveInternalLinkOpportunityInput,
  context: OpportunityContext,
) {
  const report = await getPagePerformance(
    { ...input, url: input.sourceUrl },
    context.project.domain,
  );
  if (!report.connected)
    throw new AppError(
      "VALIDATION_ERROR",
      "Search Console evidence is unavailable.",
    );
  const target = new URL(input.targetUrl);
  const source = new URL(input.sourceUrl);
  if (target.origin !== source.origin || target.username || target.password)
    throw new AppError(
      "VALIDATION_ERROR",
      "Choose both pages on the project's website.",
    );
  const filters: GscPerformanceFilter[] = [
    { dimension: "query", operator: "equals", expression: input.phrase },
  ];
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
  const pull = await GscService.getAnalyticsPerformance({
    projectId: context.projectId,
    startDate: report.range.startDate,
    endDate: report.range.endDate,
    filters,
    type: input.searchType,
    dataState: "final",
    dimensions: ["page"],
    rowLimit: 1000,
  });
  if (
    pull.siteUrl !== report.scope.siteUrl ||
    pull.connectedBy !== report.scope.connectedBy
  )
    throw new AppError(
      "CONFLICT",
      "Property changed while capturing link evidence.",
    );
  const destination = pull.rows.find(
    (row) => row.keys?.[0] === input.targetUrl,
  );
  const sourcePage = pull.rows.find((row) => row.keys?.[0] === input.sourceUrl);
  if (
    pullWasTruncated(pull) ||
    pull.request.startDate !== report.range.startDate ||
    pull.request.endDate !== report.range.endDate ||
    pull.request.dataState !== "final" ||
    pull.request.type !== input.searchType ||
    new Set(pull.rows.map((row) => row.keys?.[0])).size !== pull.rows.length ||
    !pull.rows.every(validRelevance) ||
    !destination ||
    !sourcePage ||
    sourcePage.impressions < 5
  )
    return {
      availability: "insufficient" as const,
      reasons: [
        "Both pages need matching, unsampled query relevance evidence before proposing a link.",
      ],
    };
  const { captureLinkSource } = await import("./linkSource");
  const captured = await captureLinkSource(
    input.sourceUrl,
    input.targetUrl,
    context.project.domain,
  );
  const evidence = snapshotFromPage(report, context);
  const finding = detectInternalLink({
    evidence,
    phrase: input.phrase,
    source: captured,
    destination: {
      url: input.targetUrl,
      impressions: destination.impressions,
      position: destination.position,
    },
  });
  const raw = {
    source: captured,
    query: input.phrase,
    queryPageRows: pull.rows,
    queryRequest: pull.request,
  };
  if (!finding) {
    const destinationUrl = new URL(input.targetUrl);
    destinationUrl.hash = "";
    const alreadyLinked = captured.links?.some((link) => {
      try {
        const resolved = new URL(link, captured.url);
        resolved.hash = "";
        return resolved.href === destinationUrl.href;
      } catch {
        return false;
      }
    });
    if (
      alreadyLinked &&
      captured.statusCode === 200 &&
      captured.url === input.sourceUrl &&
      evidence.coverage.complete &&
      evidence.coverage.finalData &&
      !evidence.coverage.truncated &&
      evidence.coverage.currentRows > 0
    ) {
      // A successful capture can disprove this one pair. It says nothing about
      // other links, and does not verify who implemented the observed link.
      const evidenceSnapshotId = await retainEvidence(
        {
          ...evidence,
          source: "Google Search Console and captured HTML",
          fetchedAt: captured.capturedAt,
        },
        raw,
      );
      await OpportunityRepository.reconcileObserved(scoped(context), {
        scopeKey: await digest(evidence.scope),
        detectorId: "content-internal-link",
        observedDedupeKeys: [],
        examinedDedupeKey: await opportunityDedupeKey(
          evidence.scope,
          "internal_link",
          input.sourceUrl,
          [input.sourceUrl, input.targetUrl],
        ),
        evidenceSnapshotId,
        complete: true,
        fetchedAt: captured.capturedAt,
        window: evidence.window,
      });
      return {
        availability: "no_longer_observed" as const,
        reasons: [
          "Destination is already linked in captured HTML; this does not verify who implemented it.",
        ],
      };
    }
    return {
      availability: "insufficient" as const,
      reasons: [
        "No eligible unlinked source paragraph was captured, the destination is already linked, or evidence is insufficient.",
      ],
    };
  }
  const opportunity = await persistFinding(
    finding,
    context,
    "content-internal-link",
    raw,
  );
  return { availability: "ready" as const, opportunity };
}
