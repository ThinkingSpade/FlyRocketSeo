import {
  resolveQueryState,
  type QuerySamplingEvidence,
} from "@/client/components/state/queryState";
import { QueryStateBoundary } from "@/client/components/state/QueryStateBoundary";
import { Table } from "@cloudflare/kumo/components/table";

type CtrRow = {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  missedClicks: number;
};

function toPath(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}

/** Queries ranking well but clicked far below the benchmark for their
 *  position — each row is a title/meta rewrite candidate, sized by the
 *  clicks it's leaving on the table. */
export function CtrOpportunitiesTable({
  rows,
  sampling,
}: {
  rows: CtrRow[];
  /** How complete the pull these rows were derived from was. Evidence rather
   *  than a `sampled` boolean: the all-clear below is only sayable when the pull
   *  ran to completion, and that has to be proven, not asserted. */
  sampling: readonly QuerySamplingEvidence[];
}) {
  // Lifecycle belongs to the parent's report query — by the time rows exist it
  // has already resolved. Only the emptiness is this component's to judge, so
  // pending/error are stated false rather than plumbed through.
  const state = resolveQueryState({
    isPending: false,
    isError: false,
    connected: true,
    rowCount: rows.length,
    sampling,
  });

  return (
    <QueryStateBoundary
      state={state}
      loading={null}
      errorMessage=""
      emptyTitle="No CTR laggards found"
      emptyBody="Every well-ranking query is earning a healthy share of the clicks available at its position."
    >
      <div className="overflow-x-auto">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.Head>Query</Table.Head>
              <Table.Head>Page</Table.Head>
              <Table.Head className="text-right">Position</Table.Head>
              <Table.Head className="text-right">Impressions</Table.Head>
              <Table.Head className="text-right">CTR</Table.Head>
              <Table.Head
                className="text-right"
                title="Estimated clicks lost per period"
              >
                Missed clicks
              </Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row key={`${row.query}::${row.page}`}>
                <Table.Cell className="max-w-xs">
                  <span className="line-clamp-1">{row.query}</span>
                </Table.Cell>
                <Table.Cell className="max-w-xs">
                  <span className="line-clamp-1">{toPath(row.page)}</span>
                </Table.Cell>
                <Table.Cell className="text-right tabular-nums">
                  {row.position.toFixed(1)}
                </Table.Cell>
                <Table.Cell className="text-right tabular-nums">
                  {row.impressions.toLocaleString()}
                </Table.Cell>
                <Table.Cell className="text-right tabular-nums">
                  {(row.ctr * 100).toFixed(1)}%
                </Table.Cell>
                <Table.Cell className="text-right font-medium tabular-nums text-warning">
                  ~{row.missedClicks.toLocaleString()}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
        {/* Kept as guidance, softened from a diagnosis. Search Console reports
          clicks, impressions and position — never WHY someone didn't click. A
          featured snippet answering the query, brand preference, or a title that
          already matches intent all produce this same row, and rewriting the
          title fixes none of them. So: investigate first. */}
        <p className="border-t border-base-300 px-4 py-2 text-xs text-base-content/50">
          These rank well but earn fewer clicks than usual for their position.
          Check the live results first — a snippet or ad block may be absorbing
          them — then consider rewriting the title and meta to match intent.
        </p>
      </div>
    </QueryStateBoundary>
  );
}
