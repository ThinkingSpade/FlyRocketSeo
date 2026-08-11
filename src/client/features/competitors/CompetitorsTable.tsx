import { useMemo } from "react";
import {
  AppDataTable,
  useAppTable,
} from "@/client/components/table/AppDataTable";
import type { CompetitorRow } from "@/server/features/competitors/services/CompetitorsService";
import type { DiscoveryMode } from "@/types/schemas/competitors";
import { buildCompetitorColumns } from "./CompetitorsTableColumns";
import {
  useRemoveProjectCompetitorMutation,
  useSetProjectCompetitorMutation,
} from "./useCompetitorsQueries";

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
    () =>
      buildCompetitorColumns({
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
      }),
    // setMutation/removeMutation are new objects each render (useMutation's
    // return value is not referentially stable), so depending on them
    // directly would rebuild the column set every render regardless of
    // whether anything meaningful changed -- .mutate itself IS stable
    // (TanStack Query memoizes it), which is all these columns close over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      discoveryMode,
      seedSize,
      onCompareCompetitor,
      pendingDomain,
      setMutation.mutate,
      removeMutation.mutate,
    ],
  );

  const table = useAppTable({ data: rows, columns });

  return (
    <AppDataTable
      table={table}
      empty={
        <div className="px-4 py-8 text-center text-sm text-base-content/60">
          No competitors found. Try a domain with more organic visibility.
        </div>
      }
    />
  );
}
