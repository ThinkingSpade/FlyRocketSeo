import { TrendingUp } from "lucide-react";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import { Loader } from "@cloudflare/kumo/components/loader";
import { useProjectDomain } from "@/client/hooks/useProjectDomain";
import { useKeywordTargets } from "./useKeywordTargets";
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
            Couldn’t load ranking data for {domain ?? "your site"}.
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
          <KeywordTargetsTable rows={targets.rows} domain={domain ?? ""} />
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
