/**
 * Which unit of work a 15-minute cron tick performs.
 *
 * The deleted-domain harvest and the rank checks must not share an invocation:
 * Cloudflare's Free plan allows 50 queries per Worker invocation and D1, KV and
 * outbound fetches all spend it, so two independent jobs in one tick can
 * silently exhaust the budget for whichever runs second.
 *
 * They are separated by TICK rather than by a second cron trigger. Workers
 * Builds deploys through the versions API, which does NOT apply the `triggers`
 * block -- a second cron declared in `wrangler.jsonc` is committed, deployed,
 * and never registered, so the work bound to it simply never runs. Splitting a
 * trigger that already exists cannot fail that way.
 *
 * Rank checks are due-based (`nextRunAt <= now`, advanced by the config's own
 * interval), so an hourly tick only delays a daily check by up to an hour,
 * while giving the harvest three ticks an hour to work with.
 */
type ScheduledUnit = "rank-checks" | "domain-harvest";

export function scheduledUnitForTick(scheduledTime: Date): ScheduledUnit {
  return scheduledTime.getUTCMinutes() < 15 ? "rank-checks" : "domain-harvest";
}

/** Ticks an hour the harvest owns, for deriving how much it may do per day. */
export const HARVEST_TICKS_PER_HOUR = 3;
