import { useAuthorizedRun } from "@/client/lib/useMeteredQuery";
import type { BacklinksSearchState } from "./backlinksPageTypes";
import { buildBacklinksAuthorizationKey } from "./backlinksAuthorizationKey";
import { useBacklinksFilters } from "./useBacklinksFilters";

/**
 * The filters and the run authorization for one backlinks target.
 *
 * They live together because they used to be entangled: the authorization key
 * was built from the applied filters, so a filter change de-authorized the run
 * and blanked the paid table. Now the key is the target alone — see
 * `backlinksAuthorizationKey` for why a slice does not need its own consent —
 * and the filters are just filters again.
 *
 * Kept as a hook rather than folded back into the page because it is the one
 * place that decides what a user has agreed to pay for, and that is worth being
 * able to point at.
 */
export function useBacklinksRunAuthorization({
  projectId,
  searchState,
}: {
  projectId: string;
  searchState: BacklinksSearchState;
}) {
  const filters = useBacklinksFilters(projectId);
  const run = useAuthorizedRun(
    buildBacklinksAuthorizationKey(projectId, searchState),
  );
  return { filters, run };
}
