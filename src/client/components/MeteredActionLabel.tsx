/**
 * The label on a control that spends money.
 *
 * This app is careful about not spending WITHOUT a click — `useMeteredQuery`
 * disables mount/focus/reconnect refetching so a restored page cannot fire a
 * paid request. The gap this closes is the other half: controls that do spend,
 * and did not say so before you pressed them.
 *
 * One component rather than seven hand-written suffixes, because the wording has
 * to encode two facts that are easy to get wrong independently:
 *
 * **How much.** A count of upstream requests when that is knowable, a measured
 * dollar figure when one exists, and otherwise just "uses credits". Never an
 * invented number — see the header of `shared/analysis-costs.ts`: showing a
 * guessed price immediately before spending someone's money is worse than
 * showing none.
 *
 * **Whether it might cost nothing.** Most of these read a server-side cache
 * first, so a second press inside the window spends zero. Saying "1 paid
 * request" there would be a lie in the expensive-sounding direction, which
 * teaches people to distrust the labels that are accurate. `cacheAware` softens
 * the claim to "up to" / "may".
 */

type MeteredDisclosure =
  | { kind: "credits" }
  | { kind: "paidRequests"; count: number }
  | { kind: "estimateUsd"; usd: number };

export function meteredActionLabel(
  action: string,
  disclosure: MeteredDisclosure,
  /** The call reads a cache first, so it may cost nothing. */
  cacheAware = false,
): string {
  switch (disclosure.kind) {
    case "credits":
      return `${action} · ${cacheAware ? "may use credits" : "uses credits"}`;
    case "paidRequests": {
      const unit = disclosure.count === 1 ? "paid request" : "paid requests";
      return cacheAware
        ? `${action} · up to ${disclosure.count} ${unit}`
        : `${action} · ${disclosure.count} ${unit}`;
    }
    case "estimateUsd":
      // A cached run costs nothing, so the figure is stated as a conditional
      // beside the control rather than as the price of pressing it.
      return cacheAware
        ? `${action} · may use credits`
        : `${action} · est. $${disclosure.usd.toFixed(2)}`;
  }
}

/**
 * The conditional price line that accompanies a cache-aware estimate.
 * Returns null when there is nothing honest to add.
 */
export function meteredEstimateNote(
  disclosure: MeteredDisclosure,
  cacheAware = false,
): string | null {
  if (disclosure.kind !== "estimateUsd" || !cacheAware) return null;
  return `If not cached: est. $${disclosure.usd.toFixed(2)}.`;
}
