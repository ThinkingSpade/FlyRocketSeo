import { useState } from "react";
import {
  CircleCheck,
  CircleHelp,
  ExternalLink,
  ScanSearch,
  Search,
} from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getCitationReport } from "@/serverFunctions/citations";
import { citationTrackerResultSchema } from "@/types/schemas/citations";
import {
  DIRECTORIES,
  type DirectoryEntry,
} from "@/shared/citations/directories";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import { RestoredRunBanner } from "@/client/features/analysis-runs/RestoredRunBanner";
import { RecentRunsList } from "@/client/features/analysis-runs/RecentRunsList";
import {
  createMeteredRunKey,
  useAuthorizedRun,
  useMeteredQuery,
} from "@/client/lib/useMeteredQuery";
import { useProjectMarket } from "@/client/hooks/useProjectDomain";
import { InsightIcon } from "@/client/components/InsightTile";
import { NextStepsCard } from "@/client/features/insights/NextStepsCard";
import {
  buildCitationReport,
  type CitationMatch,
  type CitationReport,
} from "./citationModel";

/** "City, Region" when both are on file, otherwise whichever one is --
 *  matches what CitationTrackerService expects as its single `city` field,
 *  and what citationModel.ts reads for its own thin-data threshold and
 *  read-text label. Kept as one combined string rather than teaching either
 *  of those a separate "region" concept for a detail that's only ever used
 *  to sharpen the same disambiguator. */
function combineCityRegion(
  city: string | null,
  region: string | null,
): string | null {
  if (city && region) return `${city}, ${region}`;
  return city ?? region ?? null;
}

/** Every entry here is a CONFIRMED match (report.found -- see
 *  citationModel.ts's finding-A1 doc): a corroborating signal backs up the
 *  domain match, so "View listing" is an honest label. An unconfirmed
 *  appearance is a different, separately-labelled group below
 *  (CitationUnconfirmedList) -- never mixed into this count or this link
 *  text. */
