import { getDomain } from "tldts";
import type { DomainExpiration } from "@/shared/domainExpiration";

/**
 * Which domains on the current table page still need a (billed) expiry lookup.
 *
 * Extracted as pure functions rather than living inside the hook, for the same
 * reason `buildMeteredQueryOptions` was: this repo's Vitest runs in a `node`
 * environment and cannot render hooks, so a rule buried in one would ship
 * untested -- and this particular rule decides how much money a click costs.
 *
 * Deliberately NOT modelled on `useAhrefsDomainRatings`'s follow-up effect.
 * That one re-enriches every newly visible domain on each pagination once the
 * user has opted in a single time, which is correct for Ahrefs' free keyless
 * DR endpoint and would be a five-figure-credit bug against APIVerve's 5
 * credits per domain. Enrichment here is per page and needs a fresh click.
 */

/** Domain (registrable form) → its expiry, or `null` when the lookup did not answer. */
export type DomainExpirations = Record<string, DomainExpiration | null>;

/**
 * Normalizes to the registrable domain, drops blanks, dedupes, and removes
 * anything already resolved or already in flight.
 *
 * A domain resolved to `null` counts as KNOWN: the lookup ran and did not
 * answer, and asking again would bill a second time for the same non-answer.
 */
export function selectUnresolvedDomains(
  pageDomains: string[],
  known: DomainExpirations | null,
  pending: ReadonlySet<string>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of pageDomains) {
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed) continue;
    // Match the server's own key: it normalizes to eTLD+1 inside
    // resolveDomainExpiration, so asking for three spellings would be one
    // charge but three request entries, and the row lookup would miss.
    const domain = getDomain(trimmed) ?? trimmed;
    if (seen.has(domain)) continue;
    if (known && Object.hasOwn(known, domain)) continue;
    if (pending.has(domain)) continue;
    seen.add(domain);
    out.push(domain);
  }

  return out;
}

/** What the next click would actually cost, in domains. Zero disables the button. */
export function countBillableDomains(
  pageDomains: string[],
  known: DomainExpirations | null,
  pending: ReadonlySet<string>,
): number {
  return selectUnresolvedDomains(pageDomains, known, pending).length;
}
