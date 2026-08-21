import { HARVEST_TICKS_PER_HOUR } from "@/shared/cronDispatch";
/**
 * Cloudflare D1 "Queries per Worker invocation (read subrequest limits)" is
 * 50 on Workers Free and 1,000 on Workers Paid. This deployment is Free.
 * D1 statements, KV operations, and outbound fetches all spend this invocation
 * budget, so every derived ceiling below accounts for them together.
 * Raise this one constant when the account moves to Workers Paid.
 * https://developers.cloudflare.com/d1/platform/limits/
 */
export const WORKER_QUERY_BUDGET = 50;
export const MAX_DOMAIN_RATING_ATTEMPTS = 3;

/** Five inserted values plus the bound attempts default keep 15 rows under 100 params. */
export const HARVEST_INSERT_ROWS_PER_QUERY = 15;

// One fleet read; three preparation reads; two KV reads; claim, feed, ownership,
// completion, and a possible fenced release after a lost completion response.
// Nine more queries remain as explicit safety headroom.
const HARVEST_NON_INSERT_SUBREQUESTS = 11;
const HARVEST_QUERY_HEADROOM = 9;
const MAX_HARVEST_INSERT_QUERIES = Math.max(
  0,
  WORKER_QUERY_BUDGET - HARVEST_NON_INSERT_SUBREQUESTS - HARVEST_QUERY_HEADROOM,
);
/** What one invocation's insert budget alone would allow. */
const MAX_MATCHES_PER_INSERT_BUDGET =
  MAX_HARVEST_INSERT_QUERIES * HARVEST_INSERT_ROWS_PER_QUERY;

// Candidate selection and the post-batch remaining count cost two queries.
// A cold miss then costs, per domain: claim + KV get + fetch + KV put + one
// completion-or-release write. The remainder is reserved for request overhead.
const GRADING_FIXED_SUBREQUESTS = 2;
const GRADING_SUBREQUESTS_PER_DOMAIN = 5;
const GRADING_QUERY_HEADROOM = 8;
export const MAX_DOMAIN_RATING_LOOKUPS = Math.max(
  0,
  Math.floor(
    (WORKER_QUERY_BUDGET - GRADING_FIXED_SUBREQUESTS - GRADING_QUERY_HEADROOM) /
      GRADING_SUBREQUESTS_PER_DOMAIN,
  ),
);
export const MAX_GRADING_SUBREQUESTS =
  GRADING_FIXED_SUBREQUESTS +
  MAX_DOMAIN_RATING_LOOKUPS * GRADING_SUBREQUESTS_PER_DOMAIN;

/**
 * A day's harvest must not outrun a day's grading.
 *
 * Domain Rating is what makes the shortlist decidable -- a row with no DR is a
 * name the user cannot judge -- so storing more rows per day than grading can
 * resolve does not widen the net, it just grows a permanently ungraded tail.
 * That was an explicit product decision: keep DR current rather than maximise
 * the row count.
 *
 * Only ONE feed date exists per day, and a tick harvests a single project, so
 * harvesting costs one tick per project per day and every remaining tick is
 * available for grading.
 */
const HARVEST_TICKS_PER_DAY = HARVEST_TICKS_PER_HOUR * 24;
/** Harvest ticks per day = one per project, since there is one feed date. */
const HARVESTABLE_PROJECTS = 3;
const DAILY_GRADING_CAPACITY =
  (HARVEST_TICKS_PER_DAY - HARVESTABLE_PROJECTS) * MAX_DOMAIN_RATING_LOOKUPS;
/**
 * Exceeding this is not a correctness failure -- adding a fourth project simply
 * means grading lags -- but the ceiling is derived rather than guessed so the
 * trade-off stays visible instead of drifting.
 */
const MAX_MATCHES_GRADING_KEEPS_UP_WITH = Math.floor(
  DAILY_GRADING_CAPACITY / HARVESTABLE_PROJECTS,
);

/** The binding constraint, whichever it turns out to be. */
export const MAX_MATCHES_PER_DAY = Math.min(
  MAX_MATCHES_PER_INSERT_BUDGET,
  MAX_MATCHES_GRADING_KEEPS_UP_WITH,
);

/**
 * Derived from the cap that is actually in force, not from the insert budget:
 * while grading throughput is the binding constraint, a harvest tick spends
 * well under what inserts alone would permit, and claiming otherwise would
 * reserve headroom that is never used.
 *
 * A lost completion can consume both the completion write and a fenced
 * release, so the true worst case is one above the happy path.
 */
export const MAX_SCHEDULED_HARVEST_SUBREQUESTS =
  HARVEST_NON_INSERT_SUBREQUESTS +
  Math.ceil(MAX_MATCHES_PER_DAY / HARVEST_INSERT_ROWS_PER_QUERY);
