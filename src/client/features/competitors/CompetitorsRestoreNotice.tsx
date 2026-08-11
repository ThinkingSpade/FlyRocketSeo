import { Banner } from "@cloudflare/kumo/components/banner";
import { formatRunAge } from "@/client/features/analysis-runs/runAge";

/**
 * Says what happened when a restore comes back with nothing to show for a
 * reason other than "never run": `expired` (aged out of the 7-day R2
 * retention) or `unreadable` (the stored payload no longer matches this
 * tab's schema, e.g. after it changed shape). Both used to collapse into the
 * same blank "you have never run this" prompt -- this is what stops that.
 *
 * `notice` is the already-decided rendering choice (see
 * `resolveRestoreNotice`), not a raw hook outcome -- this component only
 * renders, it does not decide whether it is safe to.
 *
 * Pulled out of `CompetitorsPage` rather than inlined there to keep that
 * component under this repo's complexity/line-count lint caps, the same
 * reason `CompetitorsOverviewExtras` was split out.
 */
export function CompetitorsRestoreNotice({
  notice,
  expired,
}: {
  notice: "expired" | "unreadable" | null;
  expired: { label: string; lastRanAt: string } | null;
}) {
  if (notice === "expired" && expired) {
    // `formatRunAge` returns null for an unparseable timestamp rather than
    // the literal string "Invalid Date" a raw `new Date(...)` would render
    // -- every other `lastRanAt` display in this repo goes through it
    // (see `RestoredRunBanner`), so this degrades the same way instead of
    // being the one site that doesn't.
    const age = formatRunAge(expired.lastRanAt, Date.now());
    const when = age ? ` (${age})` : "";
    return (
      <Banner variant="alert" className="text-sm">
        {/*
          Deliberately states no retention period. The old copy promised "kept
          for 7 days" and users hit this on runs only hours old, because a run's
          durable copy was often never written at all (see CompetitorsService's
          awaited setCached) -- so the sentence contradicted what people were
          looking at. Two different prefixes with two different lifecycle rules
          govern the real answer, neither of which this code can observe, so
          asserting a number here would just be a second guess dressed as a
          fact. Say what is true and actionable instead.
        */}
        {`Your last run for ${expired.label}${when} is no longer available to restore. Run it again to see current data.`}
      </Banner>
    );
  }
  if (notice === "unreadable") {
    return (
      <Banner variant="alert" className="text-sm">
        Your last run for this tab couldn&apos;t be restored — its saved format
        is out of date. Run it again to refresh.
      </Banner>
    );
  }
  return null;
}