function CitationFoundList({ found }: { found: CitationMatch[] }) {
  if (found.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-base-content/50">
        Found in search ({found.length})
      </h3>
      <ul className="mt-1 divide-y divide-base-200">
        {found.map((match) => (
          <li
            key={match.directory.id}
            className="flex items-center justify-between gap-2 py-1.5 text-sm"
          >
            <span className="flex items-center gap-1.5">
              <InsightIcon icon={CircleCheck} tone="success" />
              {match.directory.name}
            </span>
            <a
              href={match.url}
              target="_blank"
              rel="noreferrer"
              className="link link-hover flex shrink-0 items-center gap-1 text-xs text-base-content/60"
            >
              View listing
              <ExternalLink className="size-3" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A domain match alone only proves the directory appeared somewhere in
 * results, never that this particular result is the business's own listing
 * (finding A1, citationModel.ts's isCorroborated) -- a directory's own
 * search/category page, or unrelated editorial content on the same domain,
 * matches just as well as an actual listing does. Reported here as its own
 * clearly-labelled group rather than folded into "Found in search"
 * (report.found), and never counted toward citation coverage. Not dropped
 * either: the directory did appear, which is still real, useful information
 * worth a manual look.
 */
function CitationUnconfirmedList({
  unconfirmed,
}: {
  unconfirmed: CitationMatch[];
}) {
  if (unconfirmed.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-base-content/50">
        Appeared, but not confirmed as your listing ({unconfirmed.length})
      </h3>
      <p className="mt-0.5 text-xs text-base-content/50">
        These directories turned up in search, but nothing tied the result to
        this business specifically -- it may be a search page, a category page,
        or someone else&rsquo;s listing. Worth checking by hand; not counted
        toward the coverage figure above.
      </p>
      <ul className="mt-1 divide-y divide-base-200">
        {unconfirmed.map((match) => (
          <li
            key={match.directory.id}
            className="flex items-center justify-between gap-2 py-1.5 text-sm"
          >
            <span className="flex items-center gap-1.5">
              <InsightIcon icon={CircleHelp} tone="neutral" />
              {match.directory.name}
            </span>
            <a
              href={match.url}
              target="_blank"
              rel="noreferrer"
              className="link link-hover flex shrink-0 items-center gap-1 text-xs text-base-content/60"
            >
              Check this result
              <ExternalLink className="size-3" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One search's absence is never proof a listing doesn't exist (finding 11):
 * creating one that already exists produces a duplicate, which actively
 * harms local SEO -- the opposite of this feature's purpose. So this never
 * tells the user to "add" or "create" anything; each row only offers the
 * directory's own homepage to check by hand, and the copy above says
 * outright that a listing may already exist.
 */
function CitationMissingList({ missing }: { missing: DirectoryEntry[] }) {
  if (missing.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-base-content/50">
        Not found in this search ({missing.length})
      </h3>
      <p className="mt-0.5 text-xs text-base-content/50">
        Not evidence these listings don&rsquo;t exist -- only that none came up
        in this particular search. Worth checking by hand before creating
        anything new.
      </p>
      <ul className="mt-1 divide-y divide-base-200">
        {missing.map((directory) => (
          <li
            key={directory.id}
            className="flex items-center justify-between gap-2 py-1.5 text-sm"
          >
            <span className="flex items-center gap-1.5 text-base-content/70">
              <InsightIcon icon={CircleHelp} tone="neutral" />
              {directory.name}
            </span>
            <a
              href={`https://${directory.domain}`}
              target="_blank"
              rel="noreferrer"
              className="link link-hover flex shrink-0 items-center gap-1 text-xs text-base-content/60"
            >
              Check manually
              <ExternalLink className="size-3" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Searches for a business across the known citation directories
 * (directories.ts) and shows which surfaced -- see citationModel.ts for the
 * honesty rules this reads its verdict through. A section on the Local SEO
 * tab (not its own route): it only makes sense once a business profile has
 * already been looked up there, reuses that profile's name/phone/city as
 * its NAP input, and the tab already composes sections this way (GbpAuditCard,
 * LocalReviewsSection) rather than every check getting its own page.
 *
 * Metered like SerpOverviewPage: gated behind useAuthorizedRun so nothing
 * runs before an explicit click, and behind useMeteredQuery so the fetch
 * itself can't fire without that authorization either.
 */
export function CitationTrackerSection({
  projectId,
  businessName,
  city,
  region,
  phone,
}: {
  projectId: string;
  businessName: string;
  city: string | null;
  region: string | null;
  phone: string | null;
}) {
  const market = useProjectMarket(projectId);
  const combinedCity = combineCityRegion(city, region);
  const run = useAuthorizedRun(
    createMeteredRunKey(
      projectId,
      businessName,
      combinedCity,
      phone,
      market.locationCode,
    ),
  );

  const reportQuery = useMeteredQuery({
    authorized: run.authorized,
    runNonce: run.runNonce,
    enabled: run.authorized,
    queryKey: [
      "citation-tracker",
      projectId,
      businessName,
      combinedCity,
      phone,
      market.locationCode,
    ],
    queryFn: () =>
      getCitationReport({
        data: {
          projectId,
          businessName,
          city: combinedCity,
          phone,
          locationCode: market.locationCode,
          languageCode: market.languageCode,
        },
      }),
  });

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const { restored } = useAutoRestoredRun({
    projectId,
    feature: RUN_FEATURES.citationTracker,
    schema: citationTrackerResultSchema,
    enabled: !run.authorized,
    runId: selectedRunId,
  });

  const result = reportQuery.data ?? restored?.result;
  const restoredRun = reportQuery.data == null ? restored : null;
  const errorMessage = reportQuery.isError
    ? getStandardErrorMessage(reportQuery.error)
    : null;

  // Pure arithmetic over already-fetched data, same as SerpOverviewPage's
  // own verdict -- safe to recompute every render, nothing here refetches.
  const report: CitationReport | null = result
    ? buildCitationReport({
        business: {
          name: result.businessName,
          city: result.city,
          phone: result.phone,
        },
        results: result.results,
      })
    : null;

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="max-w-xl">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <InsightIcon icon={ScanSearch} tone="neutral" />
              Citation tracker
            </h2>
            <p className="mt-0.5 text-xs text-base-content/55">
              Searches for {businessName} and checks which of{" "}
              {DIRECTORIES.length} major directories surface in results -- this
              finds what&rsquo;s discoverable via search, not a complete
              directory audit. A directory not listed below means it
              didn&rsquo;t turn up in this search, not that no listing exists.
              Runs one search and uses credits, the same as other lookups.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-outline gap-1.5"
            onClick={() => run.authorize()}
            disabled={!businessName.trim() || reportQuery.isFetching}
          >
            {reportQuery.isFetching ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <Search className="size-3.5" />
            )}
            Check citations
          </button>
        </div>

        {errorMessage ? (
          <div className="alert alert-error text-sm">{errorMessage}</div>
        ) : null}

        {!run.authorized ? (
          <RecentRunsList
            projectId={projectId}
            feature={RUN_FEATURES.citationTracker}
            activeRunId={selectedRunId}
            onSelect={setSelectedRunId}
          />
        ) : null}

        {restoredRun ? (
          <RestoredRunBanner
            label={restoredRun.label}
            lastRanAt={restoredRun.lastRanAt}
            runCount={restoredRun.runCount}
            onRunAgain={() => run.authorize()}
          />
        ) : null}

        {report ? (
          <>
            <NextStepsCard
              verdict={report.verdict}
              projectId={projectId}
              tab="Citation Tracker"
            />
            <CitationFoundList found={report.found} />
            <CitationUnconfirmedList unconfirmed={report.unconfirmed} />
            <CitationMissingList missing={report.missing} />
          </>
        ) : !run.authorized && !restoredRun ? (
          <p className="text-sm text-base-content/60">
            Nothing runs until you click Check citations.
          </p>
        ) : null}
      </div>
    </div>
  );
}
