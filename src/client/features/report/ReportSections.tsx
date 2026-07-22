import type { ReactNode } from "react";
import {
  delta,
  formatCount,
  formatPercent,
  formatPosition,
  positionDelta,
  toPath,
} from "@/client/features/report/reportModel";
import {
  GscRowsTable,
  Section,
  Tile,
  type GscRow,
} from "@/client/features/report/ReportPrimitives";

/** Presentational sections for the Client Report, split from the page so each
 *  file stays readable. Everything here renders from already-fetched data. */

type ReportBodyProps = {
  gsc: {
    totals: {
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    };
    prevTotals: {
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    };
    strikingDistance: Array<{
      query: string;
      page: string;
      impressions: number;
      position: number;
    }>;
  } | null;
  gscPending: boolean;
  domainOverview: {
    organicTraffic: number | null;
    organicKeywords: number | null;
  } | null;
  backlinks: {
    summary: {
      rank: number | null;
      backlinks: number | null;
      referringDomains: number | null;
      newBacklinks: number | null;
      lostBacklinks: number | null;
      newReferringDomains: number | null;
      lostReferringDomains: number | null;
    };
  } | null;
  topQueries: GscRow[];
  topPages: GscRow[];
  insights: {
    opportunities: Array<{
      query: string;
      target: { page: string; position: number; impressions: number };
      sources: Array<{ page: string }>;
    }>;
    cannibalization: Array<{
      query: string;
      totalImpressions: number;
      pages: Array<{ page: string; position: number; isWinner: boolean }>;
    }>;
  } | null;
  latestAudit: {
    status: string;
    pagesCrawled: number;
    startedAt: string | Date;
  } | null;
  recommendations: string[];
  /** Deep-dive keyword sections, rendered after the GSC tables. */
  keywordSections?: ReactNode;
  /** Deep-dive link sections, rendered after the link-profile tiles. */
  linkSections?: ReactNode;
  /**
   * Which sections to render. Omit for all of them. The report uses this to
   * spread one chapter's sections across several printed pages instead of
   * stacking them into a single dense block.
   */
  only?: ReportSectionKey[];
};

export type ReportSectionKey =
  | "summary"
  | "queries"
  | "pages"
  | "keywordDeep"
  | "strikingDistance"
  | "conflicts"
  | "linkProfile"
  | "linkDeep"
  | "siteHealth"
  | "recommendations";

