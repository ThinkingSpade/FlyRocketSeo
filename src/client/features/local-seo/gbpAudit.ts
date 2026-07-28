/**
 * Scores the Google Business Profile LocalSeoService has already fetched --
 * completeness, categories, description, imagery, reviews, and owner
 * responsiveness -- and turns the gaps into ranked, specific fixes. Every
 * field read here already lives on `getCachedBusinessContext`'s profile (or
 * the reviews payload already fetched alongside it), so running this audit
 * adds no new metered call.
 *
 * The rule that matters most, and applies uniformly to every check below: a
 * `null` field means the data source didn't return it, not that the
 * business left it blank. Confusing the two would have this confidently
 * tell someone to add a phone number, upload a logo, set a category, or
 * write a description they already have. So a `null` field is always
 * `status: "unknown"` with `fix: null`, and unknown checks are excluded from
 * the score's denominator entirely -- only checks we can actually read
 * count toward it, and if fewer than half of them are readable the score is
 * `null` rather than a precise-looking number resting on too little data.
 *
 * A field the data source *did* return, but as a genuinely empty string or
 * array, is a different situation entirely: that's the business's own
 * answer, not a gap in what we could see, so reporting it (no category set,
 * an empty description, zero additional categories) is this audit doing
 * its job, not overclaiming.
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
  /** `null` when DataForSEO didn't return this field at all (see
   *  LocalSeoService's `mapBusinessProfile`), distinct from `[]` (returned,
   *  and the business genuinely has none) -- buildCategoryCheck relies on
   *  telling the two apart. */
  additionalCategories: string[] | null;
  description: string | null;
  logo: string | null;
  mainImage: string | null;
  phone: string | null;
  url: string | null;
  domain: string | null;
  rating: number | null;
  reviewsCount: number | null;
  isClaimed: boolean | null;
  /** Owner replies per review, from the same reviews payload the Local SEO
   *  tab already fetches (`ReviewRow.ownerAnswer`) -- optional because a
   *  caller may not have loaded reviews yet, which is distinct from having
   *  loaded zero of them. */
  reviews?: Array<{ ownerAnswer: string | null }>;
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

/** Below this owner-reply rate, there is a real and growing gap against the
 *  reply-to-everything best practice -- not zero, but not the norm either. */
const MIN_HEALTHY_RESPONSE_RATE = 0.8;

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
/** Below rating: responsiveness matters, but it is a reaction to the
 *  reviews a business already has, not a driver of new ones the way
 *  category or review count are. */
const WEIGHT_OWNER_RESPONSE = 60;
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

/** Binds a check's key/label/weight once so every branch of a multi-way
 *  check states only what actually varies: status, detail, and (for warn
 *  or fail) fix. Without this, each branch below would repeat the same
 *  key/label/weight triple. */
function checkKind(key: string, label: string, weight: number) {
  return (
    status: GbpCheckStatus,
    detail: string,
    fix: string | null = null,
  ): GbpCheck => ({ key, label, status, detail, fix, weight });
}

function buildClaimedCheck(isClaimed: boolean | null): GbpCheck {
  const claimed = checkKind("claimed", "Profile claimed", WEIGHT_CLAIMED);
  if (isClaimed == null) {
    return claimed(
      "unknown",
      "Whether this profile has been claimed is not returned by the data source.",
    );
  }
  if (!isClaimed) {
    return claimed(
      "fail",
      "This Business Profile has not been claimed or verified by its owner.",
      "Claim and verify this listing in Google Business Profile Manager -- every other fix here depends on owning the listing first.",
    );
  }
  return claimed(
    "pass",
    "This Business Profile is claimed and verified by its owner.",
  );
}

function buildCategoryCheck(
  category: string | null,
  additionalCategories: string[] | null,
): GbpCheck {
  const categoryCheck = checkKind("category", "Categories", WEIGHT_CATEGORY);
  if (category == null) {
    return categoryCheck(
      "unknown",
      "No category data is available for this profile.",
    );
  }
  const primary = category.trim();
  if (primary === "") {
    return categoryCheck(
      "fail",
      "No primary category is set on this profile.",
      "Set a primary category that matches the main service this business provides.",
    );
  }
  if (additionalCategories == null) {
    return categoryCheck(
      "unknown",
      `Primary category "${primary}" is set, but additional-category data is not available for this profile.`,
    );
  }
  if (additionalCategories.length === 0) {
    return categoryCheck(
      "warn",
      `Only the primary category ("${primary}") is set; no additional categories are used.`,
      `Add additional categories -- Google allows up to ${MAX_ADDITIONAL_CATEGORIES}, and every unused slot is reach left on the table.`,
    );
  }
  const count = additionalCategories.length;
  return categoryCheck(
    "pass",
    `Primary category "${primary}" plus ${count} additional categor${count === 1 ? "y" : "ies"} are set.`,
  );
}

