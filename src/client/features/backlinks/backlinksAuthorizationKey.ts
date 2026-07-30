import type { BacklinksSearchState } from "./backlinksPageTypes";
import { createMeteredRunKey } from "@/client/lib/useMeteredQuery";

/**
 * What one paid backlinks run covers.
 *
 * A **run** is a target: "analyze example.com's backlinks". A **slice** is a
 * view of that run — a page, a sort order, a tab, a filter. The key is the run,
 * so navigating slices does not invalidate the consent the user already gave.
 *
 * It used to be the whole `searchState` plus the active filters, which made every
 * slice its own authorization. Since `useAuthorizedRun` is strict key equality,
 * clicking page 2 — or sorting a column, or switching to Referring domains —
 * silently DE-authorized the run: every metered query switched off and the
 * results the user had paid for vanished, with no explanation and no route back
 * except paying again.
 *
 * The earlier fix authorized on filter-apply only, and justified leaving paging
 * alone on the grounds that re-authorizing would re-pay for pages already
 * loaded. **That justification was wrong.** Each slice is served by
 * `profileBacklinksPage`, which reads an R2 cache keyed on target + page + sort +
 * filters with a 6-hour TTL (see `backlinksServiceData.ts`). The client's
 * `runNonce` is not part of that key, so a client-side refetch returns the cached
 * page and bills nothing. Revisiting a slice inside six hours is free however
 * many times the nonce moves.
 *
 * What a slice actually costs, then: one billed request the first time it is
 * viewed, nothing thereafter for six hours. That is the same cost whether or not
 * an extra confirm button sits in front of it — the only thing the old key bought
 * was a broken page.
 *
 * The spend guarantee still holds where it matters. `useAuthorizedRun` starts at
 * `authorizedKey: null` on every mount, so a restored page, a shared URL or a
 * project switch fetches nothing until someone presses Search. Changing target or
 * scope changes this key and de-authorizes — correct, because that is a different
 * run rather than a different view of the same one.
 */
export function buildBacklinksAuthorizationKey(
  projectId: string,
  searchState: Pick<BacklinksSearchState, "target" | "scope">,
): string {
  return createMeteredRunKey(projectId, searchState.target, searchState.scope);
}
