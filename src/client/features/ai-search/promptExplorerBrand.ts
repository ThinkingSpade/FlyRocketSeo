import { resolveBrandTerms } from "@/client/features/profiles/profileBrandTerms";
import { domainStem } from "@/client/features/search-performance/projectGscInsights";
import type { ProjectProfile } from "@/shared/keyword-fit/profileTypes";

/**
 * What Prompt Explorer's "Highlight brand" box starts out holding.
 *
 * Split out of `PromptExplorerPage.tsx` for the same reason `onPageModel.ts`
 * and `activeRun.ts` are: the page imports server functions, so this decision
 * is only reachable by a test on its own.
 *
 * The profile's curated brand names win. This string is what every model's
 * answer is scored against, so a client trading under a name that is neither
 * their project label nor their domain stem was marked "no mention" even when
 * the answer named them -- a false negative on this tab's whole promise. Only
 * a CONFIRMED profile can supply one, which `resolveBrandTerms` enforces.
 *
 * The domain is withheld from that call on purpose. `resolveBrandTerms` unions
 * the domain stem into its result, so it answers with a non-empty array
 * whenever a domain exists -- and because the profile ships as an unconfirmed
 * AI draft, "no curated brand names" is the ordinary state, not the edge case.
 * Passing the domain here therefore defaulted a project named "Delio TX" on
 * deliotx.com to `deliotx`, and the server matches that as /\bdeliotx\b/i,
 * which does NOT match "Delio TX" in an answer's prose -- reintroducing the
 * exact false negative the curated brand field was added to fix. Passing
 * `null` asks the same helper for the curated terms alone, the shape its own
 * test already pins.
 *
 * The project name is what a human called this business, so it outranks a bare
 * stem. The stem is the last resort it always claimed to be.
 */
export function defaultHighlightBrand(
  profile: ProjectProfile,
  project: { name: string; domain?: string | null } | null,
): string {
  const curated = resolveBrandTerms(profile, null)[0];
  if (curated) return curated;
  // "Default" is onboarding's placeholder label, not a name anyone trades or
  // searches under.
  const name = project?.name.trim() ?? "";
  if (name && name.toLowerCase() !== "default") return name;
  return domainStem(project?.domain) ?? "";
}
