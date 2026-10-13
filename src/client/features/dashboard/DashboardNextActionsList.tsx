import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "@phosphor-icons/react";
import type { Opportunity } from "@/client/features/opportunities/opportunityModel";
// Keep URL display independent of server-backed query hooks.
function toPath(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}

/** A compact, read-only view of existing keyword opportunities. Measured
 * evidence stays visible; hypothetical click gains are deliberately omitted. */
export function DashboardNextActionsList({
  projectId,
  rows,
}: {
  projectId: string;
  rows: Opportunity[];
}) {
  return (
    <ol className="divide-y divide-base-300">
      {rows.slice(0, 3).map((row) => (
        <li
          key={`${row.kind}-${row.query}-${row.page}`}
          className="py-3 first:pt-0 last:pb-0"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-base-content/70">
                {row.kind === "ctr"
                  ? "Review click-through rate"
                  : "Investigate ranking opportunity"}
              </p>
              <h3 className="mt-1 break-words text-sm font-semibold text-base-content">
                {row.query}
              </h3>
            </div>
            <Link
              to={
                row.kind === "ctr"
                  ? "/p/$projectId/search-performance"
                  : "/p/$projectId/content"
              }
              params={{ projectId }}
              search={
                row.kind === "ctr"
                  ? { q: row.query, tab: "ctr" }
                  : { q: row.query }
              }
              aria-label={`Investigate ${row.query}`}
              className="app-touch-target inline-flex shrink-0 items-center gap-1 rounded-md border border-base-300 px-2.5 py-1.5 text-xs font-medium hover:bg-base-200"
            >
              Investigate{" "}
              <ArrowUpRight aria-hidden="true" className="size-3.5" />
            </Link>
          </div>
          <p className="mt-2 text-xs text-base-content/70 tabular-nums">
            Average position {row.position.toFixed(1)} ·{" "}
            {row.impressions.toLocaleString("en-US")} impressions
          </p>
          <Link
            to="/p/$projectId/on-page"
            params={{ projectId }}
            search={{ u: row.page }}
            className="mt-1 block max-w-full truncate text-xs text-primary underline-offset-2 hover:underline"
            title={`Review page: ${row.page}`}
          >
            {toPath(row.page)}
          </Link>
        </li>
      ))}
    </ol>
  );
}
