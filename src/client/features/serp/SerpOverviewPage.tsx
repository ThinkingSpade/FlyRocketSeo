import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CircleDollarSign,
  Gauge,
  HelpCircle,
  ListOrdered,
  Search,
} from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getSerpOverview } from "@/serverFunctions/serp";
import { serpOverviewSchema } from "@/types/schemas/serp";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import { RestoredRunBanner } from "@/client/features/analysis-runs/RestoredRunBanner";
import { RecentRunsList } from "@/client/features/analysis-runs/RecentRunsList";
import { estimateTrafficShare } from "@/client/features/serp/serpTrafficShare";
import { SerpStrengthCards } from "@/client/features/serp/SerpStrengthCards";
import {
  InsightIcon,
  InsightTile,
  type InsightTone,
} from "@/client/components/InsightTile";
import {
  useAhrefsDomainRatings,
  type DomainRatings,
} from "@/client/features/backlinks/useAhrefsDomainRatings";
import {
  DEFAULT_LOCATION_CODE,
  LOCATION_OPTIONS,
} from "@/shared/keyword-locations";

type SerpNavigate = (args: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace: boolean;
}) => void;

function formatCount(value: number | null | undefined): string {
  if (value == null) return "—";
  return Math.round(value).toLocaleString();
}

function formatFeatureLabel(type: string): string {
  return type.replace(/_/g, " ");
}

/** Green under 30, amber to 60, red above — mirrors the difficulty badge. */
function difficultyTone(value: number | null | undefined): InsightTone {
  if (value == null) return "neutral";
  if (value < 30) return "success";
  if (value < 60) return "warning";
  return "error";
}

export function SerpOverviewPage({
  projectId,
  navigate,
  query,
  locationCode,
}: {
  projectId: string;
  navigate: SerpNavigate;
  query: string;
  locationCode: number | undefined;
}) {
  const activeLocation = locationCode ?? DEFAULT_LOCATION_CODE;
  const [input, setInput] = useState(query);
  const [locationInput, setLocationInput] = useState(String(activeLocation));
  const keyword = query.trim();

  const serpQuery = useQuery({
    enabled: keyword.length > 0,
    queryKey: ["serp-overview", projectId, keyword, activeLocation],
    queryFn: () =>
      getSerpOverview({
        data: { projectId, keyword, locationCode: activeLocation },
      }),
    staleTime: 5 * 60_000,
  });

  // With no keyword in the URL the query above stays disabled, so the tab would
  // otherwise show only a prompt. Restoring the project's last run fills it in
  // for free: it reads a stored row plus the R2 object that run already paid
  // for, and can never trigger a metered fetch.
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const { restored } = useAutoRestoredRun({
    projectId,
    feature: RUN_FEATURES.serpOverview,
    schema: serpOverviewSchema,
    enabled: keyword === "",
    runId: selectedRunId,
  });
  const result = serpQuery.data ?? restored?.result;
  const restoredRun = serpQuery.data == null ? restored : null;
  const errorMessage = serpQuery.isError
    ? getStandardErrorMessage(serpQuery.error)
    : null;

  // Ahrefs DR enrichment (free + KV-cached server side) for each result domain.
  const { ratings, loadRatings } = useAhrefsDomainRatings(projectId);
  useEffect(() => {
    if (!result) return;
    const domains = result.results
      .map((item) => item.domain)
      .filter((domain): domain is string => Boolean(domain));
    if (domains.length > 0) void loadRatings(domains);
  }, [result, loadRatings]);

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-3 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <ListOrdered className="size-5" />
          SERP Overview
        </h1>
        <p className="text-sm text-base-content/60">
          See who ranks in the live top results for any keyword — with each
          page&rsquo;s authority, estimated traffic, and backlinks — plus the
          SERP features and People-Also-Ask questions you&rsquo;d compete with.
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
              navigate({
                search: (prev) => ({
                  ...prev,
                  q: next,
                  loc: Number(locationInput),
                }),
                replace: false,
              });
            }}
          >
            <label className="form-control w-full sm:max-w-md">
              <span className="label-text pb-1 text-xs font-medium">
                Keyword
              </span>
              <input
                type="text"
                className="input input-bordered input-sm w-full"
                placeholder="office coffee service dallas"
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
              disabled={!input.trim() || serpQuery.isFetching}
            >
              {serpQuery.isFetching ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <Search className="size-3.5" />
              )}
              Analyze
            </button>
          </form>
        </div>
      </div>

      {errorMessage ? (
        <div className="alert alert-error text-sm">{errorMessage}</div>
      ) : null}

      {!keyword ? (
        <RecentRunsList
          projectId={projectId}
          feature={RUN_FEATURES.serpOverview}
          activeRunId={selectedRunId}
          onSelect={setSelectedRunId}
        />
      ) : null}

      {restoredRun ? (
        <RestoredRunBanner
          label={restoredRun.label}
          lastRanAt={restoredRun.lastRanAt}
          runCount={restoredRun.runCount}
          onRunAgain={() => {
            setInput(restoredRun.result.keyword);
            navigate({
              search: (prev) => ({
                ...prev,
                q: restoredRun.result.keyword,
                loc: restoredRun.result.locationCode,
              }),
              replace: false,
            });
          }}
        />
      ) : null}

      {!keyword && !restoredRun ? (
        <div className="card border border-dashed border-base-300">
          <div className="card-body items-center py-12 text-center">
            <p className="font-medium">Enter a keyword to get started</p>
            <p className="max-w-md text-sm text-base-content/60">
              Analyze any SERP to size up the competition before you target a
              keyword.
            </p>
          </div>
        </div>
      ) : null}

      {result ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <InsightTile
              icon={BarChart3}
              label="Volume"
              value={formatCount(result.keywordStats?.searchVolume)}
              tone="primary"
            />
            <InsightTile
              icon={Gauge}
              label="Difficulty"
              value={result.keywordStats?.keywordDifficulty ?? "—"}
              tone={difficultyTone(result.keywordStats?.keywordDifficulty)}
            />
            <InsightTile
              icon={CircleDollarSign}
              label="CPC"
              value={
                result.keywordStats?.cpc != null
                  ? `$${result.keywordStats.cpc.toFixed(2)}`
                  : "—"
              }
              tone="info"
            />
            <InsightTile
              icon={ListOrdered}
              label="Organic results"
              value={result.totalOrganic}
            />
          </div>

          {result.serpFeatures.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-base-content/50">
                SERP features
              </span>
              {result.serpFeatures.map((feature) => (
                <span
                  key={feature.type}
                  className="badge badge-ghost badge-sm capitalize"
                >
                  {formatFeatureLabel(feature.type)}
                  {feature.count > 1 ? ` ×${feature.count}` : ""}
                </span>
              ))}
            </div>
          ) : null}

          <SerpStrengthCards results={result.results} ratings={ratings} />

          <SerpResultsTable result={result} ratings={ratings} />

          {result.paaQuestions.length > 0 ? (
            <div className="card border border-base-300 bg-base-100">
              <div className="card-body gap-2 p-4">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                  <InsightIcon icon={HelpCircle} tone="info" />
                  People also ask
                </h2>
                <ul className="list-inside list-disc space-y-1 text-sm text-base-content/80">
                  {result.paaQuestions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          <p className="text-xs text-base-content/40">
            Top {result.results.length} of {result.totalOrganic} organic results
            · fetched {new Date(result.fetchedAt).toLocaleString()} · DR via
            Ahrefs
          </p>
        </>
      ) : null}

      {keyword && serpQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <span className="loading loading-spinner loading-md" />
        </div>
      ) : null}
    </div>
  );
}

