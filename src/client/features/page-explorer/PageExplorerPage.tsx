import { useEffect, useState } from "react";
import {
  Medal,
  FileMagnifyingGlass,
  Key,
  LinkSimple,
  MagnifyingGlass,
  TrendUp,
} from "@phosphor-icons/react";
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
import {
  useProjectDomain,
  useProjectMarket,
} from "@/client/hooks/useProjectDomain";
import { LOCATION_OPTIONS } from "@/shared/keyword-locations";
import {
  createMeteredRunKey,
  useAuthorizedRun,
  useMeteredQuery,
} from "@/client/lib/useMeteredQuery";
import { AppPageShell } from "@/client/components/AppPageShell";
import { Button } from "@cloudflare/kumo/components/button";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Input } from "@cloudflare/kumo/components/input";

type PageExplorerNavigate = (args: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace: boolean;
}) => void;

function normalizePageUrlInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const PAGE_ANALYZE_PREVIEW: AnalyzePreviewItem[] = [
  {
    icon: Key,
    title: "Every keyword it ranks for",
    description: "Positions, volume, difficulty and estimated traffic",
  },
  {
    icon: Medal,
    title: "Ranking real estate",
    description: "#1s, top-3, top-10 and striking-distance counts",
  },
  {
    icon: TrendUp,
    title: "Traffic concentration",
    description: "Which few keywords actually carry the page",
  },
  {
    icon: LinkSimple,
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
  const market = useProjectMarket(projectId);
  // The URL's own `loc` param always wins; the project's configured market
  // only fills in for a tab opened with no location in the URL. Every other
  // metered tab (content, serp, clusters, trends) already reads the market
  // here -- this one defaulted straight to the US, so a non-US project billed
  // every Page Explorer run against the wrong country with no error and no
  // visual cue.
  const activeLocation = locationCode ?? market.locationCode;
  const [input, setInput] = useState(url);
  const [locationInput, setLocationInput] = useState(String(activeLocation));
  const [locationTouched, setLocationTouched] = useState(false);
  const [runInput, setRunInput] = useState<{
    url: string;
    locationCode: number;
  } | null>(null);
  // On a cold load the `["projects"]` query behind `useProjectMarket` has not
  // resolved on first render, so `locationInput` locks onto the US fallback via
  // its useState initializer and would silently keep showing it. Precedence:
  // URL param > user selection > project market. Depends on the primitive, not
  // the `market` object, which has caused a render loop in this codebase.
  useEffect(() => {
    if (locationCode != null) return;
    if (locationTouched) return;
    setLocationInput(String(activeLocation));
  }, [locationCode, locationTouched, activeLocation]);

  const run = useAuthorizedRun(
    createMeteredRunKey(
      projectId,
      normalizePageUrlInput(input),
      Number(locationInput),
    ),
  );
  const projectDomain = useProjectDomain(projectId);

  const pageQuery = useMeteredQuery({
    authorized: run.authorized,
    runNonce: run.runNonce,
    enabled: runInput != null,
    queryKey: ["page-explorer", projectId, runInput],
    queryFn: () =>
      getPageExplorer({
        data: {
          projectId,
          url: runInput?.url ?? "",
          locationCode: runInput?.locationCode ?? activeLocation,
        },
      }),
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
    enabled: runInput == null,
    runId: selectedRunId,
  });
  const result = pageQuery.data ?? restored?.result;
  const restoredRun = pageQuery.data == null ? restored : null;
  const errorMessage = pageQuery.isError
    ? getStandardErrorMessage(pageQuery.error)
    : null;

  // On-page snapshot: same analysis (and server cache) the Content Optimizer
  // uses for competitor pages — title, length, and the heading outline.
  const snapshotQuery = useMeteredQuery({
    authorized: run.authorized,
    runNonce: run.runNonce,
    enabled: runInput != null,
    queryKey: ["content-competitor", projectId, runInput?.url],
    queryFn: () =>
      analyzeContentCompetitor({
        data: { projectId, url: runInput?.url ?? "" },
      }),
  });
  const snapshot = snapshotQuery.data ?? null;

  return (
    <AppPageShell>
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <FileMagnifyingGlass className="size-6" />
          Page Explorer
        </h1>
        <p className="text-sm text-base-content/60">
          Inspect any URL — yours or a competitor&rsquo;s: every keyword it
          ranks for, its estimated traffic, and its backlink profile.
        </p>
      </div>

      <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
        <div className="flex flex-auto flex-col gap-3 p-4 text-sm">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const normalized = normalizePageUrlInput(input);
              if (!normalized) return;
              setRunInput({
                url: normalized,
                locationCode: Number(locationInput),
              });
              run.authorize();
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
              <span className="pb-1 text-xs font-medium">Page URL</span>
              <Input
                passwordManagerIgnore
                type="text"
                size="sm"
                className="w-full"
                placeholder="https://competitor.com/their-best-page/"
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
            </label>
            <label className="form-control w-full sm:max-w-56">
              <span className="pb-1 text-xs font-medium">Location</span>
              <select
                className="app-select app-select-sm w-full"
                value={locationInput}
                onChange={(event) => {
                  setLocationTouched(true);
                  setLocationInput(event.target.value);
                }}
              >
                {LOCATION_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!input.trim() || pageQuery.isFetching}
            >
              {pageQuery.isFetching ? (
                <Loader size="sm" />
              ) : (
                <MagnifyingGlass className="size-3.5" />
              )}
              Inspect
            </Button>
          </form>
        </div>
      </div>

      {errorMessage ? (
        <Banner variant="error" className="text-sm">
          {errorMessage}
        </Banner>
      ) : null}

      <RestoreRail
        projectId={projectId}
        feature={RUN_FEATURES.pageExplorer}
        selectedRunId={selectedRunId}
        onSelectRun={setSelectedRunId}
        idle={runInput == null}
        restoredRun={restoredRun}
        onRunAgain={() => {
          if (!restoredRun) return;
          setInput(restoredRun.result.url);
          setLocationInput(String(restoredRun.result.locationCode));
          setRunInput({
            url: restoredRun.result.url,
            locationCode: restoredRun.result.locationCode,
          });
          run.authorize(
            createMeteredRunKey(
              projectId,
              restoredRun.result.url,
              restoredRun.result.locationCode,
            ),
          );
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

      {runInput == null && !restoredRun ? (
        <>
          <AnalyzeDomainPrompt
            domain={projectDomain}
            title="Start with your homepage"
            description="Inspect any page on your site — or paste a competitor's URL above to reverse-engineer it."
            preview={PAGE_ANALYZE_PREVIEW}
            onAnalyze={() => {
              if (!projectDomain) return;
              const homepage = `https://${projectDomain.replace(/^https?:\/\//, "")}/`;
              // `locationInput`, not `activeLocation`: the Location select sits
              // on screen beside this prompt, so pinning the run to the project
              // default billed a metered analysis against a country the user
              // had just changed away from, with no error and no visual cue.
              const chosenLocation = Number(locationInput);
              setInput(homepage);
              setRunInput({ url: homepage, locationCode: chosenLocation });
              run.authorize(
                createMeteredRunKey(projectId, homepage, chosenLocation),
              );
              navigate({
                search: (prev) => ({
                  ...prev,
                  u: homepage,
                  loc: chosenLocation,
                }),
                replace: false,
              });
            }}
            isBusy={pageQuery.isFetching}
          />
          <div className="relative flex flex-col rounded-xl border border-dashed border-base-300">
            <div className="flex flex-auto flex-col items-center py-8 text-center gap-2">
              <p className="max-w-md text-sm text-base-content/60">
                Great for reverse-engineering a competitor page that outranks
                you — see exactly which keywords it wins and how strong its
                links are.
              </p>
            </div>
          </div>
        </>
      ) : null}

      {runInput != null && pageQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader size="base" />
        </div>
      ) : null}

      {result ? (
        <PageExplorerResults result={result} snapshot={snapshot} />
      ) : null}
    </AppPageShell>
  );
}
