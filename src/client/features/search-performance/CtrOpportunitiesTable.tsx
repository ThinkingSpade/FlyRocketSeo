import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
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
  projectId,
  rows,
  sampling,
  focusQuery = null,
}: {
  projectId: string;
  rows: CtrRow[];
  /** How complete the pull these rows were derived from was. Evidence rather
   *  than a `sampled` boolean: the all-clear below is only sayable when the pull
   *  ran to completion, and that has to be proven, not asserted. */
  sampling: readonly QuerySamplingEvidence[];
  /** The query an inbound link asked about; sorted first and marked, so the
   *  user lands on the row they clicked rather than hunting for it. */
  focusQuery?: string | null;
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

  const focus = focusQuery?.trim().toLowerCase() ?? null;
  // Sorted, not filtered, exactly as Cannibalization handles the same handoff:
  // the neighbouring rows are what tell you whether one under-clicked query is
  // a page problem or a site-wide one, and filtering would hide them.
  const ordered = useMemo(() => {
    if (!focus) return rows;
    return rows.toSorted((a, b) => {
      const aHit = a.query.toLowerCase() === focus ? 0 : 1;
      const bHit = b.query.toLowerCase() === focus ? 0 : 1;
      return aHit - bHit;
    });
  }, [rows, focus]);

  // When the reader arrived here about one query, the "rewrite it" link can
  // land on that query's own page rather than the top of a traffic-sorted
  // list. Without a focus there is no single page to name, so it stays a
  // plain pointer at the tab.
  const focusedPage = focus
    ? rows.find((row) => row.query.toLowerCase() === focus)?.page
    : undefined;

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
            {ordered.map((row) => (
              <Table.Row
                key={`${row.query}::${row.page}`}
                className={
                  focus && row.query.toLowerCase() === focus
                    ? "bg-primary/5"
                    : undefined
                }
              >
                <Table.Cell className="max-w-xs">
                  <span className="line-clamp-1">{row.query}</span>
                </Table.Cell>
                <Table.Cell className="max-w-xs">
                  {/* The row's whole instruction is "go look at this page";
                      it was bare text. The scheme check is defense-in-depth —
                      GSC page keys are canonical http(s) URLs of the verified
                      property, but an href is rendered from them. */}
                  {/^https?:\/\//.test(row.page) ? (
                    <a
                      href={row.page}
                      target="_blank"
                      rel="noreferrer"
                      className="app-link-subtle line-clamp-1"
                      title={row.page}
                    >
                      {toPath(row.page)}
                    </a>
                  ) : (
                    <span className="line-clamp-1">{toPath(row.page)}</span>
                  )}
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
          title fixes none of them. So: investigate first.

          The rewrite is now a link. This paragraph named the exact job On-Page
          Fixes does and left the user to find that tab themselves. */}
        <p className="border-t border-base-300 px-4 py-2 text-xs text-base-content/50">
          These rank well but earn fewer clicks than usual for their position.
          Check the live results first — a snippet or ad block may be absorbing
          them — then rewrite the title and meta to match intent in{" "}
          <Link
            to="/p/$projectId/on-page"
            params={{ projectId }}
            search={focusedPage ? { u: focusedPage } : {}}
            className="app-link-subtle"
          >
            On-Page Fixes
          </Link>
          .
        </p>
      </div>
    </QueryStateBoundary>
  );
}
