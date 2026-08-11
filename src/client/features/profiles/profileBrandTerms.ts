import {
  defaultBrandTerms,
  parseBrandTerms,
} from "@/client/features/search-performance/brandedSplit";
import type { ProjectProfile } from "@/shared/keyword-fit/profileTypes";

/**
 * Every spelling of this client's brand we know about.
 *
 * The profile has had a "Brand names" field since it was built, and nothing
 * read it — branded-query detection derived its terms from the domain stem
 * alone, so a client whose brand is not their domain ("Delio TX" on
 * deliotx.com, a trading name, a product line) had every branded search
 * counted as non-branded. The curated field is the better source precisely
 * because it holds the spellings a domain cannot tell you.
 *
 * The domain stem is still unioned in rather than replaced: it is almost
 * always right, and losing it would make a sparse profile worse than no
 * profile.
 *
 * Only a CONFIRMED profile contributes. An unconfirmed AI draft is a
 * proposal, and a hallucinated brand term would silently reclassify real
 * non-branded demand as the client's own traffic.
 */
export function resolveBrandTerms(
  profile: ProjectProfile,
  domain: string | null,
): string[] {
  // `parseBrandTerms` owns the normalisation every consumer of these strings
  // already expects (lowercased, trimmed, 2-char floor) but splits on commas,
  // while this field is one-per-line. Converting newlines to commas reuses
  // that rule rather than growing a second one that could drift from it.
  const fromProfile =
    profile.confirmedAt !== null
      ? parseBrandTerms(profile.brandTerms.replace(/\n/g, ","))
      : [];
  const fromDomain = domain ? defaultBrandTerms(domain) : [];
  return [...new Set([...fromProfile, ...fromDomain])];
}
