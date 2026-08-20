import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { domainOverviewResultSchema } from "@/types/schemas/domain";
import { backlinksOverviewCacheSchema } from "@/types/schemas/backlinks-results";
import { normalizeDomain } from "@/types/schemas/domain";
import { describeSnapshotGap } from "@/client/features/report/reportReads";

/**
 * The two free snapshots the report reuses: the last domain overview and the
 * last backlink analysis, both restored from runs the project already paid for.
 *
 * Split out of `useClientReportData` so the restore's own verdict survives the
 * trip. The report used to destructure `{ restored }` alone, which flattened
 * "the restore failed", "the payload expired out of R2", "the stored shape no
 * longer parses" and "there is a snapshot but it is about another domain" into
 * one null — and every one of those printed to the client as "no analysis has
 * been saved for this domain".
 */

function toComparableDomain(value: string): string | null {
  try {
    return normalizeDomain(value.replace(/^\*\./, ""));
  } catch {
    return null;
  }
}

function reportSnapshotMatchesDomain(
  snapshotTarget: string,
  projectDomain: string,
): boolean {
  const snapshotDomain = toComparableDomain(snapshotTarget);
  const normalizedProjectDomain = toComparableDomain(projectDomain);
  return (
    snapshotDomain != null &&
    normalizedProjectDomain != null &&
    snapshotDomain === normalizedProjectDomain
  );
}

export function useReportSnapshots(projectId: string, domain: string | null) {
  const hasDomain = Boolean(domain);
  const domainRun = useAutoRestoredRun({
    projectId,
    feature: RUN_FEATURES.domainOverview,
    schema: domainOverviewResultSchema,
    enabled: hasDomain,
  });
  const backlinksRun = useAutoRestoredRun({
    projectId,
    feature: RUN_FEATURES.backlinks,
    schema: backlinksOverviewCacheSchema,
    enabled: hasDomain,
  });

  const domainOtherDomain = Boolean(
    domainRun.restored &&
    domain &&
    !reportSnapshotMatchesDomain(domainRun.restored.result.domain, domain),
  );
  const backlinksOtherDomain = Boolean(
    backlinksRun.restored &&
    domain &&
    !(
      backlinksRun.restored.result.overview.scope === "domain" &&
      reportSnapshotMatchesDomain(
        backlinksRun.restored.result.overview.target,
        domain,
      )
    ),
  );

  const matchingDomainRun =
    domainRun.restored && !domainOtherDomain ? domainRun.restored : null;
  const matchingBacklinksRun =
    backlinksRun.restored && !backlinksOtherDomain
      ? backlinksRun.restored
      : null;

  return {
    domainOverview: matchingDomainRun?.result ?? null,
    backlinks: matchingBacklinksRun?.result.overview ?? null,
    domainSnapshotMissing: hasDomain && matchingDomainRun == null,
    backlinksSnapshotMissing: hasDomain && matchingBacklinksRun == null,
    // Null for the ordinary never-run case, so each chapter still words that
    // one itself and names the analysis the client should ask for.
    domainSnapshotGap: describeSnapshotGap({
      subject: "the saved domain overview",
      isError: domainRun.isError,
      restoring: domainRun.isRestoring,
      outcome: domainRun.outcome,
      otherDomain: domainOtherDomain,
    }),
    backlinksSnapshotGap: describeSnapshotGap({
      subject: "the saved backlink analysis",
      isError: backlinksRun.isError,
      restoring: backlinksRun.isRestoring,
      outcome: backlinksRun.outcome,
      otherDomain: backlinksOtherDomain,
    }),
  };
}
