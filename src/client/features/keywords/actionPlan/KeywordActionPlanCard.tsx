import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, MapPin, PenLine, Target } from "lucide-react";
import { useAhrefsDomainRatings } from "@/client/features/backlinks/useAhrefsDomainRatings";
import { useProjectProfile } from "@/client/features/profiles/useProjectProfile";
import { wantsGeoModifiers } from "@/shared/keyword-fit/profileTypes";
import type { SerpResultItem } from "@/types/keywords";
import { assessRanking, rankingVerdictLabel } from "./rankingVerdict";
import { serpPageTypeLabel, summarizeSerpShape } from "./serpShape";

/**
 * What it would actually take to rank for the keyword on screen.
 *
 * Everything rendered here is free. The verdict comes from Ahrefs' public,
 * keyless DR lookup (the same source SERP Overview already reads) and the
 * content advice comes from the ranking URLs the SERP panel has ALREADY
 * fetched -- so answering "can I win this, and with what?" costs nothing
 * beyond the SERP the user chose to run.
 *
 * The off-page and local steps deliberately hand off to the tabs that own
 * them rather than firing their own metered calls from here. Backlink data
 * costs credits per run, and a panel that spent them because a row was
 * clicked is exactly the auto-spend this app refuses to do. A link puts the
 * decision where the user can see the price.
 */

type Props = {
  projectId: string;
  keyword: string;
  serpResults: SerpResultItem[];
  /** This project's own DR, already loaded by the page. */
  ownDomainRating: number | null;
};

export function KeywordActionPlanCard({
  projectId,
  keyword,
  serpResults,
  ownDomainRating,
}: Props) {
  const { profile } = useProjectProfile(projectId);
  const { ratings, loadRatings } = useAhrefsDomainRatings(projectId);

  const competitorDomains = serpResults.map((item) => item.domain);
  const domainKey = competitorDomains.join(",");

  // Free and keyless, the same class of call the page already makes on mount
  // for the project's own domain -- so it loads on render rather than behind
  // a button. Nothing metered is reachable from this component.
  useEffect(() => {
    if (domainKey) void loadRatings(domainKey.split(","));
  }, [domainKey, loadRatings]);

  if (serpResults.length === 0) return null;

  const assessment = assessRanking({
    ownDomainRating,
    competitorRatings: competitorDomains.map(
      (domain) => ratings?.[domain] ?? null,
    ),
  });
  const shape = summarizeSerpShape(serpResults.map((item) => item.url));
  const isLocal = wantsGeoModifiers(profile.serviceAreaKind);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-base-300 bg-base-100">
      <div className="shrink-0 border-b border-base-300 px-4 py-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Target className="size-3.5 text-base-content/50" />
          How to rank for this
        </h3>
      </div>

      <div className="flex flex-col gap-3 p-4">
        <div>
          <p className="text-sm font-medium">
            {rankingVerdictLabel(assessment.verdict)}
          </p>
          <p className="text-sm text-base-content/70">{assessment.reason}</p>
        </div>

        {shape ? (
          <PlanStep icon={<PenLine className="size-3.5" />}>
            <span className="font-medium">Write the shape that wins.</span>{" "}
            {shape.count} of the {shape.total} results are{" "}
            {serpPageTypeLabel(shape.dominant)}. Match that format before trying
            to out-write it.{" "}
            <Link
              to="/p/$projectId/content"
              params={{ projectId }}
              // Content Optimizer's own search param for the target keyword.
              search={{ q: keyword }}
              className="link link-primary"
            >
              Open Content Optimizer
              <ArrowRight className="ml-0.5 inline size-3" />
            </Link>
          </PlanStep>
        ) : null}

        {isLocal ? (
          <PlanStep icon={<MapPin className="size-3.5" />}>
            <span className="font-medium">
              Half this result is the local pack.
            </span>{" "}
            For a business serving one area, the Google Business Profile
            category, service area and review flow move this keyword as much as
            the page does.{" "}
            <Link
              to="/p/$projectId/local"
              params={{ projectId }}
              className="link link-primary"
            >
              Open Local SEO
              <ArrowRight className="ml-0.5 inline size-3" />
            </Link>
          </PlanStep>
        ) : null}

        {assessment.verdict !== "unknown" ? (
          <PlanStep icon={<ArrowRight className="size-3.5" />}>
            <span className="font-medium">See who links to them.</span>{" "}
            {assessment.verdict === "unlikely"
              ? "This page needs authority before content will move it."
              : "The gap that is left after the page is right is usually links."}{" "}
            <Link
              to="/p/$projectId/backlinks"
              params={{ projectId }}
              className="link link-primary"
            >
              Open Backlinks
              <ArrowRight className="ml-0.5 inline size-3" />
            </Link>{" "}
            <span className="text-base-content/50">(uses credits there)</span>
          </PlanStep>
        ) : null}
      </div>
    </div>
  );
}

function PlanStep({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-sm text-base-content/80">
      <span className="mt-0.5 shrink-0 text-base-content/40">{icon}</span>
      <p>{children}</p>
    </div>
  );
}
