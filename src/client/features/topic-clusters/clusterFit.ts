import type { FitResult } from "@/shared/keyword-fit/keywordFit";

/**
 * How much of one cluster belongs to a customer this client does not have.
 *
 * Counts only "wrong-customer", never "adjacent". Adjacent means plausibly
 * theirs but off the core offer, and treating the two the same would discard
 * real topics — the same distinction the keyword table already makes.
 *
 * An empty verdict map (an unusable or unconfirmed profile) yields zero,
 * which the caller must render as "not checked" rather than "checked and all
 * fine". That is why `total` is returned alongside: a count with no
 * denominator cannot tell those apart.
 */
export function summariseClusterFit(
  keywords: readonly string[],
  fit: ReadonlyMap<string, FitResult>,
): { wrongCustomer: number; total: number } {
  let wrongCustomer = 0;
  for (const keyword of keywords) {
    if (fit.get(keyword)?.verdict === "wrong-customer") wrongCustomer += 1;
  }
  return { wrongCustomer, total: keywords.length };
}
