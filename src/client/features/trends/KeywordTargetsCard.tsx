import { TrendUp } from "@phosphor-icons/react";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import { Loader } from "@cloudflare/kumo/components/loader";
import { useProjectDomain } from "@/client/hooks/useProjectDomain";
import type { TargetAreaScope } from "@/client/features/geo/useTargetAreaScope";
import { useKeywordTargets } from "./useKeywordTargets";
import { describePaidFailure } from "./keywordTargetsState";
import { KeywordTargetsTable } from "./KeywordTargetsTable";

/**
 * The tab's primary surface: the keywords themselves.
 *
 * Every state below renders SOMETHING. The Search Console half is free and
 * present on every mount once connected, so a paid failure degrades the table
 * rather than blanking the page -- which is what the old card did when its
 * single source came back thin.
 */
export function KeywordTargetsCard({
  projectId,
  hasCredits,
  targetAreaScope,
}: {
  projectId: string;
  hasCredits: boolean;
  /** The PAGE's one `useTargetAreaScope` instance -- the same object the
   *  header `ScopeControl` is bound to. Threaded through rather than
   *  re-derived here; see `useKeywordTargets`' own comment on
   *  `KeywordTargetsScope` for the two-round-trip race a second instance
   *  opened between changing the scope and spending under it. */
  targetAreaScope: Pick<TargetAreaScope, "area" | "ready">;
}) {
  const domain = useProjectDomain(projectId);
  const targets = useKeywordTargets(projectId, hasCredits, targetAreaScope);
  const failure = describePaidFailure({
    reason: targets.failureReason,
    domain: domain ?? "your site",
    hasFreeRows: targets.rows.length > 0,
  });

  return (
    <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-3 p-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <TrendUp className="size-4 text-base-content/50" />
              Keywords to target
            </h2>
            {/* Location lives here, once, rather than as a column repeating
                the same value on every row: the ranked-keywords call takes a
                single location_code per request, and the Search Console call
                has no country dimension at all. */}
            <p className="text-sm text-base-content/60">
              {targets.geo
                ? `Rankings in ${targets.geo.label}`
                : "Rankings for your site"}
              {targets.fetchedAt
                ? ` · fetched ${new Date(targets.fetchedAt).toLocaleDateString()}`
                : null}
            </p>
          </div>
          {targets.paidState === "ok" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={targets.runAgain}
            >
              {targets.isRunningPaid ? "Refreshing…" : "Refresh (uses credits)"}
            </Button>
          ) : null}
        </div>

        {targets.paidState === "failed" ? (
          <Banner variant="error" className="text-sm">
            {failure.message}
            {failure.canRetry ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-2"
                onClick={targets.runAgain}
              >
                {/* No in-flight label swap here (unlike "Refresh" and
                    "Refresh it"): clicking flips `discovery.isError` false
                    synchronously, which drops `paidState` out of "failed" and
                    unmounts this whole banner before a re-render could ever
                    show a "Retrying…" state -- reachable only in the narrow
                    case of a RESTORED failed run being retried before its own
                    invalidation lands, not the common "this attempt just
                    failed" path. Not worth a conditional for a label that
                    would rarely be visible. */}
                Try again (uses credits)
              </Button>
            ) : null}
          </Banner>
        ) : null}

        {targets.paidState === "restore-failed" ? (
          <Banner variant="error" className="text-sm">
            Couldn’t check whether ranking data has already been loaded for{" "}
            {domain ?? "your site"}, so it isn’t shown below. Nothing was
            charged.
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-2"
              onClick={targets.retryRestore}
            >
              {/* `retryRestore`, never `runAgain`. Re-reading the stored run
                  is free; starting a paid run here would spend precisely
                  because we failed to find out whether we already had. */}
              Try again
            </Button>
          </Banner>
        ) : null}

        {targets.paidState === "none" &&
        !targets.isRunningPaid &&
        targetAreaScope.ready ? (
          <Banner variant="default" className="text-sm">
            Ranking data hasn’t been loaded for this project yet.
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-2"
              onClick={targets.runAgain}
            >
              Get ranking data for {domain ?? "your site"} (uses credits)
            </Button>
          </Banner>
        ) : null}

        {targets.paidState === "expired" ? (
          <Banner variant="alert" className="text-sm">
            Your saved keyword list is no longer available.
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-2"
              onClick={targets.runAgain}
            >
              {targets.isRunningPaid
                ? "Refreshing…"
                : "Refresh it (uses credits)"}
            </Button>
          </Banner>
        ) : null}

        {targets.paidState === "no-credits" ? (
          <Banner variant="default" className="text-sm">
            Ranking data needs credits. The keywords below come from Search
            Console, which is free.
          </Banner>
        ) : null}

        {targets.isLoadingFree ? (
          <div className="flex items-center justify-center py-12">
            <Loader />
          </div>
        ) : (
          <KeywordTargetsTable
            rows={targets.rows}
            domain={domain ?? ""}
            emptyMessage={
              targets.gscUnavailable
                ? "Search Console isn’t connected for this project, so the free half of this table is missing. This isn’t “no keywords” — it’s no data source."
                : "No keywords yet."
            }
          />
        )}

        {targets.isRunningPaid ? (
          <p className="text-sm text-base-content/60">
            Loading ranking data for {domain}…
          </p>
        ) : null}
      </div>
    </div>
  );
}
