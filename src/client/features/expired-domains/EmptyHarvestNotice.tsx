import { Link } from "@tanstack/react-router";
import type { HarvestReadiness } from "@/server/features/expired-domains/harvestReadiness";

/** A draft claimed this long ago and still empty has failed, not stalled. */
const DRAFT_IN_FLIGHT_MS = 10 * 60 * 1_000;

/**
 * Why the list is empty, in terms the user can act on. The old copy told a
 * project with no vocabulary to click Harvest, which could only ever fail.
 */
export function EmptyHarvestNotice({
  readiness,
  projectId,
  domain,
}: {
  readiness: HarvestReadiness;
  projectId: string;
  domain: string;
}) {
  const profileLink = (
    <Link
      to="/p/$projectId/keywords"
      params={{ projectId }}
      className="font-medium underline"
    >
      Business profile on Keyword Research
    </Link>
  );

  if (readiness.kind === "ready") {
    return (
      <p className="py-4 text-base-content/70">
        Nothing harvested yet. Each day&apos;s drops are pulled automatically
        after 03:00 UTC, or click <strong>Harvest next day</strong> to pull one
        now — it is included in your subscription and costs nothing extra.
      </p>
    );
  }

  if (readiness.kind === "needs-input") {
    return (
      <p className="py-4 text-base-content/70">
        There is nothing to match dropped domains against yet: the business
        profile has no industry words and no keywords are tracked. Describe what
        this business offers in the {profileLink}, or track a few keywords.
      </p>
    );
  }

  const draftedMs =
    readiness.kind === "draft-waiting" && readiness.draftedAt
      ? Date.parse(readiness.draftedAt)
      : Number.NaN;
  const draftFailed =
    readiness.kind === "draft-waiting" &&
    (!Number.isFinite(draftedMs) ||
      Date.now() - draftedMs > DRAFT_IN_FLIGHT_MS);

  return (
    <p className="py-4 text-base-content/70">
      {draftFailed
        ? `The automatic business profile for ${domain} came back empty, so there are no industry words to match yet. It retries once a day — or describe what the business offers in the `
        : `Learning ${domain}'s industry words: a business profile is drafted from the site automatically, and the daily harvest starts once it has words in it. To start now, describe what the business offers in the `}
      {profileLink}.
    </p>
  );
}
