import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  aiRewritableIds,
  elementProgress,
  groupByPage,
  pendingIds,
  summarize,
  type FixRow,
  type OnPageStatus,
} from "@/client/features/onpage/onPageModel";
import {
  PageGroupCard,
  ProgressTiles,
  RecommendedFixesBanner,
  StatusFilter,
} from "@/client/features/onpage/OnPageParts";
import {
  generateOnPageFixes,
  getOnPageFixes,
  rewriteOnPageFixes,
  setOnPageFixStatus,
} from "@/serverFunctions/onPage";

type StatusValue = "all" | OnPageStatus;

export function OnPageFixesPage({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<StatusValue>("pending");

  const fixesQuery = useQuery({
    queryKey: ["onPageFixes", projectId],
    queryFn: () => getOnPageFixes({ data: { projectId } }),
    staleTime: 60_000,
  });
  // Memoized so its identity is stable across renders — the derived useMemos
  // below depend on it.
  const rows: FixRow[] = useMemo(
    () => fixesQuery.data?.rows ?? [],
    [fixesQuery.data],
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["onPageFixes", projectId] });

  const generateMutation = useMutation({
    mutationFn: () => generateOnPageFixes({ data: { projectId } }),
    onSuccess: (result) => {
      const bits = [`${result.added} new`];
      if (result.kept > 0) bits.push(`${result.kept} kept`);
      if (result.removed > 0) bits.push(`${result.removed} resolved`);
      toast.success(
        `Analyzed ${result.pagesAnalyzed} pages — ${bits.join(", ")}.` +
          (result.usedSearchConsole ? " Used Search Console queries." : ""),
      );
      void invalidate();
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Could not generate fixes")),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { ids: string[]; status: OnPageStatus }) =>
      setOnPageFixStatus({ data: { projectId, ...input } }),
    onSuccess: () => void invalidate(),
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Could not update")),
  });

  const rewriteMutation = useMutation({
    mutationFn: (ids: string[]) =>
      rewriteOnPageFixes({ data: { projectId, ids } }),
    onSuccess: (result) => {
      toast.success(`Rewrote ${result.rewritten} suggestions with AI.`);
      void invalidate();
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "AI rewrite is unavailable")),
  });

  const busy = statusMutation.isPending || generateMutation.isPending;

  const summary = useMemo(() => summarize(rows), [rows]);
  const tiles = useMemo(() => elementProgress(rows), [rows]);
  const groups = useMemo(() => groupByPage(rows, filter), [rows, filter]);
  const bannerElements = useMemo(
    () => tiles.map((tile) => tile.element),
    [tiles],
  );
  const rewritableCount = useMemo(() => aiRewritableIds(rows).length, [rows]);

  const counts = {
    all: summary.total,
    pending: summary.pending,
    approved: summary.approved,
    excluded: summary.excluded,
  };

  if (fixesQuery.isPending) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-base-content/60">
        <Loader2 className="size-4 animate-spin" /> Loading on-page fixes…
      </div>
    );
  }

  return (
    <div className="px-4 py-4 pb-24 md:px-6 md:py-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">On-Page Fixes</h1>
            <p className="text-sm text-base-content/70">
              Concrete title, meta, heading, and alt-text rewrites for your
              pages — informed by the searches each page already ranks for.
              Approve the ones you want.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {rewritableCount > 0 ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm gap-1.5"
                disabled={rewriteMutation.isPending}
                onClick={() => rewriteMutation.mutate(aiRewritableIds(rows))}
                title="Rewrite pending titles and descriptions with AI"
              >
                {rewriteMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Wand2 className="size-4" />
                )}
                AI rewrite ({rewritableCount})
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-primary btn-sm gap-1.5"
              disabled={generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
            >
              {generateMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {rows.length === 0 ? "Generate fixes" : "Re-scan"}
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-base-300 p-8 text-center">
            <p className="text-sm text-base-content/70">
              No fixes yet. Generation reads your latest site audit and Search
              Console data — both free — and suggests specific rewrites. Run a
              site audit first if you haven&apos;t.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-sm mt-4 gap-1.5"
              disabled={generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
            >
              {generateMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Generate fixes
            </button>
          </div>
        ) : (
          <>
            <ProgressTiles tiles={tiles} />
            <RecommendedFixesBanner
              total={summary.total}
              elements={bannerElements}
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusFilter
                value={filter}
                onChange={setFilter}
                counts={counts}
              />
              {summary.pending > 0 ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() =>
                    statusMutation.mutate({
                      ids: pendingIds(rows),
                      status: "approved",
                    })
                  }
                >
                  Approve all pending ({summary.pending})
                </button>
              ) : null}
            </div>

            {groups.length === 0 ? (
              <p className="p-6 text-center text-sm text-base-content/60">
                No {filter === "all" ? "" : filter} fixes.
              </p>
            ) : (
              <div className="space-y-3">
                {groups.map((group) => (
                  <PageGroupCard
                    key={group.url}
                    group={group}
                    busy={busy}
                    onApprove={(id) =>
                      statusMutation.mutate({ ids: [id], status: "approved" })
                    }
                    onExclude={(id) =>
                      statusMutation.mutate({ ids: [id], status: "excluded" })
                    }
                    onApprovePage={(ids) =>
                      statusMutation.mutate({ ids, status: "approved" })
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
