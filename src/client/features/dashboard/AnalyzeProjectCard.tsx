import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Rocket, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { DashboardCard } from "@/client/features/dashboard/dashboardShared";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { applyBillingMarkupUsd } from "@/shared/billing";
import { BRAND_LOOKUP_RAW_COST_USD } from "@/shared/analysis-costs";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getDomainOverview } from "@/serverFunctions/domain";
import { getBacklinksOverview } from "@/serverFunctions/backlinks";
import { getCompetitorsList } from "@/serverFunctions/competitors";
import { analyzeProjectBrand } from "@/serverFunctions/brandVisibility";
import { getPageExplorer } from "@/serverFunctions/page-explorer";
import { researchKeywords } from "@/serverFunctions/keywords";
import { getKeywordTrends } from "@/serverFunctions/trends";
import { getSerpOverview } from "@/serverFunctions/serp";
import { getContentBrief } from "@/serverFunctions/content";
import { getTopicClusters } from "@/serverFunctions/topic-clusters";
import { startAudit } from "@/serverFunctions/audit";
import {
  SeedKeywordField,
  useSeedSuggestions,
} from "@/client/features/dashboard/SeedKeywordField";

/**
 * Runs the project's analyses in one go, so a new project stops being a grid of
 * empty tabs.
 *
 * Deliberately sequential and client-side: each analysis is its own request,
 * and therefore its own Worker invocation. A server-side loop would run all of
 * them inside one invocation and hit the free plan's fixed CPU ceiling — the
 * same limit that broke site audits.
 *
 * Every analysis here is METERED. Nothing starts without an explicit confirm,
 * and the estimate shown is only ever a measured figure — analyses we have no
 * measured cost for are labelled as such rather than given an invented number.
 *
 * Tabs deliberately absent: Local SEO, Local Rank Grid and Rank Tracking need a
 * business, a map location or a recurring schedule that cannot be guessed from
 * a domain; Saved Keywords is the user's own list; and GSC Insights, Link
 * Opportunities, Cannibalization, SEO Opportunities and the Client Report are
 * derived free from Search Console and need no run at all.
 */

const markup = (rawUsd: number) =>
  isHostedClientAuthMode() ? applyBillingMarkupUsd(rawUsd) : rawUsd;

const DEFAULT_LOCATION_CODE = 2840;

type RunStatus = "idle" | "running" | "done" | "failed";

type Analysis = {
  key: string;
  label: string;
  detail: string;
  /** Measured cost, or null when we have no profiled figure to quote. */
  estimateUsd: number | null;
  /** True when the analysis needs a seed keyword rather than just the domain. */
  needsKeyword?: boolean;
  run: (projectId: string, domain: string, keyword: string) => Promise<unknown>;
};