function SerpResultsTable({
  result,
  ratings,
}: {
  result: NonNullable<Awaited<ReturnType<typeof getSerpOverview>>>;
  ratings: DomainRatings | null;
}) {
  // Ahrefs-style estimate: keyword volume spread over a standard
  // CTR-by-position curve. Client-side, no extra API spend.
  const trafficShare = estimateTrafficShare(
    result.keywordStats?.searchVolume,
    result.results.map((item) => item.rank),
  );

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th className="w-14">#</th>
              <th>Result</th>
              {trafficShare ? (
                <th
                  className="text-right"
                  title="Estimated monthly clicks for this result: search volume × a standard CTR-by-position curve"
                >
                  Est. clicks
                </th>
              ) : null}
              <th className="text-right">DR</th>
              <th
                className="text-right"
                title="Estimated monthly organic traffic for the whole domain"
              >
                Domain traffic
              </th>
            </tr>
          </thead>
          <tbody>
            {result.results.map((item) => {
              const estimate =
                item.rank != null ? trafficShare?.get(item.rank) : undefined;
              return (
                <tr key={`${item.rank}-${item.url}`}>
                  <td className="align-top">
                    <div className="flex items-center gap-1 tabular-nums">
                      {item.rank ?? "—"}
                      {item.isNew ? (
                        <span className="badge badge-success badge-xs">
                          new
                        </span>
                      ) : item.isUp ? (
                        <ArrowUp className="size-3 text-success" />
                      ) : item.isDown ? (
                        <ArrowDown className="size-3 text-error" />
                      ) : null}
                    </div>
                  </td>
                  <td className="max-w-xl align-top">
                    <a
                      href={item.url ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="line-clamp-1 font-medium hover:underline"
                    >
                      {item.title ?? item.url ?? "—"}
                    </a>
                    <div className="line-clamp-1 text-xs text-success/80">
                      {item.url}
                    </div>
                    {item.description ? (
                      <div className="line-clamp-2 text-xs text-base-content/60">
                        {item.description}
                      </div>
                    ) : null}
                  </td>
                  {trafficShare ? (
                    <td className="text-right align-top">
                      <div className="tabular-nums">
                        {estimate ? formatCount(estimate.clicks) : "—"}
                      </div>
                      {estimate ? (
                        <div className="ml-auto mt-1 h-1 w-16 overflow-hidden rounded-full bg-base-200">
                          <div
                            className="h-full rounded-full bg-primary/60"
                            style={{
                              width: `${Math.round(estimate.relative * 100)}%`,
                            }}
                          />
                        </div>
                      ) : null}
                    </td>
                  ) : null}
                  <td className="text-right align-top tabular-nums">
                    {item.domain != null && ratings?.[item.domain] != null
                      ? ratings[item.domain]
                      : "—"}
                  </td>
                  <td className="text-right align-top tabular-nums">
                    {formatCount(item.domainEtv)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
