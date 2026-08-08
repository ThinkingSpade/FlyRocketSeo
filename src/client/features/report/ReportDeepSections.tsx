import type { ReactNode } from "react";
import { formatCount, toPath } from "@/client/features/report/reportModel";
import { Table } from "@cloudflare/kumo/components/table";

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
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Keyword</Table.Head>
                  <Table.Head>Page</Table.Head>
                  <Table.Head className="text-right">Position</Table.Head>
                  <Table.Head className="text-right">Volume</Table.Head>
                  <Table.Head className="text-right">KD</Table.Head>
                  <Table.Head className="text-right">Est. traffic</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {rankings.map((row) => (
                  <Table.Row key={row.keyword}>
                    <Table.Cell className="max-w-xs">
                      <span className="line-clamp-1">{row.keyword}</span>
                    </Table.Cell>
                    <Table.Cell className="max-w-xs">
                      <span className="line-clamp-1">
                        {row.relativeUrl ?? "—"}
                      </span>
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {row.position ?? "—"}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatCount(row.searchVolume)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {row.keywordDifficulty ?? "—"}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatCount(row.traffic)}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        </Section>
      ) : null}

      {suggestions.length > 0 ? (
        <Section
          title="Keyword opportunities"
          subtitle="New keywords worth targeting, based on what the site could realistically rank for."
        >
          <div className="overflow-x-auto rounded-lg border border-base-300">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Keyword</Table.Head>
                  <Table.Head className="text-right">Volume</Table.Head>
                  <Table.Head className="text-right">KD</Table.Head>
                  <Table.Head className="text-right">CPC</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {suggestions.map((row) => (
                  <Table.Row key={row.keyword}>
                    <Table.Cell className="max-w-md">
                      <span className="line-clamp-1">{row.keyword}</span>
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatCount(row.searchVolume)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {row.keywordDifficulty ?? "—"}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {row.cpc != null ? `$${row.cpc.toFixed(2)}` : "—"}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
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
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Anchor (keyword)</Table.Head>
                  <Table.Head>Link to</Table.Head>
                  <Table.Head className="text-right">
                    Current position
                  </Table.Head>
                  <Table.Head className="text-right">
                    Pages to link from
                  </Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {opportunities.slice(0, 5).map((row) => (
                  <Table.Row key={row.query}>
                    <Table.Cell className="max-w-xs">
                      <span className="line-clamp-1">{row.query}</span>
                    </Table.Cell>
                    <Table.Cell className="max-w-xs">
                      <span className="line-clamp-1">
                        {toPath(row.target.page)}
                      </span>
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {Math.round(row.target.position)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {row.sources.length}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        </Section>
      ) : null}

      {backlinkRows.length > 0 ? (
        <Section
          title="Top backlinks"
          subtitle="The strongest links pointing at the site (one per referring domain)."
        >
          <div className="overflow-x-auto rounded-lg border border-base-300">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>From</Table.Head>
                  <Table.Head>Anchor</Table.Head>
                  <Table.Head>To</Table.Head>
                  <Table.Head className="text-right">Rank</Table.Head>
                  <Table.Head className="text-right">Follow</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {backlinkRows.map((row) => (
                  <Table.Row key={`${row.urlFrom}-${row.urlTo}`}>
                    <Table.Cell className="max-w-xs">
                      <span className="line-clamp-1">
                        {row.domainFrom ?? toPath(row.urlFrom)}
                      </span>
                    </Table.Cell>
                    <Table.Cell className="max-w-xs">
                      <span className="line-clamp-1">{row.anchor ?? "—"}</span>
                    </Table.Cell>
                    <Table.Cell className="max-w-xs">
                      <span className="line-clamp-1">{toPath(row.urlTo)}</span>
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {row.rank ?? "—"}
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      {row.isDofollow == null
                        ? "—"
                        : row.isDofollow
                          ? "dofollow"
                          : "nofollow"}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        </Section>
      ) : null}

      {referringDomains.length > 0 ? (
        <Section
          title="Top referring domains"
          subtitle="Where the site's authority comes from."
        >
          <div className="overflow-x-auto rounded-lg border border-base-300">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Domain</Table.Head>
                  <Table.Head className="text-right">Backlinks</Table.Head>
                  <Table.Head className="text-right">Rank</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {referringDomains.map((row, index) => (
                  <Table.Row key={row.domain ?? `row-${index}`}>
                    <Table.Cell className="max-w-md">
                      <span className="line-clamp-1">{row.domain ?? "—"}</span>
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatCount(row.backlinks)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {row.rank ?? "—"}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        </Section>
      ) : null}
    </>
  );
}
