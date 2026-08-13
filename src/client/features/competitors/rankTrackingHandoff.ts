import { linkOptions } from "@tanstack/react-router";

/**
 * Where one competitor row hands off to: Rank Tracking, carrying that row's
 * domain.
 *
 * `?domain=` is declared on the rank-tracking LAYOUT (`rank-tracking.tsx`) and
 * consumed by `rank-tracking/index.tsx`, which lands it exactly once -- opening
 * that domain's existing tracker if one is already configured, otherwise
 * opening the create flow with the domain filled in -- and then clears it from
 * the URL. So this link means "start tracking this competitor's positions",
 * with nothing to retype.
 *
 * `search` is a plain OBJECT, deliberately -- see `linkOpportunitiesHandoff`
 * for the full form of the argument. In short: an object REPLACES the whole
 * search and only a function merges, and this is a CROSS-route link, so the
 * destination's own schema (`domain`, and nothing else) is all it accepts.
 * Carrying the competitors tab's unrelated search across would be noise at
 * best.
 *
 * The domain goes over RAW. `rank-tracking/index.tsx` runs its own
 * `safeNormalizeDomain` over it before either matching an existing tracker or
 * prefilling the form, and normalizing at both ends is how the two drift apart
 * -- one side's idea of a canonical host silently failing to match the
 * other's. No blank guard for the same reason it needs none: `domain` is a
 * competitor row's identity (it is the row key), and the receiver's schema is
 * `z.string().optional().catch(undefined)`, which tolerates anything a link
 * can carry.
 */
export function rankTrackingHandoff(projectId: string, domain: string) {
  return linkOptions({
    to: "/p/$projectId/rank-tracking",
    params: { projectId },
    search: { domain },
  });
}
