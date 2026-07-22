import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Radar, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getProjects } from "@/serverFunctions/projects";
import {
  analyzeProjectBrand,
  getBrandVisibilityHistory,
} from "@/serverFunctions/brandVisibility";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { parseCompetitorList } from "@/types/schemas/ai-search";
import type { BrandLookupResult } from "@/types/schemas/ai-search";
import { BrandLookupResults } from "@/client/features/ai-search/components/BrandLookupResults";
import {
  VisibilityOpportunities,
  VisibilityStatTiles,
  VisibilityTrendChart,
} from "@/client/features/ai-search/components/BrandVisibilityParts";

/**
 * The project-centric home of the Brand Lookup tab: one-click "Analyze <your
 * domain>" (metered, never automatic) that records a snapshot, plus the tracked
 * trend, since-last-check deltas, and improvement opportunities read back from
 * stored snapshots. Renders nothing when the project has no domain, so the tab
 * falls back to its ad-hoc search + recent-searches default.
 */
export function ProjectVisibilityPanel({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [competitorsInput, setCompetitorsInput] = useState("");
  const [freshResult, setFreshResult] = useState<BrandLookupResult | null>(
    null,
  );

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    staleTime: 5 * 60_000,
  });
  const domain =
    projectsQuery.data?.find((project) => project.id === projectId)?.domain ??
    null;

  const historyQuery = useQuery({
    queryKey: ["brandVisibility", projectId],
    queryFn: () => getBrandVisibilityHistory({ data: { projectId } }),
    enabled: Boolean(domain),
    staleTime: 60_000,
  });

  const analyzeMutation = useMutation({
    mutationFn: (competitors: string[]) =>
      analyzeProjectBrand({ data: { projectId, competitors } }),
    onSuccess: (result) => {
      setFreshResult(result);
      if (result.hasData) {
        toast.success(`Updated AI visibility for ${result.resolvedTarget}.`);
      } else {
        toast.message(`No AI mentions found for ${result.resolvedTarget} yet.`);
      }
      void queryClient.invalidateQueries({
        queryKey: ["brandVisibility", projectId],
      });
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Could not analyze")),
  });

  // Every hook is above this line; only now is it safe to bail out.
  if (!domain) return null;

  const history = historyQuery.data;
  const latest = history?.trend.latest ?? null;
  const analyzing = analyzeMutation.isPending;

  return (
    <section className="space-y-4 rounded-2xl border border-base-300 bg-base-200/40 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Radar className="mt-0.5 size-5 text-base-content/50" />
          <div>
            <h2 className="text-lg font-semibold">
              AI visibility for {domain}
            </h2>
            <p className="text-sm text-base-content/60">
              Track how ChatGPT and Google AI Overview cite you. Runs on click —
              no automatic spend.
              {history?.latestCapturedOn
                ? ` Last analyzed ${history.latestCapturedOn}.`
                : ""}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm gap-1.5"
          disabled={analyzing}
          onClick={() =>
            analyzeMutation.mutate(parseCompetitorList(competitorsInput))
          }
        >
          {analyzing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          {latest ? "Re-analyze" : `Analyze ${domain}`}
        </button>
      </div>

      <label className="flex flex-col gap-1 text-xs text-base-content/60 sm:max-w-md">
        Compare competitors (optional, comma-separated)
        <input
          type="text"
          className="input input-sm input-bordered w-full"
          placeholder="competitor-a.com, competitor-b.com"
          value={competitorsInput}
          onChange={(event) => setCompetitorsInput(event.target.value)}
          disabled={analyzing}
        />
      </label>

      {historyQuery.isPending && Boolean(domain) ? (
        <div className="flex items-center gap-2 py-4 text-sm text-base-content/60">
          <Loader2 className="size-4 animate-spin" /> Loading tracked
          visibility…
        </div>
      ) : latest ? (
        <div className="space-y-4">
          <VisibilityStatTiles
            latest={latest}
            delta={history?.trend.delta ?? null}
          />
          <VisibilityTrendChart series={history?.trend.series ?? []} />
          <VisibilityOpportunities
            opportunities={history?.opportunities ?? []}
          />
        </div>
      ) : !analyzing ? (
        <div className="rounded-xl border border-dashed border-base-300 bg-base-100 p-6 text-center text-sm text-base-content/70">
          You haven&apos;t analyzed {domain} yet. Run your first analysis to
          start tracking its AI-search visibility over time.
        </div>
      ) : null}

      {analyzing ? (
        <div className="flex items-center gap-2 py-2 text-sm text-base-content/60">
          <Loader2 className="size-4 animate-spin" /> Analyzing {domain} across
          ChatGPT and Google AI Overview…
        </div>
      ) : null}

      {freshResult ? (
        <div className="space-y-3 border-t border-base-300 pt-4">
          <h3 className="text-sm font-semibold text-base-content/70">
            Latest analysis
          </h3>
          <BrandLookupResults result={freshResult} projectId={projectId} />
        </div>
      ) : null}
    </section>
  );
}
