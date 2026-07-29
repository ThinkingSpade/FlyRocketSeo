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

/**
 * What to work on next, ranked, with the action spelled out.
 *
 * This is the tab's primary content. The comparison chart below it answers a
 * narrower question -- how does interest in these five terms move over the
 * year -- and could never answer this one, because Google Trends returns no
 * data at all for most of a local business's keywords (measured: 0 for
 * `dallas vending services`, 0 for `dallas healthy vending`, 2 for `dfw
 * vending`). Search Console has no such threshold, which is why everything
 * here is built on it.
 *
 * Free to render. Two unmetered Search Console reads and pure client-side
 * work; nothing here can reach a paid provider.
 */

const INITIAL_ROWS = 8;

type Props = { projectId: string };

export function TrendingOpportunitiesCard({ projectId }: Props) {
  const { opportunities, isLoading, unavailable, priorPeriodTruncated } =
    useTrendingOpportunities(projectId);
  const [showAll, setShowAll] = useState(false);

  if (isLoading) return <OpportunitiesSkeleton />;
  if (unavailable) return null;

  // Only rows we are actually recommending. "Skip" and "watch" rows exist in
  // the model so the ranking is honest, but a to-do list that opens with
  // things not to do is not a to-do list.
  const actionable = opportunities.filter(isActionable);
  if (actionable.length === 0) return null;

  const shown = showAll ? actionable : actionable.slice(0, INITIAL_ROWS);

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
            market does.
          </p>
        </div>

        {priorPeriodTruncated ? (
          <p className="text-sm text-base-content/60">
            You rank for more queries than Search Console returns in one pull,
            so some rows have no earlier figure to compare against — that means
            we couldn’t retrieve one, not that the keyword is new.
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
          <button
            type="button"
            className="btn btn-ghost btn-sm w-fit"
            onClick={() => setShowAll((current) => !current)}
          >
            {showAll
              ? "Show fewer"
              : `Show all ${actionable.length} opportunities`}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Where each action hands off.
 *
 * Deliberately links rather than doing the work here. Rewriting a page is
 * Content Optimizer's job, validating a new topic is Keyword Research's, and
 * finding out why impressions fell is Search Performance's; the first two cost
 * credits, and a list that spent them because it rendered would be exactly the
 * auto-spend this app refuses.
 */
type ActionTarget =
  | { label: string; to: "keywords" }
  | { label: string; to: "content" }
  | { label: string; to: "search-performance" };

function actionTarget(opportunity: TrendingOpportunity): ActionTarget {
  switch (opportunity.action) {
    case "write-new":
      return { label: "Research it", to: "keywords" };
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
        {target.to === "keywords" ? (
          <Link
            to="/p/$projectId/keywords"
            params={{ projectId }}
            search={{ q: opportunity.keyword }}
            className="link link-primary whitespace-nowrap text-sm"
          >
            {target.label}
            <ArrowRight className="ml-0.5 inline size-3" />
          </Link>
        ) : target.to === "search-performance" ? (
          <Link
            to="/p/$projectId/search-performance"
            params={{ projectId }}
            className="link link-primary whitespace-nowrap text-sm"
          >
            {target.label}
            <ArrowRight className="ml-0.5 inline size-3" />
          </Link>
        ) : (
          <Link
            to="/p/$projectId/content"
            params={{ projectId }}
            search={{ q: opportunity.keyword }}
            className="link link-primary whitespace-nowrap text-sm"
          >
            {target.label}
            <ArrowRight className="ml-0.5 inline size-3" />
          </Link>
        )}
      </div>
    </li>
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
