/**
 * Scores the Google Business Profile LocalSeoService has already fetched --
 * completeness, categories, description, imagery, reviews, and owner
 * responsiveness -- and turns the gaps into ranked, specific fixes. Every
 * field read here already lives on `getCachedBusinessContext`'s profile (or
 * the reviews payload already fetched alongside it), so running this audit
 * adds no new metered call.
 *
 * The rule that matters most: a `null` field means the data source didn't
 * return it, not that the business left it blank. Confusing the two would
 * have this confidently tell someone to "add a description" they already
 * wrote. So an absent field is `status: "unknown"` and is excluded from the
 * score's denominator entirely -- only checks we can actually read count
 * toward it, and if fewer than half of them are readable the score is
 * `null` rather than a precise-looking number resting on too little data.
 *
 * Category, phone, logo, and main image don't get the unknown treatment,
 * though: Google requires a category and Search/Maps surface phone and
 * photos directly from what's on the listing, so on a `found: true` profile
 * their absence is itself the finding, not a gap in what DataForSEO
 * returned the way an optional free-text field like description can be.
 */

export type GbpCheckStatus = "pass" | "warn" | "fail" | "unknown";

export type GbpCheck = {
  key: string;
  label: string;
  status: GbpCheckStatus;
  /** What the data actually says. Shown under the label. */
  detail: string;
  /** Imperative fix, only when status is warn or fail. */
  fix: string | null;
  /** Ranked by this, descending. */
  weight: number;
};

export type GbpAudit = {
  /** 0-100, or null when too little is known to score honestly. */
  score: number | null;
  checks: GbpCheck[];
};

/**
 * Narrowed to exactly what the checks below read. LocalSeoService's
 * BusinessProfile also carries title/address/city/region/latitude/
 * longitude/cid/placeId/fetchedAt -- none of which any check here needs, so
 * they're left out rather than threading unused fields through a type
 * that's supposed to document what this module actually consumes.
 */
export type GbpAuditInput = {
  found: boolean;
  category: string | null;
  additionalCategories: string[];
  description: string | null;
  logo: string | null;
  mainImage: string | null;
  phone: string | null;
  url: string | null;
  domain: string | null;
  rating: number | null;
  reviewsCount: number | null;
  isClaimed: boolean | null;
};

// ---- Thresholds -------------------------------------------------------
// Every number below is a heuristic, not a value Google documents or
// guarantees; each is named and commented so a wrong one is easy to find
// and change without hunting through the logic that uses it.

/** Google Business Profile allows one primary category plus this many
 *  additional ones. Only cited in the warn copy below (this module only
 *  checks whether *any* additional categories are used, not a count against
 *  this ceiling), so the "unused reach" framing names a real number. */
const MAX_ADDITIONAL_CATEGORIES = 9;

/** Below this many characters, a description is roughly one short sentence
 *  -- not enough room to say what the business does, where, and what sets
 *  it apart -- even though Google allows up to 750. */
const MIN_HEALTHY_DESCRIPTION_LENGTH = 100;

/** Below this many reviews, a profile's review base is too thin to carry
 *  real trust or local-pack ranking weight; double digits is the commonly
 *  cited floor for a review count to start meaning anything at all. */
const MIN_HEALTHY_REVIEWS_COUNT = 10;

/** Below this rating, consumer-survey data (BrightLocal's recurring local
 *  consumer review survey) puts a business under where most shoppers say
 *  they stop considering a result, regardless of how many reviews back it. */
const MIN_HEALTHY_RATING = 4.0;

// ---- Ranking weights ----------------------------------------------------
// Fixed per check so the list orders the same regardless of which way any
// individual check comes out -- the size of the gap a dimension represents
// decides its place in the list, not today's pass/fail state.

/** Highest of all checks: an unclaimed profile means the business doesn't
 *  control the listing at all, so every other fix here is moot until this
 *  one is resolved. */
const WEIGHT_CLAIMED = 100;
/** Category drives which searches the profile can even appear for; get it
 *  wrong or leave it empty and nothing else on this list can compensate. */
