// Sibling of gbpAudit.test.ts (split out to stay under the max-lines cap --
// see dataforseo-research-tools.google-ads.test.ts for the same pattern).
// Covers the "profile completeness" checks -- category, phone, logo, main
// image, website -- plus toGbpAuditInput and the cross-check null-vs-fix
// invariant, which is where the review findings fixed here concentrated:
// several of these checks were treating a `null` field (data source didn't
// return it) as a confirmed omission worth a fix, instead of the "unknown"
// the description check already modeled correctly. Local copies of the
// fixtures/helpers below intentionally mirror gbpAudit.test.ts's rather than
// importing across test files.
import { describe, expect, it } from "vitest";
import {
  buildGbpAudit,
  toGbpAuditInput,
  type GbpAudit,
  type GbpAuditInput,
  type GbpCheck,
  type GbpCheckStatus,
} from "./gbpAudit";

/** A fully-healthy profile: every check below should evaluate to "pass".
 *  Individual tests override only the field(s) they're exercising. */
function baseInput(overrides: Partial<GbpAuditInput> = {}): GbpAuditInput {
  return {
    found: true,
    category: "Plumber",
    additionalCategories: ["Emergency plumber", "Water heater repair"],
    description: "a".repeat(150),
    logo: "https://example.com/logo.png",
    mainImage: "https://example.com/photo.jpg",
    phone: "+1 555-123-4567",
    url: "https://example.com",
    domain: "example.com",
    rating: 4.8,
    reviewsCount: 25,
    isClaimed: true,
    ...overrides,
  };
}

const NOT_FOUND_INPUT: GbpAuditInput = {
  found: false,
  category: null,
  additionalCategories: null,
  description: null,
  logo: null,
  mainImage: null,
  phone: null,
  url: null,
  domain: null,
  rating: null,
  reviewsCount: null,
  isClaimed: null,
};

/** A found profile where every optional field is unknown -- the data source
 *  simply didn't return anything beyond the fact that a listing exists.
 *  Every check below should read "unknown", never a confident pass/warn/fail
 *  built on data that isn't actually there. */
const ALL_UNKNOWN_INPUT: GbpAuditInput = {
  found: true,
  category: null,
  additionalCategories: null,
  description: null,
  logo: null,
  mainImage: null,
  phone: null,
  url: null,
  domain: null,
  rating: null,
  reviewsCount: null,
  isClaimed: null,
  reviews: undefined,
};

function findCheck(audit: GbpAudit, key: string): GbpCheck {
  const check = audit.checks.find((c) => c.key === key);
  if (!check) {
    throw new Error(
      `no check with key "${key}" in ${audit.checks.map((c) => c.key).join(", ")}`,
    );
  }
  return check;
}

/** Looks up a check by key and asserts its status, returning the check so
 *  callers can chain further assertions (detail, fix) when they need them. */
function expectCheck(
  audit: GbpAudit,
  key: string,
  status: GbpCheckStatus,
): GbpCheck {
  const check = findCheck(audit, key);
  expect(check.status).toBe(status);
  return check;
}

/** Builds a reviews array with `repliedCount` replied reviews (always the
 *  first N) out of `total` -- only needed here to prove toGbpAuditInput
 *  passes an already-loaded reviews array through untouched. */
function reviewsWithReplies(
  total: number,
  repliedCount: number,
): Array<{ ownerAnswer: string | null }> {
  return Array.from({ length: total }, (_, i) => ({
    ownerAnswer: i < repliedCount ? "Thanks for the feedback!" : null,
  }));
}

