import { Button } from "@cloudflare/kumo/components/button";

/**
 * The active tab names a search this session has no result for -- typically a
 * tab kept from an earlier visit. It is not empty and must not borrow another
 * search's rows, so it says it is not loaded and asks before re-running a
 * metered search.
 */
export function KeywordResearchNotLoadedState({
  keyword,
  onRun,
}: {
  keyword: string;
  onRun: () => void;
}) {
  return (
    <div className="w-full max-w-xl space-y-3 rounded-xl border border-base-300 bg-base-100 p-5">
      <p className="text-sm font-medium">
        Results for “{keyword}” are not loaded in this session.
      </p>
      <p className="text-sm text-base-content/70">
        Running it again requests fresh research data from your provider. This
        may incur a charge.
      </p>
      <Button type="button" variant="primary" size="sm" onClick={onRun}>
        Run “{keyword}”
      </Button>
    </div>
  );
}
