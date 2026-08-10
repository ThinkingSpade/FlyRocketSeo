import { MIN_COMPETITOR_SEED } from "./competitorSeed";

export type DiscoveryMode = "serp" | "domain";

/**
 * Which discovery path to run.
 *
 * Keyword-seeded discovery is strictly better when we have a real seed, but a
 * seed of three queries describes no market -- paying for that answer would be
 * worse than the domain-overlap fallback AND more expensive, so the floor is a
 * money decision as much as a quality one.
 */
export function resolveDiscoveryMode(
  seedSize: number,
  hasGscConnection: boolean,
): DiscoveryMode {
  if (!hasGscConnection) return "domain";
  return seedSize >= MIN_COMPETITOR_SEED ? "serp" : "domain";
}
