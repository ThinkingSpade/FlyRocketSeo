import { Banner } from "@cloudflare/kumo/components/banner";

/**
 * Says what happened when a restore comes back with nothing to show for a
 * reason other than "never run": `expired` (aged out of the 7-day R2
 * retention) or `unreadable` (the stored payload no longer matches this
 * tab's schema, e.g. after it changed shape). Both used to collapse into the
 * same blank "you have never run this" prompt -- this is what stops that.
 *
 * Pulled out of `CompetitorsPage` rather than inlined there to keep that
 * component under this repo's complexity/line-count lint caps, the same
 * reason `CompetitorsOverviewExtras` was split out.
 */
export function CompetitorsRestoreNotice({
  outcome,
  expired,
}: {
  outcome: "none" | "expired" | "unreadable" | "ready" | null;
  expired: { label: string; lastRanAt: string } | null;
}) {
  if (outcome === "expired" && expired) {
    return (
      <Banner variant="alert" className="text-sm">
        Your last run for {expired.label} (
        {new Date(expired.lastRanAt).toLocaleDateString()}) has expired — saved
        results are kept for 7 days. Run it again to see current data.
      </Banner>
    );
  }
  if (outcome === "unreadable") {
    return (
      <Banner variant="alert" className="text-sm">
        Your last run for this tab couldn&apos;t be restored — its saved format
        is out of date. Run it again to refresh.
      </Banner>
    );
  }
  return null;
}
