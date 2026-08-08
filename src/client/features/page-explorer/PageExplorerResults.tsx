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
import { Table } from "@cloudflare/kumo/components/table";

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
        {/* The backlink lookup is a separate best-effort subcall, so these two
            tiles showed a dash both when the page genuinely has no backlink
            data and when the call FAILED. `backlinksStatus` separates them, so
            a failure now says so instead of quietly reading as zero. */}
        <InsightTile
          icon={Link2}
          label="Backlinks"
          value={formatCount(result.backlinks?.backlinks)}
          hint={
            result.backlinksStatus === "error"
              ? "Backlink data couldn't be loaded"
              : undefined
          }
        />
        <InsightTile
          icon={Network}
          label="Ref. domains"
          value={formatCount(result.backlinks?.referringDomains)}
          hint={
            result.backlinksStatus === "error"
              ? "Backlink data couldn't be loaded"
              : undefined
          }
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
          <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
            <div className="overflow-x-auto">
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.Head>Keyword</Table.Head>
                    <Table.Head className="text-right">Position</Table.Head>
                    <Table.Head className="text-right">Volume</Table.Head>
                    <Table.Head className="text-right">KD</Table.Head>
                    <Table.Head className="text-right">CPC</Table.Head>
                    <Table.Head className="text-right">Traffic</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {result.keywords.map((item) => (
                    <Table.Row key={item.keyword}>
                      <Table.Cell className="max-w-md">
                        <span className="line-clamp-1">{item.keyword}</span>
                      </Table.Cell>
                      <Table.Cell className="text-right tabular-nums">
                        {item.position ?? "—"}
                      </Table.Cell>
                      <Table.Cell className="text-right tabular-nums">
                        {formatCount(item.searchVolume)}
                      </Table.Cell>
                      <Table.Cell className="text-right tabular-nums">
                        {item.keywordDifficulty ?? "—"}
                      </Table.Cell>
                      <Table.Cell className="text-right tabular-nums">
                        {item.cpc != null ? `$${item.cpc.toFixed(2)}` : "—"}
                      </Table.Cell>
                      <Table.Cell className="text-right tabular-nums">
                        {formatCount(item.traffic)}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                  {result.keywords.length === 0 ? (
                    <Table.Row>
                      <Table.Cell
                        colSpan={6}
                        className="py-8 text-center text-sm text-base-content/50"
                      >
                        No ranked keywords found for this exact page in this
                        location.
                      </Table.Cell>
                    </Table.Row>
                  ) : null}
                </Table.Body>
              </Table>
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
            <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
              <div className="flex flex-auto flex-col gap-2 p-4 text-sm">
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