const WEIGHT_CATEGORY = 90;
/** The core conversion path -- without it, a customer who finds the listing
 *  still cannot reach the business from it. */
const WEIGHT_PHONE = 80;
const WEIGHT_REVIEWS_COUNT = 75;
/** Below category/phone/reviews-count: a real trust factor, but one a
 *  business influences only indirectly (by earning more reviews), not by
 *  editing a field. */
const WEIGHT_RATING = 65;
const WEIGHT_DESCRIPTION = 55;
const WEIGHT_WEBSITE = 45;
const WEIGHT_LOGO = 35;
const WEIGHT_MAIN_IMAGE = 30;

// ---- Score points -------------------------------------------------------

const PASS_POINTS = 100;
/** A warn is a real gap, not a broken fundamental the way a fail is -- half
 *  credit, not none. */
const WARN_POINTS = 50;
const FAIL_POINTS = 0;

/** Object form (not positional params) so each check-builder's call site
 *  reads like the record it produces, and so this stays under the lint
 *  budget's 5-parameter cap without dropping any field. */
function check(fields: {
  key: string;
  label: string;
  weight: number;
  status: GbpCheckStatus;
  detail: string;
  fix?: string | null;
}): GbpCheck {
  return {
    key: fields.key,
    label: fields.label,
    status: fields.status,
    detail: fields.detail,
    fix: fields.fix ?? null,
    weight: fields.weight,
  };
}

function buildClaimedCheck(isClaimed: boolean | null): GbpCheck {
  if (isClaimed == null) {
    return check({
      key: "claimed",
      label: "Profile claimed",
      weight: WEIGHT_CLAIMED,
      status: "unknown",
      detail:
        "Whether this profile has been claimed is not returned by the data source.",
    });
  }
  if (!isClaimed) {
    return check({
      key: "claimed",
      label: "Profile claimed",
      weight: WEIGHT_CLAIMED,
      status: "fail",
      detail:
        "This Business Profile has not been claimed or verified by its owner.",
      fix: "Claim and verify this listing in Google Business Profile Manager -- every other fix here depends on owning the listing first.",
    });
  }
  return check({
    key: "claimed",
    label: "Profile claimed",
    weight: WEIGHT_CLAIMED,
    status: "pass",
    detail: "This Business Profile is claimed and verified by its owner.",
  });
}

function buildCategoryCheck(
  category: string | null,
  additionalCategories: string[],
): GbpCheck {
  const primary = category?.trim();
  if (!primary) {
    return check({
      key: "category",
      label: "Categories",
      weight: WEIGHT_CATEGORY,
      status: "fail",
      detail: "No primary category is set on this profile.",
      fix: "Set a primary category that matches the main service this business provides.",
    });
  }
  if (additionalCategories.length === 0) {
    return check({
      key: "category",
      label: "Categories",
      weight: WEIGHT_CATEGORY,
      status: "warn",
      detail: `Only the primary category ("${primary}") is set; no additional categories are used.`,
      fix: `Add additional categories -- Google allows up to ${MAX_ADDITIONAL_CATEGORIES}, and every unused slot is reach left on the table.`,
    });
  }
  const count = additionalCategories.length;
  return check({
    key: "category",
    label: "Categories",
    weight: WEIGHT_CATEGORY,
    status: "pass",
    detail: `Primary category "${primary}" plus ${count} additional categor${count === 1 ? "y" : "ies"} are set.`,
  });
}

function buildDescriptionCheck(description: string | null): GbpCheck {
  if (description == null) {
    return check({
      key: "description",
      label: "Description",
      weight: WEIGHT_DESCRIPTION,
      status: "unknown",
      detail: "No description data is available for this profile.",
    });
  }
  const trimmed = description.trim();
  if (trimmed === "") {
    return check({
      key: "description",
      label: "Description",
      weight: WEIGHT_DESCRIPTION,
      status: "fail",
      detail: "This profile has no business description.",
      fix: "Write a description covering what the business does, where, and what sets it apart.",
    });
  }
  if (trimmed.length < MIN_HEALTHY_DESCRIPTION_LENGTH) {
    return check({
      key: "description",
      label: "Description",
      weight: WEIGHT_DESCRIPTION,
      status: "warn",
      detail: `The description is only ${trimmed.length} characters, thin enough to be worth expanding.`,
      fix: "Expand the description with specifics: services offered, service area, and what sets the business apart.",
    });
  }
  return check({
    key: "description",
    label: "Description",
    weight: WEIGHT_DESCRIPTION,
    status: "pass",
    detail: `The description runs ${trimmed.length} characters, a healthy length.`,
  });
}