describe("buildGbpAudit - categories", () => {
  it("treats a null category as unknown, not a failure", () => {
    const audit = buildGbpAudit(
      baseInput({ category: null, additionalCategories: null }),
    );
    const check = expectCheck(audit, "category", "unknown");
    expect(check.fix).toBeNull();
  });

  it("fails when the primary category is genuinely empty", () => {
    const audit = buildGbpAudit(
      baseInput({ category: "", additionalCategories: [] }),
    );
    expectCheck(audit, "category", "fail");
  });

  it("warns when a primary category is set but no additional categories are used", () => {
    const audit = buildGbpAudit(
      baseInput({ category: "Plumber", additionalCategories: [] }),
    );
    const check = expectCheck(audit, "category", "warn");
    expect(check.detail).toContain("Plumber");
  });

  it("treats a null additionalCategories as unknown once the primary category is known", () => {
    // Finding 3's failing input: DataForSEO returns a category but omits
    // additional_categories entirely -- distinct from returning it empty,
    // and the audit must not guess which one happened.
    const audit = buildGbpAudit(
      baseInput({ category: "Plumber", additionalCategories: null }),
    );
    const check = expectCheck(audit, "category", "unknown");
    expect(check.fix).toBeNull();
  });

  it("passes when a primary category and at least one additional category are set", () => {
    const audit = buildGbpAudit(
      baseInput({
        category: "Plumber",
        additionalCategories: ["Emergency plumber"],
      }),
    );
    expectCheck(audit, "category", "pass");
  });
});

describe("buildGbpAudit - imagery", () => {
  it("treats a null logo as unknown, not a failure", () => {
    const audit = buildGbpAudit(baseInput({ logo: null }));
    const check = expectCheck(audit, "logo", "unknown");
    expect(check.fix).toBeNull();
  });

  it("warns when the logo is genuinely empty", () => {
    const audit = buildGbpAudit(baseInput({ logo: "" }));
    expectCheck(audit, "logo", "warn");
  });

  it("passes when a logo is set", () => {
    const audit = buildGbpAudit(baseInput({ logo: "https://x/logo.png" }));
    expectCheck(audit, "logo", "pass");
  });

  it("treats a null main image as unknown, not a failure", () => {
    const audit = buildGbpAudit(baseInput({ mainImage: null }));
    const check = expectCheck(audit, "mainImage", "unknown");
    expect(check.fix).toBeNull();
  });

  it("warns when the main image is genuinely empty", () => {
    const audit = buildGbpAudit(baseInput({ mainImage: "" }));
    expectCheck(audit, "mainImage", "warn");
  });

  it("passes when a main image is set", () => {
    const audit = buildGbpAudit(
      baseInput({ mainImage: "https://x/photo.jpg" }),
    );
    expectCheck(audit, "mainImage", "pass");
  });
});

describe("buildGbpAudit - phone", () => {
  it("treats a null phone as unknown, not a failure", () => {
    const audit = buildGbpAudit(baseInput({ phone: null }));
    const check = expectCheck(audit, "phone", "unknown");
    expect(check.fix).toBeNull();
  });

  it("fails when the phone number is genuinely empty", () => {
    const audit = buildGbpAudit(baseInput({ phone: "" }));
    expectCheck(audit, "phone", "fail");
  });

  it("passes when a phone number is set", () => {
    const audit = buildGbpAudit(baseInput({ phone: "+15551234567" }));
    expectCheck(audit, "phone", "pass");
  });
});

describe("buildGbpAudit - website", () => {
  it("treats a null url as unknown", () => {
    const audit = buildGbpAudit(baseInput({ url: null }));
    expectCheck(audit, "website", "unknown");
  });

  it("fails a genuinely empty website instead of treating it as unknown", () => {
    // Finding 4's failing input: url "" (seen and genuinely blank) was
    // previously indistinguishable from url null (never seen at all).
    const audit = buildGbpAudit(baseInput({ url: "", domain: "example.com" }));
    const check = expectCheck(audit, "website", "fail");
    expect(check.fix).not.toBeNull();
  });

  it("warns and names both hosts when the url does not match the project's domain", () => {
    const audit = buildGbpAudit(
      baseInput({ url: "https://www.otherbrand.com", domain: "example.com" }),
    );
    const check = expectCheck(audit, "website", "warn");
    expect(check.detail).toContain("otherbrand.com");
    expect(check.detail).toContain("example.com");
  });

  it("passes when the url host matches the project's domain, ignoring a www prefix", () => {
    const audit = buildGbpAudit(
      baseInput({
        url: "https://www.example.com/plumbing",
        domain: "example.com",
      }),
    );
    expectCheck(audit, "website", "pass");
  });

  it("treats an unknown project domain as unknown rather than guessing at a mismatch", () => {
    const audit = buildGbpAudit(
      baseInput({ url: "https://example.com", domain: null }),
    );
    expectCheck(audit, "website", "unknown");
  });
});

