import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Award,
  FileSearch,
  FileText,
  KeyRound,
  Link2,
  Medal,
  Network,
  Search,
  Target,
  TrendingUp,
} from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getPageExplorer } from "@/serverFunctions/page-explorer";
import { analyzeContentCompetitor } from "@/serverFunctions/content";
import { computePageRealEstate } from "./pageInsights";
import {
  PageDistributionCard,
  StrikingDistanceCard,
  TrafficConcentrationCard,
} from "./PageInsightsCards";
import { InsightIcon, InsightTile } from "@/client/components/InsightTile";
import {
  DEFAULT_LOCATION_CODE,
  LOCATION_OPTIONS,
} from "@/shared/keyword-locations";

type PageExplorerNavigate = (args: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace: boolean;
}) => void;

function formatCount(value: number | null | undefined): string {
  if (value == null) return "—";
  return Math.round(value).toLocaleString();
}

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

  const pageQuery = useQuery({
    enabled: targetUrl.length > 0,
    queryKey: ["page-explorer", projectId, targetUrl, activeLocation],
    queryFn: () =>
      getPageExplorer({
        data: { projectId, url: targetUrl, locationCode: activeLocation },
      }),
    staleTime: 30 * 60_000,
  });
  const result = pageQuery.data;
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

      {!targetUrl ? (
        <div className="card border border-dashed border-base-300">
          <div className="card-body items-center py-12 text-center">
            <p className="font-medium">Paste a URL to inspect it</p>
            <p className="max-w-md text-sm text-base-content/60">
              Great for reverse-engineering a competitor page that outranks you
              — see exactly which keywords it wins and how strong its links are.
            </p>
          </div>
        </div>
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

type PageExplorerData = NonNullable<
  Awaited<ReturnType<typeof getPageExplorer>>
>;
type SnapshotData = Awaited<ReturnType<typeof analyzeContentCompetitor>> | null;

function PageExplorerResults({
  result,
  snapshot,
}: {
  result: PageExplorerData;
  snapshot: SnapshotData;
}) {
  const realEstate = computePageRealEstate(result.keywords);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 2xl:grid-cols-8">
        <InsightTile
          icon={TrendingUp}
          label="Est. monthly traffic"
          value={formatCount(result.estimatedTraffic)}
          hint="Sum of keyword-level estimates"
          tone="primary"
        />
        <InsightTile
          icon={KeyRound}
          label="Ranking keywords"
          value={formatCount(result.totalKeywords ?? result.keywords.length)}
          hint={`Top ${result.keywords.length} shown`}
          tone="info"
        />
        <InsightTile
          icon={Link2}
          label="Backlinks"
          value={formatCount(result.backlinks?.backlinks)}
        />
        <InsightTile
          icon={Network}
          label="Ref. domains"
          value={formatCount(result.backlinks?.referringDomains)}
        />
        <InsightTile
          icon={Award}
          label="#1 rankings"
          value={realEstate.numberOne}
          tone={realEstate.numberOne > 0 ? "success" : "neutral"}
        />
        <InsightTile
          icon={Medal}
          label="Top 3"
          value={realEstate.top3}
          tone={realEstate.top3 > 0 ? "success" : "neutral"}
        />
        <InsightTile icon={Medal} label="Top 10" value={realEstate.top10} />
        <InsightTile
          icon={Target}
          label="Striking distance"
          value={realEstate.strikingDistance}
          hint="Ranked #4–15"
          tone={realEstate.strikingDistance > 0 ? "warning" : "neutral"}
        />
      </div>

      <div className="grid items-start gap-3 xl:grid-cols-5">
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-3">
          <div className="card border border-base-300 bg-base-100">
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Keyword</th>
                    <th className="text-right">Position</th>
                    <th className="text-right">Volume</th>
                    <th className="text-right">KD</th>
                    <th className="text-right">CPC</th>
                    <th className="text-right">Traffic</th>
                  </tr>
                </thead>
                <tbody>
                  {result.keywords.map((item) => (
                    <tr key={item.keyword}>
                      <td className="max-w-md">
                        <span className="line-clamp-1">{item.keyword}</span>
                      </td>
                      <td className="text-right tabular-nums">
                        {item.position ?? "—"}
                      </td>
                      <td className="text-right tabular-nums">
                        {formatCount(item.searchVolume)}
                      </td>
                      <td className="text-right tabular-nums">
                        {item.keywordDifficulty ?? "—"}
                      </td>
                      <td className="text-right tabular-nums">
                        {item.cpc != null ? `$${item.cpc.toFixed(2)}` : "—"}
                      </td>
                      <td className="text-right tabular-nums">
                        {formatCount(item.traffic)}
                      </td>
                    </tr>
                  ))}
                  {result.keywords.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-8 text-center text-sm text-base-content/50"
                      >
                        No ranked keywords found for this exact page in this
                        location.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3 xl:col-span-2">
          <PageDistributionCard keywords={result.keywords} />
          <TrafficConcentrationCard
            keywords={result.keywords}
            estimatedTraffic={result.estimatedTraffic}
          />
          <StrikingDistanceCard keywords={result.keywords} />
          {snapshot ? (
            <div className="card border border-base-300 bg-base-100">
              <div className="card-body gap-2 p-4">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                  <InsightIcon icon={FileText} tone="info" />
                  On-page snapshot
                </h2>
                <p className="text-sm text-base-content/80">
                  <span className="font-medium">{snapshot.title || "—"}</span>
                  {snapshot.wordCount != null ? (
                    <span className="text-base-content/60">
                      {" "}
                      · {snapshot.wordCount.toLocaleString()} words ·{" "}
                      {snapshot.h2.length} H2s · {snapshot.h3.length} H3s
                    </span>
                  ) : null}
                </p>
                {snapshot.h2.length > 0 ? (
                  <ul className="list-inside list-disc space-y-0.5 text-sm text-base-content/70">
                    {snapshot.h2.map((heading) => (
                      <li key={heading}>{heading}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-base-content/40">
        {result.url} · fetched {new Date(result.fetchedAt).toLocaleString()}
      </p>
    </>
  );
}