const ANALYSES: Analysis[] = [
  {
    key: "domain_overview",
    label: "Domain Overview",
    detail: "Traffic, keywords and ranking distribution",
    estimateUsd: null,
    run: (projectId, domain) =>
      getDomainOverview({
        data: {
          projectId,
          domain,
          includeSubdomains: true,
          locationCode: 2840,
          languageCode: "en",
        },
      }),
  },
  {
    key: "backlinks",
    label: "Backlinks",
    detail: "Domain rank, referring domains and link profile",
    estimateUsd: null,
    run: (projectId, domain) =>
      getBacklinksOverview({ data: { projectId, target: domain } }),
  },
  {
    key: "competitors",
    label: "Competitors",
    detail: "Domains competing for the same keywords",
    estimateUsd: null,
    run: (projectId, domain) =>
      getCompetitorsList({ data: { projectId, target: domain } }),
  },
  {
    key: "ai_visibility",
    label: "AI Visibility",
    detail: "How ChatGPT and Google AI Overview cite you",
    estimateUsd: markup(BRAND_LOOKUP_RAW_COST_USD),
    run: (projectId) =>
      analyzeProjectBrand({ data: { projectId, competitors: [] } }),
  },
  {
    key: "page_explorer",
    label: "Page Explorer",
    detail: "What the homepage itself ranks for",
    estimateUsd: null,
    run: (projectId, domain) =>
      getPageExplorer({ data: { projectId, url: `https://${domain}/` } }),
  },
  {
    key: "site_audit",
    label: "Site Audit",
    detail: "Crawls the site for technical issues (runs in the background)",
    estimateUsd: null,
    run: (projectId, domain) =>
      startAudit({ data: { projectId, startUrl: `https://${domain}/` } }),
  },
  {
    key: "keyword_research",
    label: "Keyword Research",
    detail: "Volume, difficulty and intent around the seed keyword",
    estimateUsd: null,
    needsKeyword: true,
    run: (projectId, _domain, keyword) =>
      researchKeywords({ data: { projectId, keywords: [keyword] } }),
  },
  {
    key: "serp_overview",
    label: "SERP Overview",
    detail: "Who ranks top-20 for the seed keyword, and how strong they are",
    estimateUsd: null,
    needsKeyword: true,
    run: (projectId, _domain, keyword) =>
      getSerpOverview({ data: { projectId, keyword } }),
  },
  {
    key: "content_brief",
    label: "Content Optimizer",
    detail: "Word-count targets, subtopics and questions to cover",
    estimateUsd: null,
    needsKeyword: true,
    run: (projectId, _domain, keyword) =>
      getContentBrief({ data: { projectId, keyword } }),
  },
  {
    key: "topic_clusters",
    label: "Topic Clusters",
    detail: "Hub-and-spoke content plan around the seed keyword",
    estimateUsd: null,
    needsKeyword: true,
    run: (projectId, _domain, keyword) =>
      getTopicClusters({ data: { projectId, topic: keyword } }),
  },
  {
    key: "keyword_trends",
    label: "Keyword Trends",
    detail: "Search interest for the seed keyword over time",
    estimateUsd: null,
    needsKeyword: true,
    run: (projectId, _domain, keyword) =>
      getKeywordTrends({
        data: {
          projectId,
          keywords: [keyword],
          languageCode: "en",
          locationCode: DEFAULT_LOCATION_CODE,
        },
      }),
  },
];

