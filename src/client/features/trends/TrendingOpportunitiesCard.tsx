import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, TrendingUp } from "lucide-react";
import { formatNumber } from "@/client/features/keywords/utils";
import {
  isActionable,
  opportunityActionLabel,
  type TrendingOpportunity,
} from "./opportunityActions";
import { momentumLabel } from "./queryMomentum";
import { useTrendingOpportunities } from "./useTrendingOpportunities";
import { Button } from "@cloudflare/kumo/components/button";

/**
 * What to work on next, ranked, with the action spelled out.
 *
 * This is the tab's primary content. The comparison chart below it answers a
 * narrower question -- how interest in five terms moves over a year -- and
 * could never answer this one, because Google Trends returns no data at all
 * for most of a local business's keywords (measured: 0 for `dallas vending
 * services`, 0 for `dallas healthy vending`, 2 for `dfw vending`). Search
 * Console has no such threshold, which is why everything here is built on it.
 *
 * Free to render: two unmetered Search Console reads plus pure client-side
 * work. Nothing here can reach a paid provider.
 */

const INITIAL_ROWS = 8;

type Props = { projectId: string };

export function TrendingOpportunitiesCard({ projectId }: Props) {
  const {
    opportunities,
    isLoading,
    unavailable,
    priorPeriodTruncated,
    currentPeriodTruncated,
    empty,
  } = useTrendingOpportunities(projectId);
  const [showAll, setShowAll] = useState(false);

  if (isLoading) return <OpportunitiesSkeleton />;
  // Search Console genuinely isn't connected. The tab's own chart still works,
  // so this stays silent rather than nagging.
  if (unavailable) return null;

  // "Skip"/"watch" rows exist in the model so the ranking is honest, but a
  // to-do list that opens with things not to do is not a to-do list.
  const actionable = opportunities.filter(isActionable);

  // Connected, read fine, nothing to say. Explaining beats vanishing: a card
  // that disappears reads as a broken feature.
  //
  // Two different empty states, because "you have none" and "none in what we
  // could read" are different facts. Search Console returns rows ordered by
  // clicks and does not promise all of them, so when the pull hit our limit we
  // have not established absence and must not claim it.
  if (empty || actionable.length === 0) {
    return (
      <Shell>
        {currentPeriodTruncated ? (
          <p className="text-sm text-base-content/60">
            Nothing to act on among the queries Search Console returned. It
            returns them ordered by clicks and caps how many come back at once,
            so this is not the whole picture — a high-impression keyword with no
            clicks yet could be sitting outside it.
          </p>
        ) : (
          <p className="text-sm text-base-content/60">
            Search Console has no queries with enough impressions yet to rank.
            Once a keyword reaches around ten impressions in a period, it shows
            up here with something to do about it.
          </p>
        )}
      </Shell>
    );
  }

  const shown = showAll ? actionable : actionable.slice(0, INITIAL_ROWS);

  return (
    <Shell>
      {currentPeriodTruncated ? (
        <p className="text-sm text-base-content/60">
          You rank for more queries than Search Console returns in one pull, and
          it returns them ordered by clicks — so a high-impression keyword with
          no clicks yet may be missing from this ranking.
        </p>
      ) : null}
      {priorPeriodTruncated ? (
        <p className="text-sm text-base-content/60">
          Some rows have no earlier figure to compare against. That means we
          couldn’t retrieve one, not that the keyword is new.
        </p>
      ) : null}

      <ul className="flex flex-col divide-y divide-base-200">
        {shown.map((opportunity) => (
          <OpportunityRow
            key={opportunity.keyword}
            projectId={projectId}
            opportunity={opportunity}
          />
        ))}
      </ul>

      {actionable.length > INITIAL_ROWS ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit"
          onClick={() => setShowAll((current) => !current)}
        >
          {showAll
            ? "Show fewer"
            : `Show all ${actionable.length} opportunities`}
        </Button>
      ) : null}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-3 p-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <TrendingUp className="size-4 text-base-content/50" />
            What to work on next
          </h2>
          <p className="text-sm text-base-content/60">
            Ranked from your Search Console impressions this period against the
            one before it — the signal that exists for keywords Google Trends is
            too coarse to see. Impressions track how often <em>your</em> result
            was shown, so they move when your rankings move, not only when the
            market does. Not filtered by location — the picker above applies to
            the Trends chart, not to this list.
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Where each action hands off.
 *
 * Deliberately links rather than doing the work here. Rewriting a page is
 * Content Optimizer's job, untangling competing pages is Cannibalization's,
 * and explaining a drop is Search Performance's. Several of those cost
 * credits, and a list that spent them because it rendered would be exactly the
 * auto-spend this app refuses.
 */
type ActionTarget = {
  label: string;
  to: "content" | "cannibalization" | "search-performance";
};

function actionTarget(opportunity: TrendingOpportunity): ActionTarget {
  switch (opportunity.action) {
    case "consolidate":
      return { label: "Open Cannibalization", to: "cannibalization" };
    case "investigate":
      return { label: "See what changed", to: "search-performance" };
    default:
      return { label: "Open in Content Optimizer", to: "content" };
  }
}

function OpportunityRow({
  projectId,
  opportunity,
}: {
  projectId: string;
  opportunity: TrendingOpportunity;
}) {
  const target = actionTarget(opportunity);

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">
            {opportunityActionLabel(opportunity.action)}
          </span>
          <span className="text-base-content/80">{opportunity.keyword}</span>
        </p>
        <p className="text-sm text-base-content/60">{opportunity.reason}</p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className="text-sm tabular-nums text-base-content/50">
          {formatNumber(opportunity.momentum.impressions)} impr ·{" "}
          {momentumLabel(opportunity.momentum)}
        </span>
        <OpportunityLink
          projectId={projectId}
          keyword={opportunity.keyword}
          target={target}
        />
      </div>
    </li>
  );
}

function OpportunityLink({
  projectId,
  keyword,
  target,
}: {
  projectId: string;
  keyword: string;
  target: ActionTarget;
}) {
  const className = "link link-primary whitespace-nowrap text-sm";
  const body = (
    <>
      {target.label}
      <ArrowRight className="ml-0.5 inline size-3" />
    </>
  );

  if (target.to === "cannibalization") {
    return (
      <Link
        to="/p/$projectId/cannibalization"
        params={{ projectId }}
        className={className}
      >
        {body}
      </Link>
    );
  }
  if (target.to === "search-performance") {
    return (
      <Link
        to="/p/$projectId/search-performance"
        params={{ projectId }}
        className={className}
      >
        {body}
      </Link>
    );
  }
  return (
    <Link
      to="/p/$projectId/content"
      params={{ projectId }}
      search={{ q: keyword }}
      className={className}
    >
      {body}
    </Link>
  );
}

function OpportunitiesSkeleton() {
  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-3 p-4">
        <div className="h-4 w-48 animate-pulse rounded bg-base-200" />
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-10 animate-pulse rounded bg-base-200"
            style={{ animationDelay: `${index * 60}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
