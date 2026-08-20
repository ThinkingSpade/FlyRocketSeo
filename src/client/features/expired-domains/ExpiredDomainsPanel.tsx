import { runExpiredDomainSearch } from "@/serverFunctions/expiredDomains";
import {
  createMeteredRunKey,
  useAuthorizedRun,
  useMeteredQuery,
} from "@/client/lib/useMeteredQuery";
import { InlineQueryError } from "@/client/components/InlineQueryError";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import type { DomainExpirationStatus } from "@/shared/domainExpiration";
import {
  filterFinderRows,
  type FinderStatusFilter,
} from "@/shared/expiredDomains";
import { Button } from "@cloudflare/kumo/components/button";
import { Loader } from "@cloudflare/kumo/components/loader";
import { useMemo, useState } from "react";
import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { expiredDomainsResultSchema } from "@/types/schemas/expiredDomains";

const DEFAULT_CAP = 50;
const CREDITS_PER_LOOKUP = 5;

const STATUS_LABELS: Record<DomainExpirationStatus, string> = {
  expired: "Expired",
  critical: "Expires soon",
  warning: "Renew this quarter",
  healthy: "Healthy",
};

const STATUS_CLASSES: Record<DomainExpirationStatus, string> = {
  expired: "text-error",
  critical: "text-error",
  warning: "text-warning",
  healthy: "text-success",
};

function formatDays(value: number | null): string {
  return value == null ? "—" : Math.round(value).toLocaleString();
}

/** `null` is genuinely unknown and must not read as "taken". */
function availabilityLabel(available: boolean | null): string {
  if (available === null) return "Unknown";
  return available ? "Available" : "Taken";
}

/** Turns the stored evidence back into the reason this row is on screen. */
function reasonFor(evidence: {
  linksToCompetitors: string[];
  ranksForKeywords: string[];
  isKnownCompetitor: boolean;
}): string {
  const parts: string[] = [];
  if (evidence.linksToCompetitors.length > 0) {
    parts.push(
      `links to ${evidence.linksToCompetitors.length} of your competitors`,
    );
  }
  if (evidence.ranksForKeywords.length > 0) {
    parts.push(
      `ranks for ${evidence.ranksForKeywords.length} of your keywords`,
    );
  }
  if (evidence.isKnownCompetitor) parts.push("on your competitor list");
  return parts.length > 0 ? parts.join(" · ") : "in your niche graph";
}

/**
 * Expired and expiring domains drawn from this project's own niche graph.
 *
 * Two things this panel must get right:
 *
 * 1. It spends nothing until clicked, and the ceiling is quoted BEFORE the
 *    click -- not discovered afterwards.
 * 2. "Nothing found" is the COMMON outcome for a healthy niche, so the empty
 *    state reports what was actually examined. A blank card would read as
 *    broken.
 */