function buildDescriptionCheck(description: string | null): GbpCheck {
  const descriptionCheck = checkKind(
    "description",
    "Description",
    WEIGHT_DESCRIPTION,
  );
  if (description == null) {
    return descriptionCheck(
      "unknown",
      "No description data is available for this profile.",
    );
  }
  const trimmed = description.trim();
  if (trimmed === "") {
    return descriptionCheck(
      "fail",
      "This profile has no business description.",
      "Write a description covering what the business does, where, and what sets it apart.",
    );
  }
  if (trimmed.length < MIN_HEALTHY_DESCRIPTION_LENGTH) {
    return descriptionCheck(
      "warn",
      `The description is only ${trimmed.length} characters, thin enough to be worth expanding.`,
      "Expand the description with specifics: services offered, service area, and what sets the business apart.",
    );
  }
  return descriptionCheck(
    "pass",
    `The description runs ${trimmed.length} characters, a healthy length.`,
  );
}

function buildLogoCheck(logo: string | null): GbpCheck {
  const logoCheck = checkKind("logo", "Logo", WEIGHT_LOGO);
  if (logo == null) {
    return logoCheck("unknown", "No logo data is available for this profile.");
  }
  if (logo.trim() !== "") {
    return logoCheck("pass", "A logo is set on this profile.");
  }
  return logoCheck(
    "warn",
    "No logo is set on this profile.",
    "Upload a logo so the profile matches the business's branding on Search and Maps.",
  );
}

function buildMainImageCheck(mainImage: string | null): GbpCheck {
  const mainImageCheck = checkKind(
    "mainImage",
    "Main photo",
    WEIGHT_MAIN_IMAGE,
  );
  if (mainImage == null) {
    return mainImageCheck(
      "unknown",
      "No main photo data is available for this profile.",
    );
  }
  if (mainImage.trim() !== "") {
    return mainImageCheck("pass", "A main photo is set on this profile.");
  }
  return mainImageCheck(
    "warn",
    "No main photo is set on this profile.",
    "Add a primary photo -- profiles with photos get substantially more customer engagement.",
  );
}

function buildPhoneCheck(phone: string | null): GbpCheck {
  const phoneCheck = checkKind("phone", "Phone number", WEIGHT_PHONE);
  if (phone == null) {
    return phoneCheck(
      "unknown",
      "No phone number data is available for this profile.",
    );
  }
  const trimmed = phone.trim();
  if (trimmed !== "") {
    return phoneCheck(
      "pass",
      `Phone number ${trimmed} is listed on this profile.`,
    );
  }
  return phoneCheck(
    "fail",
    "No phone number is listed on this profile.",
    "Add a phone number so customers can reach the business directly from Search and Maps.",
  );
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
  const websiteCheck = checkKind("website", "Website", WEIGHT_WEBSITE);
  if (url == null) {
    return websiteCheck(
      "unknown",
      "No website data is available for this profile.",
    );
  }

  const trimmedUrl = url.trim();
  if (trimmedUrl === "") {
    return websiteCheck(
      "fail",
      "No website is listed on this profile.",
      "Add the business's website to the profile so customers can reach it directly from Search and Maps.",
    );
  }

  const urlHost = extractHost(trimmedUrl);
  if (urlHost == null) {
    return websiteCheck(
      "unknown",
      `The website URL "${trimmedUrl}" could not be read as a host to compare against this project's domain.`,
    );
  }
  if (domain == null) {
    return websiteCheck(
      "unknown",
      "A website is listed, but this project's own domain is not known, so there is nothing to compare it against.",
    );
  }

  const listedHost = stripWww(urlHost);
  const projectHost = stripWww(domain.toLowerCase());

  if (listedHost !== projectHost) {
    return websiteCheck(
      "warn",
      `The profile lists ${listedHost}, but this project's domain is ${projectHost}.`,
      `Update the website link on the profile to ${projectHost}, or confirm ${listedHost} is intentional (e.g. a booking or landing page).`,
    );
  }

  return websiteCheck(
    "pass",
    `The profile's website (${listedHost}) matches this project's domain.`,
  );
}

