import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { TrendUp } from "@phosphor-icons/react";
import { buttonVariants } from "@cloudflare/kumo/components/button";
import {
  AppDataTable,
  useAppTable,
} from "@/client/components/table/AppDataTable";
import type { CompetitorRow } from "@/server/features/competitors/services/CompetitorsService";
import type { DiscoveryMode } from "@/types/schemas/competitors";
import { buildCompetitorColumns } from "./CompetitorsTableColumns";
import { CompetitorsNonCompetitorsSection } from "./CompetitorsNonCompetitorsSection";
import { groupCompetitorRows } from "./groupCompetitorRows";
import { rankTrackingHandoff } from "./rankTrackingHandoff";
import {
  useRemoveProjectCompetitorMutation,
  useSetProjectCompetitorMutation,
} from "./useCompetitorsQueries";

/**
 * "Start tracking this competitor's positions" -- the row's domain handed to
 * Rank Tracking, which opens that domain's existing tracker or a create form
 * already filled in (see `rankTrackingHandoff`).
 *
 * Its natural home is `RowActionsCell` in `CompetitorsTableColumns`, beside
 * Keyword Gap. That cell is built purely from callback props, though, and this
 * is a navigation rather than a callback -- a `Link` there would drag the
 * router into a file whose test deliberately imports nothing but column defs.
 * So it is its own column, spliced in just BEFORE the actions column: that
 * puts it next to the other navigational action rather than past the
 * destructive ones (exclude, unpin).
 */
function trackRankColumn(projectId: string): ColumnDef<CompetitorRow> {
  return {
    id: "trackRank",
    header: "",
    meta: { headerClassName: "text-right", cellClassName: "text-right" },
    cell: ({ row }) => (
      <Link
        {...rankTrackingHandoff(projectId, row.original.domain)}
        className={buttonVariants({ variant: "ghost", size: "xs" })}
        title={`Track ${row.original.domain}'s keyword positions`}
      >
        <TrendUp className="size-3.5" />
        Track
      </Link>
    ),
  };
}

export function CompetitorsTable({
  rows,
  projectId,
  discoveryMode,
  seedSize,
  onCompareCompetitor,
}: {
  rows: CompetitorRow[];
  projectId: string;
  /** Which single mode produced this ENTIRE result set -- see
   *  `buildCompetitorColumns`'s doc comment for why this is page-level,
   *  never read off each row's own `source`. */
  discoveryMode: DiscoveryMode;
  /** How many seed keywords the answer was drawn from; 0 on the fallback
   *  (`discoveryMode === "domain"`) path. */
  seedSize: number;
  onCompareCompetitor: (domain: string) => void;
}) {
  // The mutation hooks live here rather than inside `CompetitorsTableColumns`
  // (which only builds column defs from plain callback props) so that file
  // stays free of any import reaching `@/serverFunctions/*` -- pulling that
  // in is what makes `CompetitorsTableColumns.test.ts` drag in this app's
  // server-only dependency graph (down to `cloudflare:workers`), which a
  // test of pure display formatting has no business touching.
  const setMutation = useSetProjectCompetitorMutation(projectId);
  const removeMutation = useRemoveProjectCompetitorMutation(projectId);

  const pendingDomain = setMutation.isPending
    ? (setMutation.variables?.domain ?? null)
    : removeMutation.isPending
      ? (removeMutation.variables?.domain ?? null)
      : null;

  const columns = useMemo(
    () => {
      const built = buildCompetitorColumns({
        discoveryMode,
        seedSize,
        actions: {
          onCompareCompetitor,
          onPin: (domain) => setMutation.mutate({ domain, status: "pinned" }),
          onUnpin: (domain) =>
            removeMutation.mutate({ domain, reason: "unpin" }),
          onExclude: (domain) =>
            setMutation.mutate({ domain, status: "excluded" }),
          pendingDomain,
        },
      });
      // Falls back to appending if that file ever renames its actions column,
      // so a missing id costs the Track link its position, never its presence.
      const at = built.findIndex((column) => column.id === "actions");
      const track = trackRankColumn(projectId);
      return at === -1 ? [...built, track] : built.toSpliced(at, 0, track);
    },
    // setMutation/removeMutation are new objects each render (useMutation's
    // return value is not referentially stable), so depending on them
    // directly would rebuild the column set every render regardless of
    // whether anything meaningful changed -- .mutate itself IS stable
    // (TanStack Query memoizes it), which is all these columns close over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      discoveryMode,
      seedSize,
      projectId,
      onCompareCompetitor,
      pendingDomain,
      setMutation.mutate,
      removeMutation.mutate,
    ],
  );

  // Splits platforms/aggregators the classifier recognised out of the main
  // table -- a stable partition of the SAME server-ranked rows, never a
  // re-sort (see groupCompetitorRows's own doc comment). Memoized so this
  // only recomputes when the rows themselves change, not on every render
  // (columns/pendingDomain etc. change far more often).
  const { competitors, notCompetitors } = useMemo(
    () => groupCompetitorRows(rows),
    [rows],
  );

  const table = useAppTable({ data: competitors, columns });

  return (
    <>
      <AppDataTable
        table={table}
        empty={
          <div className="px-4 py-8 text-center text-sm text-base-content/60">
            No competitors found. Try a domain with more organic visibility.
          </div>
        }
      />
      <CompetitorsNonCompetitorsSection
        rows={notCompetitors}
        columns={columns}
      />
    </>
  );
}
