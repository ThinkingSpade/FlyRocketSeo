import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Loader2,
} from "lucide-react";
import { getAuditHistory, getAuditResults } from "@/serverFunctions/audit";
import type { AuditResultsData } from "@/client/features/audit/results/types";
import {
  computeAuditDiff,
  type AuditDiff,
  type ChangedPage,
  type PageRef,
} from "@/client/features/audit/results/auditDiff";
import {
  extractPathname,
  formatStartedAt,
  HttpStatusBadge,
} from "@/client/features/audit/shared";

const NO_COMPARISON = "none";
const MAX_LISTED_PAGES = 25;

export function AuditComparison({
  projectId,
  current,
}: {
  projectId: string;
  current: AuditResultsData;
}) {
  const currentAuditId = current.audit.id;
  const historyQuery = useQuery({
    queryKey: ["audit-history", projectId],
    queryFn: () => getAuditHistory({ data: { projectId } }),
  });

  const comparableRuns = useMemo(() => {
    const runs = historyQuery.data ?? [];
    return runs
      .filter((run) => run.status === "completed" && run.id !== currentAuditId)
      .toSorted(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      );
  }, [historyQuery.data, currentAuditId]);

  // The natural "previous run": the most recent completed run started before
  // the one currently open. Highlighted in the list, but compare stays opt-in.
  const previousRunId = useMemo(() => {
    const currentStarted = new Date(current.audit.startedAt).getTime();
    return (
      comparableRuns.find(
        (run) => new Date(run.startedAt).getTime() < currentStarted,
      )?.id ?? null
    );
  }, [comparableRuns, current.audit.startedAt]);

  const [comparisonId, setComparisonId] = useState<string>(NO_COMPARISON);

  const comparisonQuery = useQuery({
    queryKey: ["audit-results", projectId, comparisonId],
    queryFn: () =>
      getAuditResults({ data: { projectId, auditId: comparisonId } }),
    enabled: comparisonId !== NO_COMPARISON,
  });

  const diff = useMemo<AuditDiff | null>(() => {
    if (comparisonId === NO_COMPARISON || !comparisonQuery.data) return null;
    return computeAuditDiff(current, comparisonQuery.data);
  }, [comparisonId, comparisonQuery.data, current]);

  // Nothing to compare against — don't clutter the view with an empty control.
  if (comparableRuns.length === 0) return null;

  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-base font-medium">Compare to previous run</h3>
          <div className="flex items-center gap-2">
            {comparisonQuery.isFetching && (
              <Loader2 className="size-4 animate-spin text-base-content/50" />
            )}
            <select
              className="select select-bordered select-sm w-full sm:w-auto max-w-xs"
              value={comparisonId}
              onChange={(event) => setComparisonId(event.target.value)}
              aria-label="Comparison run"
            >
              <option value={NO_COMPARISON}>No comparison</option>
              {comparableRuns.map((run) => {
                const pageCount = run.pagesTotal || run.pagesCrawled;
                return (
                  <option key={run.id} value={run.id}>
                    {formatStartedAt(run.startedAt)} · {pageCount} pages
                    {run.id === previousRunId ? " (previous)" : ""}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {comparisonId !== NO_COMPARISON &&
          (comparisonQuery.isError ? (
            <div className="alert alert-error text-sm py-2">
              <AlertCircle className="size-4" />
              <span>
                Couldn't load that comparison run. Try selecting another one.
              </span>
            </div>
          ) : diff ? (
            <ComparisonSummary diff={diff} />
          ) : (
            <div className="flex items-center gap-2 text-sm text-base-content/60 py-2">
              <Loader2 className="size-4 animate-spin" />
              Loading comparison…
            </div>
          ))}
      </div>
    </div>
  );
}

function ComparisonSummary({ diff }: { diff: AuditDiff }) {
  const { lighthouse } = diff;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {diff.hasLighthouse && (
          <>
            <ComparisonMetric
              label="Avg Performance"
              current={formatScore(lighthouse.current.avgPerformance)}
              previous={formatScore(lighthouse.comparison.avgPerformance)}
              delta={lighthouse.performanceDelta}
            />
            <ComparisonMetric
              label="Avg SEO"
              current={formatScore(lighthouse.current.avgSeo)}
              previous={formatScore(lighthouse.comparison.avgSeo)}
              delta={lighthouse.seoDelta}
            />
            <ComparisonMetric
              label="Avg Accessibility"
              current={formatScore(lighthouse.current.avgAccessibility)}
              previous={formatScore(lighthouse.comparison.avgAccessibility)}
              delta={lighthouse.accessibilityDelta}
            />
          </>
        )}
        <ComparisonMetric
          label="Pages"
          current={String(diff.currentPageCount)}
          previous={String(diff.comparisonPageCount)}
          delta={diff.pageCountDelta}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <PageDiffChip
          label="new"
          count={diff.newPages.length}
          className="badge-success"
        />
        <PageDiffChip
          label="removed"
          count={diff.removedPages.length}
          className="badge-error"
        />
        <PageDiffChip
          label="changed"
          count={diff.changedPages.length}
          className="badge-warning"
        />
      </div>

      <PageDiffDetails diff={diff} />
    </div>
  );
}

function ComparisonMetric({
  label,
  current,
  previous,
  delta,
}: {
  label: string;
  current: string;
  previous: string;
  delta: number | null;
}) {
  return (
    <div className="rounded-box border border-base-300 bg-base-200/40 p-3">
      <p className="text-xs uppercase tracking-wide text-base-content/60">
        {label}
      </p>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-semibold">{current}</span>
        <DeltaBadge delta={delta} />
      </div>
      <p className="text-xs text-base-content/50">was {previous}</p>
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) {
    return <span className="text-xs text-base-content/40">n/a</span>;
  }
  if (delta === 0) {
    return <span className="text-xs text-base-content/50">±0</span>;
  }
  const positive = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        positive ? "text-success" : "text-error"
      }`}
    >
      {positive ? (
        <ArrowUp className="size-3" />
      ) : (
        <ArrowDown className="size-3" />
      )}
      {positive ? "+" : ""}
      {delta}
    </span>
  );
}

function PageDiffChip({
  label,
  count,
  className,
}: {
  label: string;
  count: number;
  className: string;
}) {
  const active = count > 0;
  return (
    <span
      className={`badge badge-sm gap-1 ${
        active ? className : "badge-ghost text-base-content/50"
      }`}
    >
      <span className="font-semibold">{count}</span> {label}
    </span>
  );
}

function PageDiffDetails({ diff }: { diff: AuditDiff }) {
  const total =
    diff.newPages.length + diff.removedPages.length + diff.changedPages.length;
  if (total === 0) return null;

  return (
    <details className="rounded-box border border-base-300 bg-base-100">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm text-base-content/70">
        View page changes
      </summary>
      <div className="space-y-3 px-3 pb-3">
        <PageRefList
          title="New pages"
          pages={diff.newPages}
          emptyHint="No new pages"
        />
        <PageRefList
          title="Removed pages"
          pages={diff.removedPages}
          emptyHint="No removed pages"
        />
        <ChangedPageList pages={diff.changedPages} />
      </div>
    </details>
  );
}

function PageRefList({
  title,
  pages,
  emptyHint,
}: {
  title: string;
  pages: PageRef[];
  emptyHint: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-base-content/50">
        {title} ({pages.length})
      </p>
      {pages.length === 0 ? (
        <p className="text-xs text-base-content/40">{emptyHint}</p>
      ) : (
        <ul className="space-y-1">
          {pages.slice(0, MAX_LISTED_PAGES).map((page) => (
            <li key={page.url} className="flex items-center gap-2 text-xs">
              <HttpStatusBadge code={page.statusCode} />
              <span className="truncate text-base-content/80" title={page.url}>
                {extractPathname(page.url)}
              </span>
            </li>
          ))}
          <MoreRow shown={pages.length} />
        </ul>
      )}
    </div>
  );
}

function ChangedPageList({ pages }: { pages: ChangedPage[] }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-base-content/50">
        Changed pages ({pages.length})
      </p>
      {pages.length === 0 ? (
        <p className="text-xs text-base-content/40">No changed pages</p>
      ) : (
        <ul className="space-y-1">
          {pages.slice(0, MAX_LISTED_PAGES).map((page) => (
            <li
              key={page.url}
              className="flex flex-wrap items-center gap-2 text-xs"
            >
              {page.statusChanged ? (
                <span className="inline-flex items-center gap-1">
                  <HttpStatusBadge code={page.previousStatus} />
                  <ArrowRight className="size-3 text-base-content/40" />
                  <HttpStatusBadge code={page.currentStatus} />
                </span>
              ) : (
                <HttpStatusBadge code={page.currentStatus} />
              )}
              <span
                className="truncate text-base-content/80 min-w-0 flex-1"
                title={page.url}
              >
                {extractPathname(page.url)}
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <ScoreDelta label="Perf" delta={page.performanceDelta} />
                <ScoreDelta label="SEO" delta={page.seoDelta} />
                <ScoreDelta label="A11y" delta={page.accessibilityDelta} />
              </span>
            </li>
          ))}
          <MoreRow shown={pages.length} />
        </ul>
      )}
    </div>
  );
}

function ScoreDelta({ label, delta }: { label: string; delta: number | null }) {
  if (delta == null || delta === 0) return null;
  const positive = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${
        positive ? "text-success" : "text-error"
      }`}
    >
      {label}
      {positive ? "+" : ""}
      {delta}
    </span>
  );
}

function MoreRow({ shown }: { shown: number }) {
  if (shown <= MAX_LISTED_PAGES) return null;
  return (
    <li className="text-xs text-base-content/40">
      +{shown - MAX_LISTED_PAGES} more
    </li>
  );
}

function formatScore(score: number | null): string {
  return score == null ? "-" : String(score);
}
