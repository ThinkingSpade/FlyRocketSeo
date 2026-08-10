import { defaultBrandTerms } from "@/client/features/search-performance/brandedSplit";
import type {
  ProjectProfile,
  ServiceAreaKind,
} from "@/shared/keyword-fit/profileTypes";
import type { TargetArea, TargetAreaKind } from "@/shared/geo/types";
import type { TargetAreaResult } from "@/server/features/geo/services/TargetAreaService";

/**
 * What the profile card can fill in for free, before anyone types or any
 * model runs.
 *
 * The card used to open completely empty on every project, while the answers
 * to two of its five questions were already sitting in the project record and
 * in `project_target_areas` -- the latter detected and displayed by the
 * banner immediately above the card. Asking the user to restate that is the
 * bug these two functions exist to fix.
 *
 * Both are pure and neither writes anything: they produce values for an
 * unsaved form, which the user still reviews and saves.
 */

/**
 * The SHAPE of a service area, from the geography that was actually detected.
 *
 * `serviceAreaKind` decides exactly one thing -- whether generated seeds
 * carry a geo modifier -- so a city and a metro collapse to the same answer.
 * The difference between "Dallas" and "Dallas-Fort Worth" is real, but it
 * lives in the target area's own `locationCode`, which is where the request
 * geography is read from; duplicating it here would be the second store the
 * schema comment on `project_profiles` warns against.
 */
export function serviceAreaKindForArea(kind: TargetAreaKind): ServiceAreaKind {
  switch (kind) {
    case "city":
    case "metro":
      return "local";
    case "region":
      return "regional";
    case "country":
      return "national";
  }
}

/**
 * The one area a profile should take its shape from.
 *
 * A confirmed area outranks a proposal, and a multi-area proposal's first
 * entry is the most-confident one (`detectTargetArea` returns them
 * most-confident first). Returns null when nothing has been detected at all,
 * which must leave the stored `serviceAreaKind` exactly as it was rather than
 * defaulting it to anything.
 */
export function primaryAreaOf(
  result: TargetAreaResult | null | undefined,
): TargetArea | null {
  if (!result) return null;
  if (result.confirmed) return result.area;
  if (result.proposal.multi) return result.proposal.areas[0] ?? null;
  return result.proposal.area;
}

/**
 * Project names that describe the app's own bookkeeping rather than a brand.
 *
 * A project is created as "Default" before the user names it. Offering that
 * as a brand term would classify every query containing the word "default" as
 * the client's own branded search.
 */
const NON_BRAND_PROJECT_NAMES = new Set(["default", "untitled", "new project"]);

/**
 * Identity for two written brand names: case-insensitive, but NOT
 * whitespace-insensitive.
 *
 * The distinction is load-bearing. "Acme" and the stem of "acme.com" are the
 * same string once cased alike, and listing both is noise. "Delio TX" and the
 * stem of "deliotx.com" are NOT the same string, and both are worth listing,
 * because people type the brand both ways and this field is a list of
 * spellings to recognise as branded.
 */
function brandKey(term: string): string {
  return term.toLowerCase().trim();
}

/**
 * Brand terms from the project's own name and domain, newline-joined to match
 * the field's "one per line" contract.
 *
 * `defaultBrandTerms` (brandedSplit.ts) already owns turning a domain into its
 * registrable stem and is reused rather than reimplemented -- the branded
 * split on Search Performance and this field must agree on what the client's
 * brand is, and two copies of that rule would drift.
 */
export function deriveBrandTerms(input: {
  projectName: string;
  domain: string | null;
}): string {
  const terms: string[] = [];
  const seen = new Set<string>();

  const add = (term: string) => {
    const trimmed = term.trim();
    if (trimmed === "") return;
    const key = brandKey(trimmed);
    if (seen.has(key)) return;
    seen.add(key);
    terms.push(trimmed);
  };

  const name = input.projectName.trim();
  if (name !== "" && !NON_BRAND_PROJECT_NAMES.has(name.toLowerCase())) {
    add(name);
  }
  if (input.domain) {
    for (const stem of defaultBrandTerms(input.domain)) add(stem);
  }

  return terms.join("\n");
}

/**
 * Whether this project has no profile row at all, and so has never been
 * drafted.
 *
 * `getProjectProfile` returns `EMPTY_PROFILE` for a project with no row, so
 * the client cannot see the difference directly. What it CAN see is that a
 * claimed draft is always `source: "ai"` — the claim writes that before it
 * writes anything else — so an all-empty `manual` profile is the one shape
 * that means "nothing has ever been written here".
 *
 * This is an optimisation, not the guarantee. The server claims the row and
 * is the only thing that decides whether a draft actually runs; being wrong
 * here costs one skipped round trip, never a second crawl.
 */
export function hasNeverBeenDrafted(profile: ProjectProfile): boolean {
  return (
    profile.source === "manual" &&
    profile.confirmedAt === null &&
    profile.offer.trim() === "" &&
    profile.customer.trim() === "" &&
    profile.exclusions.trim() === "" &&
    profile.brandTerms.trim() === ""
  );
}

/**
 * Lays the free pre-fill over a stored profile, without ever overwriting
 * something a person decided.
 *
 * Two different rules, for two different reasons:
 *
 * `brandTerms` yields to any non-empty stored value. It is a plain text field
 * a user curates, and a derived guess must not delete their additions.
 *
 * `serviceAreaKind` yields to any CONFIRMED profile, even one that still says
 * "national". A saved profile means a human answered "where do they sell?",
 * and detection finding a city later does not make their answer wrong -- a
 * national franchise with one detected head-office metro is exactly the case
 * that would otherwise be silently relabelled local, which is the one field
 * here that changes what the generated seeds look like.
 */
export function applyPrefill(
  stored: ProjectProfile,
  prefill: { serviceAreaKind: ServiceAreaKind | null; brandTerms: string },
): ProjectProfile {
  const next = { ...stored };
  if (stored.brandTerms.trim() === "" && prefill.brandTerms !== "") {
    next.brandTerms = prefill.brandTerms;
  }
  if (stored.confirmedAt === null && prefill.serviceAreaKind !== null) {
    next.serviceAreaKind = prefill.serviceAreaKind;
  }
  return next;
}
