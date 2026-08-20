import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { useVisibleKeys } from "./useVisibleKeys";
import {
  Check,
  ArrowSquareOut,
  FileMagnifyingGlass,
  Graph,
} from "@phosphor-icons/react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { checkLinkPresence } from "@/serverFunctions/link-insights";
import {
  toPath,
  useLinkInsights,
} from "@/client/features/link-insights/useLinkInsights";
// The fit decision lives with SEO Opportunities because that tab makes it
// first, and it is the same decision about the same GSC queries.
import { excludeWrongCustomer } from "@/client/features/opportunities/opportunityModel";
import {
  useKeywordFit,
  useProjectProfile,
} from "@/client/features/profiles/useProjectProfile";
import { QueryStateBoundary } from "@/client/components/state/QueryStateBoundary";
import { resolveQueryState } from "@/client/components/state/queryState";
import { AppPageShell } from "@/client/components/AppPageShell";
import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Loader } from "@cloudflare/kumo/components/loader";
import { buttonVariants } from "@cloudflare/kumo/components/button";
import { Table } from "@cloudflare/kumo/components/table";

type PresenceResult = {
  linksToTarget: boolean;
  mentionsPhrase: boolean;
  error: string | null;
};

function PresenceBadge({ presence }: { presence: PresenceResult | undefined }) {
  if (presence === undefined) {
    return <Loader size="sm" />;
  }
  if (presence.error) {
    return (
      <span title={presence.error}>
        <Badge variant="neutral">couldn&rsquo;t check</Badge>
      </span>
    );
  }
  if (presence.linksToTarget) {
    return (
      <Badge variant="neutral" className="gap-1">
        <Check className="size-3" /> already links
      </Badge>
    );
  }
  if (presence.mentionsPhrase) {
    return (
      <span title="This page already mentions the phrase — ideal place to add the link">
        <Badge variant="success">add link — mentions phrase</Badge>
      </span>
    );
  }
  return <Badge variant="warning">add link</Badge>;
}