export function AnalyzeProjectCard({
  projectId,
  domain,
}: {
  projectId: string;
  domain: string | null;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(ANALYSES.map((analysis) => analysis.key)),
  );
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, RunStatus>>({});
  const [keywordInput, setKeywordInput] = useState("");

  // Both suggestion sources are free (Search Console, then the project's own
  // saved keywords). The first is pre-filled so one click still works with no
  // typing; the field and the chips let you change it.
  const suggestions = useSeedSuggestions(projectId);
  const seedValue = keywordInput || suggestions[0]?.keyword || "";
  const keyword = seedValue.trim();

  const chosen = ANALYSES.filter(
    (analysis) =>
      selected.has(analysis.key) && (keyword !== "" || !analysis.needsKeyword),
  );
  const skippedForKeyword = ANALYSES.filter(
    (analysis) =>
      selected.has(analysis.key) && analysis.needsKeyword && keyword === "",
  ).length;
  const quoted = chosen.filter((analysis) => analysis.estimateUsd != null);
  const knownTotal = quoted.reduce(
    (sum, analysis) => sum + (analysis.estimateUsd ?? 0),
    0,
  );
  const unquotedCount = chosen.length - quoted.length;

  if (!domain) {
    return (
      <DashboardCard icon={Rocket} title="Analyze this project">
        <p className="text-sm text-base-content/70">
          Add a domain to this project in Settings and you can run every
          analysis for it from here in one go.
        </p>
      </DashboardCard>
    );
  }

  // Captured after the guard above so the async runner below has a plain
  // string rather than re-narrowing a prop it closed over.
  const activeDomain = domain;

  const toggle = (key: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  async function runSelected() {
    setConfirming(false);
    setRunning(true);
    setStatuses(
      Object.fromEntries(chosen.map((analysis) => [analysis.key, "idle"])),
    );

    let failed = 0;
    // Sequential on purpose: one request per analysis keeps each inside its own
    // Worker invocation, and avoids firing a burst of metered calls at once.
    for (const analysis of chosen) {
      setStatuses((previous) => ({ ...previous, [analysis.key]: "running" }));
      try {
        await analysis.run(projectId, activeDomain, keyword);
        setStatuses((previous) => ({ ...previous, [analysis.key]: "done" }));
      } catch (error) {
        failed += 1;
        setStatuses((previous) => ({ ...previous, [analysis.key]: "failed" }));
        toast.error(getStandardErrorMessage(error, `${analysis.label} failed`));
      }
    }

    setRunning(false);
    // Tabs and their run history should reflect what just ran.
    void queryClient.invalidateQueries();

    if (failed === 0) {
      toast.success(
        `Analyzed ${domain} — ${chosen.length} ${
          chosen.length === 1 ? "analysis" : "analyses"
        } complete.`,
      );
    } else {
      toast.message(
        `${chosen.length - failed} of ${chosen.length} finished; ${failed} failed.`,
      );
    }
  }

  return (
    <DashboardCard icon={Rocket} title="Analyze this project">
      <p className="text-sm text-base-content/70">
        Run the analyses for <span className="font-medium">{domain}</span> in
        one pass. Each tab then opens showing its result instead of a blank
        form.
      </p>

      <SeedKeywordField
        value={seedValue}
        suggestions={suggestions}
        disabled={running}
        onChange={setKeywordInput}
      />

      <ul className="space-y-1.5">
        {ANALYSES.map((analysis) => {
          const status = statuses[analysis.key];
          const blocked = analysis.needsKeyword && keyword === "";
          return (
            <li key={analysis.key} className="flex items-center gap-2.5">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={selected.has(analysis.key) && !blocked}
                disabled={running || blocked}
                onChange={() => toggle(analysis.key)}
                aria-label={analysis.label}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{analysis.label}</p>
                <p className="truncate text-xs text-base-content/55">
                  {blocked ? "Needs a seed keyword" : analysis.detail}
                </p>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-base-content/50">
                {analysis.estimateUsd != null
                  ? `~$${analysis.estimateUsd.toFixed(2)}`
                  : "metered"}
              </span>
              <StatusGlyph status={status} />
            </li>
          );
        })}
      </ul>

      {skippedForKeyword > 0 ? (
        <p className="text-xs text-base-content/55">
          {skippedForKeyword}{" "}
          {skippedForKeyword === 1 ? "analysis" : "analyses"} will be skipped
          until you enter a seed keyword.
        </p>
      ) : null}

      {confirming ? (
        <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <p className="flex items-start gap-2 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>
              This spends. Running {chosen.length}{" "}
              {chosen.length === 1 ? "analysis" : "analyses"} for {domain}
              {quoted.length > 0 ? ` — about $${knownTotal.toFixed(2)}` : ""}
              {unquotedCount > 0
                ? `${quoted.length > 0 ? ", plus" : " —"} ${unquotedCount} metered at DataForSEO's rates (no measured estimate)`
                : ""}
              .
            </span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void runSelected()}
            >
              Yes, run {chosen.length}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-sm w-fit gap-1.5"
          disabled={running || chosen.length === 0}
          onClick={() => setConfirming(true)}
        >
          {running ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Rocket className="size-4" />
          )}
          {running
            ? "Running…"
            : `Run ${chosen.length} ${chosen.length === 1 ? "analysis" : "analyses"}`}
        </button>
      )}
    </DashboardCard>
  );
}

function StatusGlyph({ status }: { status: RunStatus | undefined }) {
  if (status === "running") {
    return <Loader2 className="size-4 shrink-0 animate-spin text-primary" />;
  }
  if (status === "done") {
    return <Check className="size-4 shrink-0 text-success" />;
  }
  if (status === "failed") {
    return <X className="size-4 shrink-0 text-error" />;
  }
  return <span className="size-4 shrink-0" />;
}