describe("toGbpAuditInput", () => {
  it("compares the website against the project's domain, not the profile's own domain", () => {
    // Finding 1's failing input verbatim: project domain "example.com",
    // profile { url: "https://competitor.com", domain: "competitor.com" }.
    // Before this fix, passing profile.domain through as the comparison
    // target compared the listing's website to itself and always "passed".
    const profile = baseInput({
      url: "https://competitor.com",
      domain: "competitor.com",
    });
    const input = toGbpAuditInput(profile, "example.com", undefined);
    expect(input.domain).toBe("example.com");

    const website = findCheck(buildGbpAudit(input), "website");
    expect(website.status).not.toBe("pass");
    expect(website.detail).toContain("competitor.com");
    expect(website.detail).toContain("example.com");
  });

  it("treats a project with no domain of its own as unknown to compare against, not a self-match", () => {
    const profile = baseInput({ url: "https://competitor.com" });
    const input = toGbpAuditInput(profile, null, undefined);
    expectCheck(buildGbpAudit(input), "website", "unknown");
  });

  it("passes through the reviews argument untouched", () => {
    const reviews = reviewsWithReplies(10, 9);
    const input = toGbpAuditInput(baseInput(), "example.com", reviews);
    expect(input.reviews).toBe(reviews);
  });
});

/** Every `unknown` check must carry `fix: null` -- GbpAuditCard renders
 *  `check.fix` whenever it's non-null regardless of status (it isn't gated
 *  to warn/fail the way the "Fix on Google" button is), so a violation here
 *  isn't just a data-modeling slip: it would show a fix suggestion under a
 *  check the UI simultaneously mutes as "we can't verify this". This is the
 *  one property every finding in this file shares, so it's asserted across
 *  every check of every audit built below rather than spot-checked. */
function expectNoFixOnUnknown(audit: GbpAudit): void {
  for (const check of audit.checks) {
    if (check.status === "unknown") {
      expect(check.fix).toBeNull();
    }
  }
}

/** One override per nullable GbpAuditInput field, in isolation (every other
 *  field stays at its fully-known baseInput() value) -- covers every check
 *  this file exercises, without the combinatorial blowup of trying every
 *  field jointly. */
const SINGLE_FIELD_UNKNOWN_OVERRIDES: Partial<GbpAuditInput>[] = [
  { category: null },
  { additionalCategories: null },
  { description: null },
  { logo: null },
  { mainImage: null },
  { phone: null },
  { url: null },
  { domain: null },
  { rating: null },
  { reviewsCount: null },
  { isClaimed: null },
];

describe("buildGbpAudit - unknown/fix invariant", () => {
  it("never pairs an unknown status with a non-null fix, for any single unknown field", () => {
    for (const override of SINGLE_FIELD_UNKNOWN_OVERRIDES) {
      expectNoFixOnUnknown(buildGbpAudit(baseInput(override)));
    }
  });

  it("never pairs an unknown status with a non-null fix when every field is unknown", () => {
    expectNoFixOnUnknown(buildGbpAudit(ALL_UNKNOWN_INPUT));
  });

  it("never pairs an unknown status with a non-null fix on a fully-known profile", () => {
    expectNoFixOnUnknown(buildGbpAudit(baseInput()));
  });

  it("never pairs an unknown status with a non-null fix when no profile is found", () => {
    expectNoFixOnUnknown(buildGbpAudit(NOT_FOUND_INPUT));
  });
});
