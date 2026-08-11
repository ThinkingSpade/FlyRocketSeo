import { TrendingUp } from "lucide-react";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import { Loader } from "@cloudflare/kumo/components/loader";
import { useProjectDomain } from "@/client/hooks/useProjectDomain";
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
}: {
  projectId: string;
  hasCredits: boolean;
}) {
  const domain = useProjectDomain(projectId);
  const targets = useKeywordTargets(projectId, hasCredits);
  const failure = describePaidFailure({
    reason: targets.failureReason,
    domain: domain ?? "your site",
  });

  return (
    <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-3 p-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="size-4 text-base-content/50" />
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
            // Deliberately NOT `disabled`. The guard against a concurrent
            // paid call lives in `runAgain` itself (useKeywordTargets.ts's
            // `start`, which reads the live MutationCache at click time
            // rather than a rendered value -- see that comment for why)
            // rather than on this control -- a click that lands mid-flight
            // is a silent no-op there, not a second bill. Disabling the
            // button here would be redundant AND would remove the one
            // thing worth keeping about staying clickable/focusable: the
            // label below still confirms the click landed. Same reasoning
            // applies to "Try again"/"Refresh it" below.
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={targets.runAgain}
            >
              {targets.isRunningPaid ? "Refreshing…" : "Refresh"}
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
                Try again
              </Button>
            ) : null}
          </Banner>
        ) : null}

        {targets.paidState === "restore-failed" ? (
          // Distinct from "failed" on purpose: nothing was spent and nothing
          // is known. The read of this project's own analysis history broke,
          // so we cannot tell whether a paid run already exists -- and the
          // auto-run guard rightly refuses to spend to find out. Before this
          // banner existed that combination rendered NOTHING at all: no
          // error, no button, and no way back, permanently.
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

        {targets.paidState === "none" && !targets.isRunningPaid ? (
          // The spec's own States table requires this prompt, and until now
          // nothing rendered for "none" at all -- a project whose auto-run
          // never fired (or was blocked) showed Search Console rows with no
          // hint that the paid half exists. Hidden while a run is in flight:
          // the click would be a no-op (see useKeywordTargets' `start`) and
          // the in-flight line below already says what is happening.
          <Banner variant="default" className="text-sm">
            Ranking data hasn’t been loaded for this project yet.
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-2"
              onClick={targets.runAgain}
            >
              Get ranking data for {domain ?? "your site"}
            </Button>
          </Banner>
        ) : null}

        {targets.paidState === "expired" ? (
          // Kumo's Banner ships "default" | "alert" | "error" | "secondary" --
          // no "warning" variant exists (see banner.d.ts). "alert" is its
          // cautionary-yellow equivalent.
          <Banner variant="alert" className="text-sm">
            Your saved keyword list is no longer available.
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-2"
              onClick={targets.runAgain}
            >
              {targets.isRunningPaid ? "Refreshing…" : "Refresh it"}
            </Button>
          </Banner>
        ) : null}

        {targets.paidState === "no-credits" ? (
          // Same gap as above: no "info" variant. "default" is Banner's own
          // informational style (see AppShellParts.tsx, DomainOverviewPage.tsx
          // for the same choice on a non-urgent notice).
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
            // "No keywords yet." asserts an absence, and with Search Console
            // unavailable we have not established one -- the free half of
            // this table never arrived, so an empty table is a MISSING
            // SOURCE, not an empty result. The card this table replaced
            // rendered nothing at all in that case, which at least never
            // claimed otherwise.
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
