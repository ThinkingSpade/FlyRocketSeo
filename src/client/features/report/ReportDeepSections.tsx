import type { ReactNode } from "react";
import { formatCount, toPath } from "@/client/features/report/reportModel";

/** Deep-dive report sections: the site's actual rankings, new keyword targets,
 *  internal-link plays, and the raw link profile behind the tile numbers. */

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="report-section space-y-2">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle ? (
          <p className="text-xs text-base-content/60">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function KeywordDeepSections({
  rankings,
  suggestions,
}: {
  rankings: Array<{
    keyword: string;
    position: number | null;
    searchVolume: number | null;
    traffic: number | null;
    keywordDifficulty: number | null;
    relativeUrl: string | null;
  }>;
  suggestions: Array<{
    keyword: string;
    searchVolume: number | null;
    keywordDifficulty: number | null;
    cpc: number | null;
  }>;
}) {
  return (
    <>
      {rankings.length > 0 ? (
        <Section
          title="Current top rankings"
          subtitle="The keywords already driving the most organic traffic."
        >
          <div className="overflow-x-auto rounded-lg border border-base-300">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Keyword</th>
                  <th>Page</th>
                  <th className="text-right">Position</th>
                  <th className="text-right">Volume</th>
                  <th className="text-right">KD</th>
                  <th className="text-right">Est. traffic</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((row) => (
                  <tr key={row.keyword}>
                    <td className="max-w-xs">
                      <span className="line-clamp-1">{row.keyword}</span>
                    </td>
                    <td className="max-w-xs">
                      <span className="line-clamp-1">
                        {row.relativeUrl ?? "—"}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">
                      {row.position ?? "—"}
                    </td>
                    <td className="text-right tabular-nums">
                      {formatCount(row.searchVolume)}
                    </td>
                    <td className="text-right tabular-nums">
                      {row.keywordDifficulty ?? "—"}
                    </td>
                    <td className="text-right tabular-nums">
                      {formatCount(row.traffic)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      {suggestions.length > 0 ? (
        <Section
          title="Keyword opportunities"
          subtitle="New keywords worth targeting, based on what the site could realistically rank for."
        >
          <div className="overflow-x-auto rounded-lg border border-base-300">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Keyword</th>
                  <th className="text-right">Volume</th>
                  <th className="text-right">KD</th>
                  <th className="text-right">CPC</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((row) => (
                  <tr key={row.keyword}>
                    <td className="max-w-md">
                      <span className="line-clamp-1">{row.keyword}</span>
                    </td>
                    <td className="text-right tabular-nums">
                      {formatCount(row.searchVolume)}
                    </td>
                    <td className="text-right tabular-nums">
                      {row.keywordDifficulty ?? "—"}
                    </td>
                    <td className="text-right tabular-nums">
                      {row.cpc != null ? `$${row.cpc.toFixed(2)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}
    </>
  );
}

export function LinkDeepSections({
  opportunities,
  backlinkRows,
  referringDomains,
}: {
  opportunities: Array<{
    query: string;
    target: { page: string; position: number };
    sources: Array<{ page: string }>;
  }>;
  backlinkRows: Array<{
    domainFrom: string | null;
    urlFrom: string | null;
    urlTo: string | null;
    anchor: string | null;
    isDofollow: boolean | null;
    rank: number | null;
  }>;
  referringDomains: Array<{
    domain: string | null;
    backlinks: number | null;
    rank: number | null;
  }>;
}) {
  return (
    <>
      {opportunities.length > 0 ? (
        <Section
          title="Internal link plays"
          subtitle="Add these internal links to push almost-ranking pages over the line."
        >
          <div className="overflow-x-auto rounded-lg border border-base-300">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Anchor (keyword)</th>
                  <th>Link to</th>
                  <th className="text-right">Current position</th>
                  <th className="text-right">Pages to link from</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.slice(0, 5).map((row) => (
                  <tr key={row.query}>
                    <td className="max-w-xs">
                      <span className="line-clamp-1">{row.query}</span>
                    </td>
                    <td className="max-w-xs">
                      <span className="line-clamp-1">
                        {toPath(row.target.page)}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">
                      {Math.round(row.target.position)}
                    </td>
                    <td className="text-right tabular-nums">
                      {row.sources.length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      {backlinkRows.length > 0 ? (
        <Section
          title="Top backlinks"
          subtitle="The strongest links pointing at the site (one per referring domain)."
        >
          <div className="overflow-x-auto rounded-lg border border-base-300">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>From</th>
                  <th>Anchor</th>
                  <th>To</th>
                  <th className="text-right">Rank</th>
                  <th className="text-right">Follow</th>
                </tr>
              </thead>
              <tbody>
                {backlinkRows.map((row) => (
                  <tr key={`${row.urlFrom}-${row.urlTo}`}>
                    <td className="max-w-xs">
                      <span className="line-clamp-1">
                        {row.domainFrom ?? toPath(row.urlFrom)}
                      </span>
                    </td>
                    <td className="max-w-xs">
                      <span className="line-clamp-1">{row.anchor ?? "—"}</span>
                    </td>
                    <td className="max-w-xs">
                      <span className="line-clamp-1">{toPath(row.urlTo)}</span>
                    </td>
                    <td className="text-right tabular-nums">
                      {row.rank ?? "—"}
                    </td>
                    <td className="text-right">
                      {row.isDofollow == null
                        ? "—"
                        : row.isDofollow
                          ? "dofollow"
                          : "nofollow"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      {referringDomains.length > 0 ? (
        <Section
          title="Top referring domains"
          subtitle="Where the site's authority comes from."
        >
          <div className="overflow-x-auto rounded-lg border border-base-300">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Domain</th>
                  <th className="text-right">Backlinks</th>
                  <th className="text-right">Rank</th>
                </tr>
              </thead>
              <tbody>
                {referringDomains.map((row, index) => (
                  <tr key={row.domain ?? `row-${index}`}>
                    <td className="max-w-md">
                      <span className="line-clamp-1">{row.domain ?? "—"}</span>
                    </td>
                    <td className="text-right tabular-nums">
                      {formatCount(row.backlinks)}
                    </td>
                    <td className="text-right tabular-nums">
                      {row.rank ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}
    </>
  );
}