function buildReviewsCountCheck(reviewsCount: number | null): GbpCheck {
  const reviewsCountCheck = checkKind(
    "reviewsCount",
    "Review count",
    WEIGHT_REVIEWS_COUNT,
  );
  if (reviewsCount == null) {
    return reviewsCountCheck(
      "unknown",
      "Review count is not available for this profile.",
    );
  }
  if (reviewsCount === 0) {
    return reviewsCountCheck(
      "fail",
      "This profile has 0 reviews.",
      "Ask recent customers for a Google review -- review count and recency are a major local-ranking signal.",
    );
  }
  if (reviewsCount < MIN_HEALTHY_REVIEWS_COUNT) {
    return reviewsCountCheck(
      "warn",
      `Only ${reviewsCount} review${reviewsCount === 1 ? "" : "s"} on this profile, a thin base for trust or ranking.`,
      "Keep asking customers for reviews -- more (and more recent) reviews build both trust and ranking signal.",
    );
  }
  return reviewsCountCheck("pass", `${reviewsCount} reviews, a healthy base.`);
}

function buildRatingCheck(rating: number | null): GbpCheck {
  const ratingCheck = checkKind("rating", "Rating", WEIGHT_RATING);
  if (rating == null) {
    return ratingCheck("unknown", "Rating is not available for this profile.");
  }
  if (rating < MIN_HEALTHY_RATING) {
    return ratingCheck(
      "warn",
      `The average rating is ${rating}, below the ${MIN_HEALTHY_RATING}-star level most consumers filter for.`,
      "Ask satisfied customers for reviews to lift the average, and follow up on recent negative reviews.",
    );
  }
  return ratingCheck(
    "pass",
    `The average rating is ${rating}, a healthy level.`,
  );
}

/** True when a review carries a real, non-blank owner reply. Mirrors
 *  reviewAnalytics.ts's `hasReply` (not imported from it: that module is a
 *  sibling concern -- review-set analytics for the tab's charts -- and this
 *  one-line rule is cheaper to duplicate than to couple the two modules
 *  over). */
function hasOwnerReply(review: { ownerAnswer: string | null }): boolean {
  return (review.ownerAnswer ?? "").trim() !== "";
}

function buildOwnerResponseCheck(
  reviews: Array<{ ownerAnswer: string | null }> | undefined,
): GbpCheck {
  const ownerResponseCheck = checkKind(
    "ownerResponse",
    "Owner responses",
    WEIGHT_OWNER_RESPONSE,
  );
  if (reviews == null) {
    return ownerResponseCheck(
      "unknown",
      "Review data has not been loaded, so the owner response rate is not known.",
    );
  }
  if (reviews.length === 0) {
    return ownerResponseCheck(
      "unknown",
      "This profile has no reviews yet, so there is nothing to respond to.",
    );
  }

  const answered = reviews.filter(hasOwnerReply).length;
  const rate = answered / reviews.length;
  const pct = Math.round(rate * 100);

  if (answered === 0) {
    return ownerResponseCheck(
      "fail",
      `0 of ${reviews.length} reviews have an owner reply.`,
      "Reply to every review, starting with the most recent -- responsiveness is a visible trust signal to prospective customers.",
    );
  }
  if (rate < MIN_HEALTHY_RESPONSE_RATE) {
    return ownerResponseCheck(
      "warn",
      `${pct}% of ${reviews.length} reviews have an owner reply, a thin response rate.`,
      "Reply to more reviews -- responsiveness is a trust signal both customers and Google notice.",
    );
  }
  return ownerResponseCheck(
    "pass",
    `${pct}% of ${reviews.length} reviews have an owner reply.`,
  );
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
        checkKind(
          "profile",
          "Business profile",
          WEIGHT_CLAIMED,
        )(
          "unknown",
          "No Google Business Profile was found, so there is nothing here to audit.",
        ),
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
    buildOwnerResponseCheck(input.reviews),
  ].toSorted((a, b) => b.weight - a.weight);

  return { score: computeScore(checks), checks };
}

/**
 * Assembles buildGbpAudit's input from a fetched profile, the project's own
 * domain, and whatever reviews have loaded so far. `projectDomain` is a
 * separate parameter rather than a field this reads off `profile` on
 * purpose: the website check (buildWebsiteCheck) exists to compare the
 * profile's listed website against the *project's* domain, and a profile
 * always carries its own domain too (`BusinessProfile.domain`, the host its
 * own listed website resolves to). Reading that field here instead would
 * compare the listing to itself and always "pass" -- exactly the bug this
 * factory exists to make impossible to reintroduce at a call site, by never
 * giving callers a `domain` field on `profile` to reach for in the first
 * place (see the `Omit` below).
 */
export function toGbpAuditInput(
  profile: Omit<GbpAuditInput, "domain" | "reviews">,
  projectDomain: string | null,
  reviews: GbpAuditInput["reviews"],
): GbpAuditInput {
  return { ...profile, domain: projectDomain, reviews };
}
