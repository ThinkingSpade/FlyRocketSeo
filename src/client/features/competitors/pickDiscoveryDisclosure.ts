import type { CompetitorsPage } from "@/types/schemas/competitors";

/**
 * The discovery-disclosure fields (how this list was built, and how much is
 * hidden) for whichever page `competitorRows` was drawn from -- live data
 * first, then the SAME adopted restore `pickAdoptedRestore` chose, so these
 * can never describe a different run than the rows actually on screen.
 *
 * A separate module rather than inlined in `CompetitorsPage`, the same as
 * this file's siblings `resolveRestoreNotice.ts` and
 * `shouldAdoptRestoredRun.ts` -- keeps the page component's own complexity
 * and line-count budget (this repo's oxlint caps) for the JSX it renders,
 * not the `??` fallback chains behind it.
 */
export function pickDiscoveryDisclosure(
  liveData: CompetitorsPage | undefined,
  restoredRun: { result: CompetitorsPage } | null,
): {
  discoveryMode: CompetitorsPage["discoveryMode"];
  seedSize: number;
  hiddenCount: number;
  /** Whether the GSC pull the seed was drawn from may have left biased-away
   *  queries behind -- see `seedTruncated` on `competitorsPageSchema`. */
  seedTruncated: boolean;
  /** Whether there is a real answer to disclose at all -- a restored run
   *  counts even though no live query ran for it, but only an ADOPTED one
   *  (see `pickAdoptedRestore`), which is exactly what a non-null
   *  `restoredRun` means here. */
  hasResult: boolean;
} {
  const page = liveData ?? restoredRun?.result;
  return {
    discoveryMode: page?.discoveryMode ?? "domain",
    seedSize: page?.seedSize ?? 0,
    hiddenCount: page?.hiddenCount ?? 0,
    seedTruncated: page?.seedTruncated ?? false,
    hasResult: page != null,
  };
}
