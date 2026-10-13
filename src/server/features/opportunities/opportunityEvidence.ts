import { env } from "cloudflare:workers";
import { resolveDateRange } from "@/server/features/gsc/searchAnalytics";
import type { getPagePerformance } from "@/server/features/page-explorer/services/pagePerformance";
import { AppError } from "@/server/lib/errors";
import type {
  EvidenceSnapshot,
  EvidenceScope,
  Opportunity,
  OpportunityFinding,
} from "@/shared/opportunities";
import type { RefreshOpportunitiesInput } from "@/types/schemas/opportunities";
import { evidenceSnapshotSchema } from "@/types/schemas/opportunities";
import { OpportunityRepository } from "./OpportunityRepository";
export type OpportunityContext = {
  organizationId: string;
  projectId: string;
  userId: string;
  project: { domain: string | null };
};
export const DETECTOR_VERSION = "1";
function opportunityTarget(context: OpportunityContext): string {
  if (!context.project.domain) throw new AppError("PROJECT_DOMAIN_MISSING");
  return new URL(
    /^https?:\/\//i.test(context.project.domain)
      ? context.project.domain
      : `https://${context.project.domain}`,
  ).hostname;
}
export function scoped(context: OpportunityContext) {
  return {
    organizationId: context.organizationId,
    projectId: context.projectId,
    target: opportunityTarget(context),
  };
}
export function evidenceScope(
  context: OpportunityContext,
  input: Pick<RefreshOpportunitiesInput, "country" | "device" | "searchType">,
  siteUrl: string,
  connectedBy: string | null,
): EvidenceScope {
  return {
    ...scoped(context),
    siteUrl,
    connectedBy,
    country: input.country ?? null,
    device: input.device ?? null,
    searchType: input.searchType,
  };
}
export async function digest(value: unknown) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export function opportunityDedupeKey(
  scope: EvidenceScope,
  kind: OpportunityFinding["kind"],
  url: string,
  assets: string[],
) {
  return digest({ scope, kind, url, assets });
}

/** Immutable content-addressed evidence. R2 failure must stop task creation. */
export async function retainEvidence(
  evidence: EvidenceSnapshot,
  raw: unknown = null,
): Promise<string> {
  const value = evidenceSnapshotSchema.parse(evidence);
  const payload = JSON.stringify({ schemaVersion: 1, evidence: value, raw });
  const hash = await digest({ schemaVersion: 1, evidence: value, raw });
  const key = `opportunity-evidence/${encodeURIComponent(value.scope.organizationId)}/${encodeURIComponent(value.scope.projectId)}/${hash}.json`;
  await env.R2.put(key, payload, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: "application/json" },
  });
  await OpportunityRepository.putSnapshot(value, hash, key);
  return hash;
}
export async function persistFinding(
  finding: OpportunityFinding,
  context: OpportunityContext,
  detectorId: string,
  raw: unknown = null,
): Promise<Opportunity> {
  const scope = finding.evidence.scope;
  const scopeKey = await digest(scope);
  const dedupeKey = await opportunityDedupeKey(
    scope,
    finding.kind,
    finding.url,
    finding.assetRefs,
  );
  const snapshotId = await retainEvidence(finding.evidence, raw);
  return OpportunityRepository.upsertFinding({
    scope,
    scopeKey,
    dedupeKey,
    detectorId,
    detectorVersion: DETECTOR_VERSION,
    finding,
    snapshotId,
    actorUserId: context.userId,
  });
}

type PagePerformance = Extract<
  Awaited<ReturnType<typeof getPagePerformance>>,
  { connected: true }
>;
export function snapshotFromPage(
  report: PagePerformance,
  context: OpportunityContext,
): EvidenceSnapshot {
  const { coverage, range, scope } = report;
  return {
    schemaVersion: 1,
    source: "Google Search Console",
    fetchedAt: report.fetchedAt,
    scope: evidenceScope(
      context,
      {
        country: scope.country,
        device: scope.device,
        searchType: scope.searchType,
      },
      scope.siteUrl,
      scope.connectedBy,
    ),
    url: scope.url,
    window: { startDate: range.startDate, endDate: range.endDate },
    previousWindow: {
      startDate: range.prevStartDate,
      endDate: range.prevEndDate,
    },
    current: {
      ...report.totals,
      position: report.totals.impressions ? report.totals.position : null,
    },
    previous: {
      ...report.prevTotals,
      position: report.prevTotals.impressions
        ? report.prevTotals.position
        : null,
    },
    coverage: {
      finalData: coverage.finalData,
      currentRows: coverage.currentRows,
      previousRows: coverage.previousRows,
      truncated: coverage.currentTruncated || coverage.previousTruncated,
      complete:
        !coverage.currentTruncated &&
        !coverage.previousTruncated &&
        range.endDate <= resolveDateRange({ dateRange: "last_7_days" }).endDate,
    },
    limitations: [
      "Query details are a top-row sample; page totals use exact-page daily observations. No cause or expected traffic gain is asserted.",
    ],
  };
}