export function LinkOpportunitiesPage({
  projectId,
  focusQuery = null,
}: {
  projectId: string;
  /** The query an inbound link asked about; sorted first and marked, so the
   *  user lands on the card they clicked rather than hunting for it. */
  focusQuery?: string | null;
}) {
  const insightsQuery = useLinkInsights(projectId);
  const data = insightsQuery.data;
  const allOpportunities = useMemo(
    () => (data?.connected ? data.opportunities : []),
    [data],
  );

  // An internal link is a vote for which page should own a query, and casting
  // it for somebody else's customer entrenches the wrong page — a costlier
  // mistake than merely listing that query, because it changes the site. Free:
  // one D1 read for the profile, then pure string work over queries already
  // here. With no confirmed profile nothing is dropped.
  const { profile } = useProjectProfile(projectId);
  const queries = useMemo(
    () => allOpportunities.map((row) => row.query),
    [allOpportunities],
  );
  const fit = useKeywordFit(profile, queries);
  const focus = focusQuery?.trim().toLowerCase() ?? null;
  const { opportunities, wrongCustomer } = useMemo(() => {
    const { kept, excluded } = excludeWrongCustomer(allOpportunities, fit);
    // Sorted, not filtered, for the reason Cannibalization gives: one card is
    // read against the others, and the rest are the context.
    const ordered = focus
      ? kept.toSorted(
          (a, b) =>
            (a.query.toLowerCase() === focus ? 0 : 1) -
            (b.query.toLowerCase() === focus ? 0 : 1),
        )
      : kept;
    return { opportunities: ordered, wrongCustomer: excluded };
  }, [allOpportunities, fit, focus]);

  // Live-check each suggested source page (one fetch per serverFn call,
  // cached server-side for a day).
  //
  // Gated on the row having been scrolled to. Every check is a real fetch of
  // the client's own site, and building them all on mount fired up to fifteen
  // opportunities x five sources against that site the moment the tab opened
  // -- before anyone had read the first row.
  const { visible, observe } = useVisibleKeys();
  const checks = opportunities.flatMap((opportunity) =>
    opportunity.sources.map((source) => ({
      key: `${source.page}→${opportunity.target.page}`,
      sourceUrl: source.page,
      targetUrl: opportunity.target.page,
      phrase: opportunity.query,
      owner: opportunity.query,
    })),
  );
  const presenceQueries = useQueries({
    queries: checks.map((check) => ({
      queryKey: ["link-presence", projectId, check.key, check.phrase],
      queryFn: async (): Promise<PresenceResult> =>
        checkLinkPresence({
          data: {
            projectId,
            sourceUrl: check.sourceUrl,
            targetUrl: check.targetUrl,
            phrase: check.phrase,
          },
        }),
      staleTime: 60 * 60_000,
      retry: 1,
      enabled: visible.has(check.owner),
    })),
  });
  const presenceByKey = new Map<string, PresenceResult>();
  checks.forEach((check, index) => {
    const result = presenceQueries[index]?.data;
    if (result !== undefined) {
      presenceByKey.set(`${check.key}|${check.phrase}`, result);
    }
  });

  return (
    <AppPageShell>
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Graph className="size-6" />
          Link Opportunities
        </h1>
        <p className="text-sm text-base-content/60">
          Internal links you should add: for each keyword you almost rank for,
          these are your own pages Google already associates with it — link from
          them to the target page using the keyword as the anchor.
          {/* Named rather than silently applied: the verdict comes from the
              exclusion lines the user wrote on the profile, so a card missing
              in error has to be legible as a wrong line — and the profile is
              edited on another tab, so saying so without a way there would be
              the same dead end this tab already had. Suppressed once the list
              is empty, where the card below tells the whole story. */}
          {wrongCustomer > 0 && opportunities.length > 0 ? (
            <>
              {" "}
              {wrongCustomer}{" "}
              {wrongCustomer === 1 ? "keyword is" : "keywords are"} left out as
              somebody else&rsquo;s customer, going by your{" "}
              <Link
                to="/p/$projectId/opportunities"
                params={{ projectId }}
                className="app-link-subtle"
              >
                project profile
              </Link>
              .
            </>
          ) : null}
        </p>
      </div>

      {insightsQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader size="base" />
        </div>
      ) : null}

      {insightsQuery.isError ? (
        <Banner variant="error" className="text-sm">
          {getStandardErrorMessage(insightsQuery.error)}
        </Banner>
      ) : null}

      {data && !data.connected ? (
        <div className="relative flex flex-col rounded-xl border border-dashed border-base-300">
          <div className="flex flex-auto flex-col items-center py-12 text-center gap-2">
            <p className="font-medium">Connect Search Console first</p>
            <p className="max-w-md text-sm text-base-content/60">
              Link opportunities are built from your own Search Console data.
            </p>
            <Link
              to="/p/$projectId/search-performance"
              params={{ projectId }}
              className={`${buttonVariants({ variant: "primary", size: "sm" })} mt-2`}
            >
              Go to GSC Insights
            </Link>
          </div>
        </div>
      ) : null}

      {/* Scoped to the empty case only: the dashed card and the rows are
          siblings here, so wrapping the rows as children would change the page
          layout. The boundary owns whether an absence may be CLAIMED -- with a
          capped pull it replaces the confident sentence rather than appending a
          caveat to it. */}
      {data?.connected && opportunities.length === 0 ? (
        <div className="relative flex flex-col rounded-xl border border-dashed border-base-300">
          <div className="flex flex-auto flex-col items-center py-6 gap-2 text-sm">
            <QueryStateBoundary
              state={resolveQueryState({
                isPending: false,
                isError: false,
                connected: true,
                rowCount: opportunities.length,
                // An emptied list is not an empty one. Saying nothing ranks
                // 4–20 with two of your pages, after the fit pass removed
                // every card that did, reports an absence we created — which
                // is the same distinction `filtered` already exists to make.
                filtered: wrongCustomer > 0,
                sampling: [
                  {
                    label: "The Search Console query-and-page pull",
                    truncated: data.truncated,
                    rowsExamined: data.rowsExamined,
                  },
                ],
              })}
              loading={null}
              errorMessage="Link opportunities could not be loaded."
              emptyTitle="No opportunities right now"
              emptyBody="This fills in once queries rank in positions 4–20 with more than one of your pages appearing for them."
              filteredTitle="Nothing left after the profile check"
              filteredBody={`All ${wrongCustomer} link ${wrongCustomer === 1 ? "opportunity is" : "opportunities are"} for somebody else's customer, going by your project profile. Loosen an exclusion line if that looks wrong.`}
            >
              {null}
            </QueryStateBoundary>
          </div>
        </div>
      ) : null}

      {opportunities.map((opportunity) => (
        <div
          key={opportunity.query}
          ref={observe(opportunity.query)}
          className={`relative flex flex-col rounded-xl border bg-base-100 ${
            focus && opportunity.query.toLowerCase() === focus
              ? "border-primary"
              : "border-base-300"
          }`}
        >
          <div className="flex flex-auto flex-col gap-3 p-4 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="text-sm text-base-content/60">
                  Boost{" "}
                  <a
                    href={opportunity.target.page}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-base-content hover:underline"
                  >
                    {toPath(opportunity.target.page)}
                  </a>{" "}
                  — currently #{Math.round(opportunity.target.position)} for
                </span>{" "}
                <Badge variant="outline">{opportunity.query}</Badge>{" "}
                {/* The card names a page to improve and, until now, offered no
                    way into any tab that works on one. Page Explorer takes `u`
                    and only prefills its field — nothing runs, and nothing is
                    billed, until the user presses Analyze there. */}
                <Link
                  to="/p/$projectId/page"
                  params={{ projectId }}
                  search={{ u: opportunity.target.page }}
                  className={buttonVariants({ variant: "ghost", size: "xs" })}
                >
                  <FileMagnifyingGlass className="size-3" />
                  Open this page
                </Link>
              </div>
              <span className="text-xs text-base-content/50 tabular-nums">
                {opportunity.target.impressions.toLocaleString()} impressions ·
                anchor: &ldquo;{opportunity.query}&rdquo;
              </span>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.Head>Link from</Table.Head>
                    <Table.Head className="text-right">
                      Its impressions for query
                    </Table.Head>
                    <Table.Head className="text-right">Status</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {opportunity.sources.map((source) => (
                    <Table.Row key={source.page}>
                      <Table.Cell className="max-w-md">
                        <a
                          href={source.page}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          <span className="line-clamp-1">
                            {toPath(source.page)}
                          </span>
                          <ArrowSquareOut className="size-3 shrink-0 text-base-content/40" />
                        </a>
                      </Table.Cell>
                      <Table.Cell className="text-right tabular-nums">
                        {source.impressions.toLocaleString()}
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        <PresenceBadge
                          presence={presenceByKey.get(
                            `${source.page}→${opportunity.target.page}|${opportunity.query}`,
                          )}
                        />
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>
          </div>
        </div>
      ))}

      {data?.connected ? (
        <p className="text-xs text-base-content/40">
          Based on Search Console data {data.range.startDate} –{" "}
          {data.range.endDate}. Free — uses your own GSC data.
        </p>
      ) : null}
    </AppPageShell>
  );
}