function buildLogoCheck(logo: string | null): GbpCheck {
  if (logo != null && logo.trim() !== "") {
    return check({
      key: "logo",
      label: "Logo",
      weight: WEIGHT_LOGO,
      status: "pass",
      detail: "A logo is set on this profile.",
    });
  }
  return check({
    key: "logo",
    label: "Logo",
    weight: WEIGHT_LOGO,
    status: "warn",
    detail: "No logo is set on this profile.",
    fix: "Upload a logo so the profile matches the business's branding on Search and Maps.",
  });
}

function buildMainImageCheck(mainImage: string | null): GbpCheck {
  if (mainImage != null && mainImage.trim() !== "") {
    return check({
      key: "mainImage",
      label: "Main photo",
      weight: WEIGHT_MAIN_IMAGE,
      status: "pass",
      detail: "A main photo is set on this profile.",
    });
  }
  return check({
    key: "mainImage",
    label: "Main photo",
    weight: WEIGHT_MAIN_IMAGE,
    status: "warn",
    detail: "No main photo is set on this profile.",
    fix: "Add a primary photo -- profiles with photos get substantially more customer engagement.",
  });
}

function buildPhoneCheck(phone: string | null): GbpCheck {
  if (phone != null && phone.trim() !== "") {
    return check({
      key: "phone",
      label: "Phone number",
      weight: WEIGHT_PHONE,
      status: "pass",
      detail: `Phone number ${phone} is listed on this profile.`,
    });
  }
  return check({
    key: "phone",
    label: "Phone number",
    weight: WEIGHT_PHONE,
    status: "fail",
    detail: "No phone number is listed on this profile.",
    fix: "Add a phone number so customers can reach the business directly from Search and Maps.",
  });
}

/** Reads a URL's hostname, tolerating a bare domain with no scheme (Google
 *  Business Profile data sometimes carries one). Returns null only when the
 *  value can't be read as a host at all, not when it simply doesn't match. */
