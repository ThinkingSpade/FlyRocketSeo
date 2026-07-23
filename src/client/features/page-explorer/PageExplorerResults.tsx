import {
  Award,
  FileText,
  KeyRound,
  Link2,
  Medal,
  Network,
  Target,
  TrendingUp,
} from "lucide-react";
import { InsightIcon, InsightTile } from "@/client/components/InsightTile";
import { computePageRealEstate } from "./pageInsights";
import {
  PageDistributionCard,
  StrikingDistanceCard,
  TrafficConcentrationCard,
} from "./PageInsightsCards";
import type { getPageExplorer } from "@/serverFunctions/page-explorer";
import type { analyzeContentCompetitor } from "@/serverFunctions/content";

type PageExplorerData = NonNullable<
  Awaited<ReturnType<typeof getPageExplorer>>
>;
type SnapshotData = Awaited<ReturnType<typeof analyzeContentCompetitor>> | null;

function formatCount(value: number | null | undefined): string {
  if (value == null) return "—";
  return Math.round(value).toLocaleString();
}

export function PageExplorerResults({
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