export function ReportBody({
  gsc,
  gscPending,
  domainOverview,
  backlinks,
  topQueries,
  topPages,
  insights,
  latestAudit,
  recommendations,
  keywordSections,
  linkSections,
  only,
}: ReportBodyProps) {
  const show = (key: ReportSectionKey) => !only || only.includes(key);

  return (
    <>
      {show("summary") ? (
        <Section
          title="Executive summary"
          subtitle="Google Search performance vs the previous period, plus overall visibility."
        >
          {gsc ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile
                label="Clicks"
                value={formatCount(gsc.totals.clicks)}
                change={delta(gsc.totals.clicks, gsc.prevTotals.clicks)}
              />
              <Tile
                label="Impressions"
                value={formatCount(gsc.totals.impressions)}
                change={delta(
                  gsc.totals.impressions,
                  gsc.prevTotals.impressions,
                )}
              />
              <Tile label="CTR" value={formatPercent(gsc.totals.ctr)} />
              <Tile
                label="Avg position"
                value={formatPosition(gsc.totals.position)}
                change={positionDelta(
                  gsc.totals.position,
                  gsc.prevTotals.position,
                )}
              />
            </div>
          ) : (
            <p className="text-sm text-base-content/60">
              {gscPending
                ? "Loading search data…"
                : "Search Console isn't connected for this project, so search performance is omitted."}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile
              label="Est. organic traffic"
              value={formatCount(domainOverview?.organicTraffic)}
            />
            <Tile
              label="Organic keywords"
              value={formatCount(domainOverview?.organicKeywords)}
            />
            <Tile
              label="Backlinks"
              value={formatCount(backlinks?.summary.backlinks)}
            />
            <Tile
              label="Referring domains"
              value={formatCount(backlinks?.summary.referringDomains)}
            />
          </div>
        </Section>
      ) : null}

      {show("queries") && topQueries.length > 0 ? (
        <Section
          title="Top queries"
          subtitle="What people searched to find the site."
        >
          <GscRowsTable rows={topQueries} keyHeader="Query" />
        </Section>
      ) : null}

      {show("pages") && topPages.length > 0 ? (
        <Section
          title="Top pages"
          subtitle="The pages doing the heavy lifting."
        >
          <GscRowsTable
            rows={topPages.map((row) => ({ ...row, key: toPath(row.key) }))}
            keyHeader="Page"
          />
        </Section>
      ) : null}

      {show("keywordDeep") ? keywordSections : null}

      {show("strikingDistance") && gsc && gsc.strikingDistance.length > 0 ? (
        <Section
          title="Quick wins — striking distance"
          subtitle="Keywords ranking 5–20 where focused improvements move real traffic."
        >
          <div className="overflow-x-auto rounded-lg border border-base-300">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Keyword</th>
                  <th>Page</th>
                  <th className="text-right">Position</th>
                  <th className="text-right">Impressions</th>
                </tr>
              </thead>
              <tbody>
                {gsc.strikingDistance.slice(0, 10).map((row) => (
                  <tr key={row.query}>
                    <td className="max-w-xs">
                      <span className="line-clamp-1">{row.query}</span>
                    </td>
                    <td className="max-w-xs">
                      <span className="line-clamp-1">{toPath(row.page)}</span>
                    </td>
                    <td className="text-right tabular-nums">
                      {Math.round(row.position)}
                    </td>
                    <td className="text-right tabular-nums">
                      {formatCount(row.impressions)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      {show("conflicts") && insights && insights.cannibalization.length > 0 ? (
        <Section
          title="Keyword conflicts"
          subtitle="Queries where multiple pages compete — consolidating each onto its winner recovers rankings."
        >
          <div className="overflow-x-auto rounded-lg border border-base-300">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Keyword</th>
                  <th className="text-right">Competing pages</th>
                  <th>Recommended winner</th>
                </tr>
              </thead>
              <tbody>
                {insights.cannibalization.slice(0, 5).map((row) => (
                  <tr key={row.query}>
                    <td className="max-w-xs">
                      <span className="line-clamp-1">{row.query}</span>
                    </td>
                    <td className="text-right tabular-nums">
                      {row.pages.length}
                    </td>
                    <td className="max-w-xs">
                      <span className="line-clamp-1">
                        {toPath(
                          row.pages.find((page) => page.isWinner)?.page ?? "—",
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      {show("linkProfile") ? (
        <Section title="Link profile" subtitle="Recent backlink movement.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile
              label="New backlinks"
              value={formatCount(backlinks?.summary.newBacklinks)}
            />
            <Tile
              label="Lost backlinks"
              value={formatCount(backlinks?.summary.lostBacklinks)}
            />
            <Tile
              label="New ref. domains"
              value={formatCount(backlinks?.summary.newReferringDomains)}
            />
            <Tile
              label="Lost ref. domains"
              value={formatCount(backlinks?.summary.lostReferringDomains)}
            />
          </div>
        </Section>
      ) : null}

      {show("linkDeep") ? linkSections : null}

      {show("siteHealth") ? (
        <Section title="Site health" subtitle="Latest technical crawl.">
          {latestAudit ? (
            <p className="text-sm text-base-content/80">
              Last completed audit crawled{" "}
              <span className="font-semibold tabular-nums">
                {latestAudit.pagesCrawled}
              </span>{" "}
              pages on{" "}
              {new Date(latestAudit.startedAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
              . Full findings live in the Site Audit section of the dashboard.
            </p>
          ) : (
            <p className="text-sm text-base-content/60">
              No completed site audit yet — one is recommended below.
            </p>
          )}
        </Section>
      ) : null}

      {show("recommendations") ? (
        <Section
          title="Recommended next steps"
          subtitle="What we'd prioritize based on this data."
        >
          <ul className="list-inside list-disc space-y-1.5 text-sm text-base-content/80">
            {recommendations.map((recommendation) => (
              <li key={recommendation}>{recommendation}</li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}