function extractHost(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    try {
      return new URL(`https://${rawUrl}`).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
}

function stripWww(host: string): string {
  return host.startsWith("www.") ? host.slice(4) : host;
}

function buildWebsiteCheck(
  url: string | null,
  domain: string | null,
): GbpCheck {
  if (url == null) {
    return check({
      key: "website",
      label: "Website",
      weight: WEIGHT_WEBSITE,
      status: "unknown",
      detail: "No website URL is available for this profile.",
    });
  }

  const urlHost = extractHost(url);
  if (urlHost == null) {
    return check({
      key: "website",
      label: "Website",
      weight: WEIGHT_WEBSITE,
      status: "unknown",
      detail: `The website URL "${url}" could not be read as a host to compare against this project's domain.`,
    });
  }
  if (domain == null) {
    return check({
      key: "website",
      label: "Website",
      weight: WEIGHT_WEBSITE,
      status: "unknown",
      detail:
        "A website is listed, but this project's own domain is not known, so there is nothing to compare it against.",
    });
  }

  const listedHost = stripWww(urlHost);
  const projectHost = stripWww(domain.toLowerCase());

  if (listedHost !== projectHost) {
    return check({
      key: "website",
      label: "Website",
      weight: WEIGHT_WEBSITE,
      status: "warn",
      detail: `The profile lists ${listedHost}, but this project's domain is ${projectHost}.`,
      fix: `Update the website link on the profile to ${projectHost}, or confirm ${listedHost} is intentional (e.g. a booking or landing page).`,
    });
  }

  return check({
    key: "website",
    label: "Website",
    weight: WEIGHT_WEBSITE,
    status: "pass",
    detail: `The profile's website (${listedHost}) matches this project's domain.`,
  });
}

function buildReviewsCountCheck(reviewsCount: number | null): GbpCheck {
  if (reviewsCount == null) {
    return check({
      key: "reviewsCount",
      label: "Review count",
      weight: WEIGHT_REVIEWS_COUNT,
      status: "unknown",
      detail: "Review count is not available for this profile.",
    });
  }
  if (reviewsCount === 0) {
    return check({
      key: "reviewsCount",
      label: "Review count",
      weight: WEIGHT_REVIEWS_COUNT,
      status: "fail",
      detail: "This profile has 0 reviews.",
      fix: "Ask recent customers for a Google review -- review count and recency are a major local-ranking signal.",
    });
  }
  if (reviewsCount < MIN_HEALTHY_REVIEWS_COUNT) {
    return check({
      key: "reviewsCount",
      label: "Review count",
      weight: WEIGHT_REVIEWS_COUNT,
      status: "warn",
      detail: `Only ${reviewsCount} review${reviewsCount === 1 ? "" : "s"} on this profile, a thin base for trust or ranking.`,
      fix: "Keep asking customers for reviews -- more (and more recent) reviews build both trust and ranking signal.",
    });
  }
  return check({
    key: "reviewsCount",
    label: "Review count",
    weight: WEIGHT_REVIEWS_COUNT,
    status: "pass",
    detail: `${reviewsCount} reviews, a healthy base.`,
  });
}

function buildRatingCheck(rating: number | null): GbpCheck {
  if (rating == null) {
    return check({
      key: "rating",
      label: "Rating",
      weight: WEIGHT_RATING,
      status: "unknown",
      detail: "Rating is not available for this profile.",
    });
  }
  if (rating < MIN_HEALTHY_RATING) {
    return check({
      key: "rating",
      label: "Rating",
      weight: WEIGHT_RATING,
      status: "warn",
      detail: `The average rating is ${rating}, below the ${MIN_HEALTHY_RATING}-star level most consumers filter for.`,
      fix: "Ask satisfied customers for reviews to lift the average, and follow up on recent negative reviews.",
    });
  }
  return check({
    key: "rating",
    label: "Rating",
    weight: WEIGHT_RATING,
    status: "pass",
    detail: `The average rating is ${rating}, a healthy level.`,
  });
}

/** Below half the checks evaluable, a score would look precise while
 *  resting on too little real data to trust -- say nothing rather than
 *  imply a confidence the data doesn't support. */
function computeScore(checks: GbpCheck[]): number | null {
  const evaluable = checks.filter((c) => c.status !== "unknown");
  if (evaluable.length < checks.length / 2) return null;

  const points = evaluable.reduce((sum, c) => {
    if (c.status === "pass") return sum + PASS_POINTS;
    if (c.status === "warn") return sum + WARN_POINTS;
    return sum + FAIL_POINTS; // "fail" -- evaluable already excludes "unknown"
  }, 0);
  return Math.round(points / evaluable.length);
}

export function buildGbpAudit(input: GbpAuditInput): GbpAudit {
  if (!input.found) {
    return {
      score: null,
      checks: [
        check({
          key: "profile",
          label: "Business profile",
          weight: WEIGHT_CLAIMED,
          status: "unknown",
          detail:
            "No Google Business Profile was found, so there is nothing here to audit.",
        }),
      ],
    };
  }

  const checks = [
    buildClaimedCheck(input.isClaimed),
    buildCategoryCheck(input.category, input.additionalCategories),
    buildDescriptionCheck(input.description),
    buildLogoCheck(input.logo),
    buildMainImageCheck(input.mainImage),
    buildPhoneCheck(input.phone),
    buildWebsiteCheck(input.url, input.domain),
    buildReviewsCountCheck(input.reviewsCount),
    buildRatingCheck(input.rating),
  ].toSorted((a, b) => b.weight - a.weight);

  return { score: computeScore(checks), checks };
}
