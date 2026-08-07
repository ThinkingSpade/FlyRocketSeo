import {
  meteredActionLabel,
  meteredEstimateNote,
} from "@/client/components/MeteredActionLabel";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { applyBillingMarkupUsd } from "@/shared/billing";
import {
  BRAND_LOOKUP_COMPETITOR_RAW_COST_USD,
  BRAND_LOOKUP_RAW_COST_USD,
} from "@/shared/analysis-costs";
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
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";

/**
 * The project-centric home of the Brand Lookup tab: one-click "Analyze <your
 * domain>" (metered, never automatic) that records a snapshot, plus the tracked
 * trend, since-last-check deltas, and improvement opportunities read back from
 * stored snapshots. Renders nothing when the project has no domain, so the tab
 * falls back to its ad-hoc search + recent-searches default.
 */

// The project analysis runs the same Brand Lookup fan-out, so it costs what that
// costs -- reuse the MEASURED constants rather than inventing a second figure.
// Hosted customers pay the marked-up price; self-hosted users pay DataForSEO
// directly, which is what `applyBillingMarkupUsd` is gated on.
const BRAND_ANALYSIS_DISPLAYED_COST_USD = isHostedClientAuthMode()
  ? applyBillingMarkupUsd(BRAND_LOOKUP_RAW_COST_USD)
  : BRAND_LOOKUP_RAW_COST_USD;
const BRAND_COMPETITOR_DISPLAYED_COST_USD = isHostedClientAuthMode()
  ? applyBillingMarkupUsd(BRAND_LOOKUP_COMPETITOR_RAW_COST_USD)
  : BRAND_LOOKUP_COMPETITOR_RAW_COST_USD;

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
        <Button
          type="button"
          variant="primary"
          size="sm"
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
          {meteredActionLabel(
            latest ? "Re-analyze" : `Analyze ${domain}`,
            { kind: "estimateUsd", usd: BRAND_ANALYSIS_DISPLAYED_COST_USD },
            true,
          )}
        </Button>
      </div>

      <label className="flex flex-col gap-1 text-xs text-base-content/60 sm:max-w-md">
        Compare competitors (optional, comma-separated)
        <Input
          passwordManagerIgnore
          type="text"
          size="sm"
          className="w-full"
          placeholder="competitor-a.com, competitor-b.com"
          value={competitorsInput}
          onChange={(event) => setCompetitorsInput(event.target.value)}
          disabled={analyzing}
        />
      </label>

      {/* The price lives here rather than on the button because the run is
          server-cached: a repeat inside the window spends nothing, so quoting a
          figure ON the control would overstate what pressing it costs. The
          competitor line is conditional because those two extra cross-platform
          calls only happen when the field has entries. */}
      <p className="text-xs text-base-content/50">
        {meteredEstimateNote(
          { kind: "estimateUsd", usd: BRAND_ANALYSIS_DISPLAYED_COST_USD },
          true,
        )}
        {parseCompetitorList(competitorsInput).length > 0
          ? ` Plus ~$${BRAND_COMPETITOR_DISPLAYED_COST_USD.toFixed(2)} to compare competitors.`
          : null}
      </p>

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
      ) : historyQuery.isError ? (
        // Before the first-run copy, always. A failed history read also leaves
        // `latest` null, and telling someone with stored snapshots that they
        // have never analyzed the domain invites them to pay for an analysis
        // they already have.
        <div className="rounded-xl border border-dashed border-base-300 bg-base-100 p-6 text-center text-sm text-base-content/70">
          Past analyses for {domain} could not be loaded, so the trend is
          unavailable. Any analyses you have run are still stored.
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