export function ExpiredDomainsPanel({
  projectId,
  domain,
}: {
  projectId: string;
  domain: string;
}) {
  const run = useAuthorizedRun(
    createMeteredRunKey(projectId, domain.trim(), 1),
  );
  const searchQuery = useMeteredQuery({
    authorized: run.authorized,
    runNonce: run.runNonce,
    queryKey: ["expired-domains", projectId, domain],
    queryFn: () =>
      runExpiredDomainSearch({ data: { projectId, cap: DEFAULT_CAP } }),
  });

  // Restoring reads a stored row plus the R2 object that run already paid for,
  // so it can never bill. It is enabled only while this tab has no live result
  // of its own, and the live query stays disabled until an explicit click --
  // which is what keeps a restored table from re-triggering a paid search.
  const { restored } = useAutoRestoredRun({
    projectId,
    feature: RUN_FEATURES.expiredDomains,
    schema: expiredDomainsResultSchema,
    enabled: !run.authorized && !searchQuery.data,
  });

  const result = searchQuery.data ?? restored?.result ?? null;
  const isRestored = !searchQuery.data && restored != null;

  const [statusFilter, setStatusFilter] = useState<FinderStatusFilter>("all");
  const [query, setQuery] = useState("");
  // Filtering is client-side over rows already paid for -- changing a filter
  // must never re-request anything.
  const visibleRows = useMemo(
    () =>
      result
        ? filterFinderRows(result.rows, { status: statusFilter, query })
        : [],
    [result, statusFilter, query],
  );

  return (
    <div
      data-testid="expired-domains-panel"
      className="relative flex flex-col rounded-xl border border-base-300 bg-base-100"
    >
      <div className="flex flex-auto flex-col gap-3 p-4 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs uppercase tracking-wide text-base-content/60">
            Expired domains in your niche
          </p>
        </div>

        {isRestored && result ? (
          <p className="text-xs text-base-content/60">
            Showing your last search from{" "}
            {new Date(restored.lastRanAt).toLocaleDateString()}. Re-running
            costs credits again.
          </p>
        ) : null}

        {!run.authorized && !isRestored ? (
          <div className="flex flex-col gap-2">
            <p className="text-base-content/70">
              Checks the domains that link to your competitors and rank for your
              keywords, and reports any that have lapsed or are about to.
            </p>
            {/* The ceiling, quoted before a single credit is spent. Availability
                is excluded on purpose: it is charged only for domains that turn
                out to be expired, which is usually none. */}
            <p className="text-xs text-base-content/60">
              Up to {DEFAULT_CAP} domains — up to{" "}
              {(DEFAULT_CAP * CREDITS_PER_LOOKUP).toLocaleString()} APIVerve
              credits, plus a few more if any have lapsed. Also runs two
              DataForSEO lookups: one link-gap call, and one SERP call priced
              per rank-tracked keyword.
            </p>
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="self-start"
              onClick={() => run.authorize()}
            >
              Find expired domains
            </Button>
          </div>
        ) : run.authorized && searchQuery.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader size="sm" />
          </div>
        ) : run.authorized && searchQuery.isError ? (
          <InlineQueryError
            message={getStandardErrorMessage(
              searchQuery.error,
              "The expired-domain search could not be completed.",
            )}
            retrying={searchQuery.isFetching}
            onRetry={() => void searchQuery.refetch()}
          />
        ) : result ? (
          <>
            {result.rows.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    ["all", "All"],
                    ["expired", "Expired only"],
                    ["critical", "Expires soon"],
                    ["warning", "This quarter"],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={statusFilter === value ? "primary" : "ghost"}
                    aria-pressed={statusFilter === value}
                    onClick={() => setStatusFilter(value)}
                  >
                    {label}
                  </Button>
                ))}
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter by domain"
                  aria-label="Filter by domain"
                  className="input input-sm input-bordered ml-auto w-48"
                />
              </div>
            ) : null}

            {visibleRows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Domain</th>
                      <th>Status</th>
                      <th>Days</th>
                      <th>Availability</th>
                      <th>Why it is here</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <tr key={row.domain}>
                        <td className="font-medium">{row.domain}</td>
                        <td className={STATUS_CLASSES[row.status]}>
                          {STATUS_LABELS[row.status]}
                        </td>
                        <td>{formatDays(row.expiration.daysToExpiration)}</td>
                        <td>{availabilityLabel(row.available)}</td>
                        <td className="text-base-content/70">
                          {reasonFor(row.evidence)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : result.rows.length > 0 ? (
              // Filtered to nothing is a different message from found nothing.
              <p className="py-4 text-base-content/70">
                None of the {result.rows.length} results match this filter.
              </p>
            ) : (
              // Shows its work. "Nothing found" over 50 checked domains is a
              // real, informative answer; a blank card is not.
              <p className="py-4 text-base-content/70">
                Checked {result.summary.checked}{" "}
                {result.summary.checked === 1 ? "domain" : "domains"}
                {result.sourcesUsed.length > 0
                  ? ` from ${result.sourcesUsed.join(" and ")}`
                  : ""}{" "}
                — none have expired.
              </p>
            )}

            <p className="text-xs text-base-content/60">
              {result.summary.checked} checked · {result.summary.surfaced}{" "}
              surfaced
              {result.summary.failed > 0
                ? ` · ${result.summary.failed} did not answer`
                : ""}
            </p>

            {isRestored ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() => run.authorize()}
              >
                Search again ({DEFAULT_CAP * CREDITS_PER_LOOKUP} credits)
              </Button>
            ) : null}

            {result.sourcesSkipped.length > 0 ? (
              // The bug this fixes: a source that returned nothing was counted
              // as searched, so a run on a project with no competitors reported
              // full coverage and simply looked weak.
              <p className="text-xs text-warning">
                Not searched:{" "}
                {result.sourcesSkipped
                  .map((skip) => `${skip.source} (${skip.reason})`)
                  .join("; ")}
                .
              </p>
            ) : null}

            {result.sourceErrors.length > 0 ? (
              // A source that failed is named rather than silently reducing
              // coverage -- otherwise the counts above would overstate what was
              // actually searched.
              <p className="text-xs text-warning">
                Could not search:{" "}
                {result.sourceErrors.map((error) => error.source).join(", ")}.
                Results cover the remaining sources only.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
