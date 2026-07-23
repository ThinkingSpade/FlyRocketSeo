import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Award,
  FileSearch,
  KeyRound,
  Link2,
  Search,
  TrendingUp,
} from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getPageExplorer } from "@/serverFunctions/page-explorer";
import { pageExplorerSchema } from "@/types/schemas/page-explorer";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import { RestoreRail } from "@/client/features/analysis-runs/RestoreRail";
import { analyzeContentCompetitor } from "@/serverFunctions/content";
import { PageExplorerResults } from "./PageExplorerResults";
import {
  AnalyzeDomainPrompt,
  type AnalyzePreviewItem,
} from "@/client/components/AnalyzeDomainPrompt";
import { useProjectDomain } from "@/client/hooks/useProjectDomain";
import {
  DEFAULT_LOCATION_CODE,
  LOCATION_OPTIONS,
} from "@/shared/keyword-locations";

type PageExplorerNavigate = (args: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace: boolean;
}) => void;

const PAGE_ANALYZE_PREVIEW: AnalyzePreviewItem[] = [
  {
    icon: KeyRound,
    title: "Every keyword it ranks for",
    description: "Positions, volume, difficulty and estimated traffic",
  },
  {
    icon: Award,
    title: "Ranking real estate",
    description: "#1s, top-3, top-10 and striking-distance counts",
  },
  {
    icon: TrendingUp,
    title: "Traffic concentration",
    description: "Which few keywords actually carry the page",
  },
  {
    icon: Link2,
    title: "Links & on-page",
    description: "Backlinks, referring domains, and the heading outline",
  },
];

export function PageExplorerPage({
  projectId,
  navigate,
  url,
  locationCode,
}: {
  projectId: string;
  navigate: PageExplorerNavigate;
  url: string;
  locationCode: number | undefined;
}) {
  const activeLocation = locationCode ?? DEFAULT_LOCATION_CODE;
  const [input, setInput] = useState(url);
  const [locationInput, setLocationInput] = useState(String(activeLocation));
  const targetUrl = url.trim();
  const projectDomain = useProjectDomain(projectId);

  const pageQuery = useQuery({
    enabled: targetUrl.length > 0,
    queryKey: ["page-explorer", projectId, targetUrl, activeLocation],
    queryFn: () =>
      getPageExplorer({
        data: { projectId, url: targetUrl, locationCode: activeLocation },
      }),
    staleTime: 30 * 60_000,
  });
  // Restoring the project's last page lookup is free: it reads a stored row
  // plus the R2 object that run already paid for, never a metered fetch. The
  // on-page snapshot below stays gated on the live targetUrl, so a restore
  // never triggers its (metered) analysis.
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const { restored } = useAutoRestoredRun({
    projectId,
    feature: RUN_FEATURES.pageExplorer,
    schema: pageExplorerSchema,
    enabled: targetUrl === "",
    runId: selectedRunId,
  });
  const result = pageQuery.data ?? restored?.result;
  const restoredRun = pageQuery.data == null ? restored : null;
  const errorMessage = pageQuery.isError
    ? getStandardErrorMessage(pageQuery.error)
    : null;

  // On-page snapshot: same analysis (and server cache) the Content Optimizer
  // uses for competitor pages — title, length, and the heading outline.
  const snapshotQuery = useQuery({
    enabled: targetUrl.length > 0,
    queryKey: ["content-competitor", projectId, targetUrl],
    queryFn: () =>
      analyzeContentCompetitor({ data: { projectId, url: targetUrl } }),
    staleTime: 60 * 60_000,
    retry: 1,
  });
  const snapshot = snapshotQuery.data ?? null;

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-3 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <FileSearch className="size-5" />
          Page Explorer
        </h1>
        <p className="text-sm text-base-content/60">
          Inspect any URL — yours or a competitor&rsquo;s: every keyword it
          ranks for, its estimated traffic, and its backlink profile.
        </p>
      </div>

      <div className="card border border-base-300 bg-base-100">
        <div className="card-body gap-3 p-4">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const next = input.trim();
              if (!next) return;
              const normalized = /^https?:\/\//i.test(next)
                ? next
                : `https://${next}`;
              navigate({
                search: (prev) => ({
                  ...prev,
                  u: normalized,
                  loc: Number(locationInput),
                }),
                replace: false,
              });
            }}
          >
            <label className="form-control w-full sm:max-w-xl">
              <span className="label-text pb-1 text-xs font-medium">
                Page URL
              </span>
              <input
                type="text"
                className="input input-bordered input-sm w-full"
                placeholder="https://competitor.com/their-best-page/"
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
            </label>
            <label className="form-control w-full sm:max-w-56">
              <span className="label-text pb-1 text-xs font-medium">
                Location
              </span>
              <select
                className="select select-bordered select-sm w-full"
                value={locationInput}
                onChange={(event) => setLocationInput(event.target.value)}
              >
                {LOCATION_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="btn btn-primary btn-sm gap-1.5"
              disabled={!input.trim() || pageQuery.isFetching}
            >
              {pageQuery.isFetching ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <Search className="size-3.5" />
              )}
              Inspect
            </button>
          </form>
        </div>
      </div>

      {errorMessage ? (
        <div className="alert alert-error text-sm">{errorMessage}</div>
      ) : null}

      <RestoreRail
        projectId={projectId}
        feature={RUN_FEATURES.pageExplorer}
        selectedRunId={selectedRunId}
        onSelectRun={setSelectedRunId}
        idle={targetUrl === ""}
        restoredRun={restoredRun}
        onRunAgain={() => {
          if (!restoredRun) return;
          setInput(restoredRun.result.url);
          navigate({
            search: (prev) => ({
              ...prev,
              u: restoredRun.result.url,
              loc: restoredRun.result.locationCode,
            }),
            replace: false,
          });
        }}
      />

      {!targetUrl && !restoredRun ? (
        <>
          <AnalyzeDomainPrompt
            domain={projectDomain}
            title="Start with your homepage"
            description="Inspect any page on your site — or paste a competitor's URL above to reverse-engineer it."
            preview={PAGE_ANALYZE_PREVIEW}
            onAnalyze={() => {
              if (!projectDomain) return;
              const homepage = `https://${projectDomain.replace(/^https?:\/\//, "")}/`;
              setInput(homepage);
              navigate({
                search: (prev) => ({
                  ...prev,
                  u: homepage,
                  loc: activeLocation,
                }),
                replace: false,
              });
            }}
            isBusy={pageQuery.isFetching}
          />
          <div className="card border border-dashed border-base-300">
            <div className="card-body items-center py-8 text-center">
              <p className="max-w-md text-sm text-base-content/60">
                Great for reverse-engineering a competitor page that outranks
                you — see exactly which keywords it wins and how strong its
                links are.
              </p>
            </div>
          </div>
        </>
      ) : null}

      {targetUrl && pageQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <span className="loading loading-spinner loading-md" />
        </div>
      ) : null}

      {result ? (
        <PageExplorerResults result={result} snapshot={snapshot} />
      ) : null}
    </div>
  );
}
