import { describe, expect, it } from "vitest";
import {
  buildGbpAudit,
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
  additionalCategories: [],
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

describe("buildGbpAudit - no profile found", () => {
  it("returns a null score and exactly one explanatory check", () => {
    const audit = buildGbpAudit(NOT_FOUND_INPUT);
    expect(audit.score).toBeNull();
    expect(audit.checks).toHaveLength(1);
    expect(audit.checks[0].status).toBe("unknown");
    expect(audit.checks[0].fix).toBeNull();
  });
});

describe("buildGbpAudit - claimed status", () => {
  it("fails an unclaimed profile with the highest weight of any check", () => {
    const audit = buildGbpAudit(baseInput({ isClaimed: false }));
    const claimed = expectCheck(audit, "claimed", "fail");
    const maxWeight = Math.max(...audit.checks.map((c) => c.weight));
    expect(claimed.weight).toBe(maxWeight);
  });

  it("treats isClaimed: null as unknown rather than a failure", () => {
    const audit = buildGbpAudit(baseInput({ isClaimed: null }));
    const claimed = expectCheck(audit, "claimed", "unknown");
    expect(claimed.fix).toBeNull();
  });

  it("passes a claimed profile", () => {
    const audit = buildGbpAudit(baseInput({ isClaimed: true }));
    expectCheck(audit, "claimed", "pass");
  });
});

describe("buildGbpAudit - categories", () => {
  it("fails when there is no primary category", () => {
    const audit = buildGbpAudit(
      baseInput({ category: null, additionalCategories: [] }),
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

describe("buildGbpAudit - description", () => {
  it("treats a null description as unknown, not a failure", () => {
    const audit = buildGbpAudit(baseInput({ description: null }));
    const check = expectCheck(audit, "description", "unknown");
    expect(check.fix).toBeNull();
  });

  it("fails a genuinely empty description, distinct from an unknown one", () => {
    const audit = buildGbpAudit(baseInput({ description: "" }));
    expectCheck(audit, "description", "fail");
  });

  it("does not conflate a null description with an empty one", () => {
    const nullAudit = buildGbpAudit(baseInput({ description: null }));
    const emptyAudit = buildGbpAudit(baseInput({ description: "" }));
    expect(findCheck(nullAudit, "description").status).not.toBe(
      findCheck(emptyAudit, "description").status,
    );
  });

  it("warns on a description just under the healthy length", () => {
    const audit = buildGbpAudit(baseInput({ description: "a".repeat(99) }));
    expectCheck(audit, "description", "warn");
  });

  it("passes a description at the healthy length threshold", () => {
    const audit = buildGbpAudit(baseInput({ description: "a".repeat(100) }));
    expectCheck(audit, "description", "pass");
  });
});

describe("buildGbpAudit - imagery", () => {
  it("warns when the logo is missing", () => {
    const audit = buildGbpAudit(baseInput({ logo: null }));
    expectCheck(audit, "logo", "warn");
  });

  it("passes when a logo is set", () => {
    const audit = buildGbpAudit(baseInput({ logo: "https://x/logo.png" }));
    expectCheck(audit, "logo", "pass");
  });

  it("warns when the main image is missing", () => {
    const audit = buildGbpAudit(baseInput({ mainImage: null }));
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
  it("fails when the phone number is missing", () => {
    const audit = buildGbpAudit(baseInput({ phone: null }));
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

describe("buildGbpAudit - review count", () => {
  it("fails at zero reviews", () => {
    const audit = buildGbpAudit(baseInput({ reviewsCount: 0 }));
    const check = expectCheck(audit, "reviewsCount", "fail");
    expect(check.detail).toContain("0");
  });

  it("warns on a low review count", () => {
    const audit = buildGbpAudit(baseInput({ reviewsCount: 3 }));
    const check = expectCheck(audit, "reviewsCount", "warn");
    expect(check.detail).toContain("3");
  });

  it("passes a healthy review count", () => {
    const audit = buildGbpAudit(baseInput({ reviewsCount: 40 }));
    expectCheck(audit, "reviewsCount", "pass");
  });

  it("treats a null review count as unknown", () => {
    const audit = buildGbpAudit(baseInput({ reviewsCount: null }));
    expectCheck(audit, "reviewsCount", "unknown");
  });
});

describe("buildGbpAudit - rating", () => {
  it("warns below the healthy rating threshold", () => {
    const audit = buildGbpAudit(baseInput({ rating: 3.5 }));
    expectCheck(audit, "rating", "warn");
  });

  it("passes at the healthy rating threshold", () => {
    const audit = buildGbpAudit(baseInput({ rating: 4.0 }));
    expectCheck(audit, "rating", "pass");
  });

  it("treats a null rating as unknown", () => {
    const audit = buildGbpAudit(baseInput({ rating: null }));
    expectCheck(audit, "rating", "unknown");
  });
});

describe("buildGbpAudit - score arithmetic", () => {
  it("scores 100 when every evaluable check passes", () => {
    const audit = buildGbpAudit(baseInput());
    expect(audit.score).toBe(100);
  });

  it("computes an exact score for a known mix of pass, warn, fail, and unknown checks", () => {
    const audit = buildGbpAudit(
      baseInput({
        isClaimed: true, // pass -> 100
        category: "Plumber",
        additionalCategories: [], // warn -> 50
        description: null, // unknown -> excluded
        logo: null, // warn -> 50
        mainImage: "https://x/photo.jpg", // pass -> 100
        phone: null, // fail -> 0
        url: null, // unknown -> excluded
        domain: "example.com",
        reviewsCount: 0, // fail -> 0
        rating: 3.5, // warn -> 50
      }),
    );
    // Evaluable checks: claimed 100, category 50, logo 50, mainImage 100,
    // phone 0, reviewsCount 0, rating 50 = 350 across 7 evaluable checks
    // (description and website are unknown, excluded) = 350 / 7 = 50 exactly.
    expect(audit.score).toBe(50);
  });

  it("excludes unknown checks from the score instead of letting them drag it down", () => {
    const allKnown = buildGbpAudit(baseInput());
    const withExtraUnknowns = buildGbpAudit(
      baseInput({ description: null, url: null, rating: null }),
    );
    expect(allKnown.score).toBe(100);
    expect(withExtraUnknowns.score).toBe(100);
  });
});

describe("buildGbpAudit - check ordering", () => {
  it("returns checks sorted by weight descending", () => {
    const audit = buildGbpAudit(baseInput());
    // ownerResponse sits between rating and description -- its weight (60)
    // was chosen to land there, see WEIGHT_OWNER_RESPONSE's comment.
    expect(audit.checks.map((c) => c.key)).toEqual([
      "claimed",
      "category",
      "phone",
      "reviewsCount",
      "rating",
      "ownerResponse",
      "description",
      "website",
      "logo",
      "mainImage",
    ]);
  });
});

/** Builds a reviews array with `repliedCount` replied reviews (always the
 *  first N) out of `total`, so callers can hit an exact response rate. */
function reviewsWithReplies(
  total: number,
  repliedCount: number,
): Array<{ ownerAnswer: string | null }> {
  return Array.from({ length: total }, (_, i) => ({
    ownerAnswer: i < repliedCount ? "Thanks for the feedback!" : null,
  }));
}

describe("buildGbpAudit - owner response rate", () => {
  it("treats a missing reviews array as unknown, not zero responses", () => {
    const audit = buildGbpAudit(baseInput());
    const check = expectCheck(audit, "ownerResponse", "unknown");
    expect(check.fix).toBeNull();
  });

  it("treats an empty reviews array as unknown, not a failure", () => {
    const audit = buildGbpAudit(baseInput({ reviews: [] }));
    expectCheck(audit, "ownerResponse", "unknown");
  });

  it("fails at a 0% response rate and names the review count", () => {
    const audit = buildGbpAudit(
      baseInput({ reviews: reviewsWithReplies(3, 0) }),
    );
    const check = expectCheck(audit, "ownerResponse", "fail");
    expect(check.detail).toContain("0");
    expect(check.detail).toContain("3");
  });

  it("warns at a low response rate with the exact percentage", () => {
    const audit = buildGbpAudit(
      baseInput({ reviews: reviewsWithReplies(7, 1) }),
    );
    // 1 of 7 replied = 14.2857...% -> rounds to 14%.
    const check = expectCheck(audit, "ownerResponse", "warn");
    expect(check.detail).toContain("14%");
  });

  it("passes at a high response rate", () => {
    const audit = buildGbpAudit(
      baseInput({ reviews: reviewsWithReplies(10, 9) }),
    );
    // 9 of 10 replied = 90%, at/above the healthy response-rate threshold.
    const check = expectCheck(audit, "ownerResponse", "pass");
    expect(check.detail).toContain("90%");
  });

  it("does not drag the score down when reviews are not supplied", () => {
    const audit = buildGbpAudit(baseInput());
    expectCheck(audit, "ownerResponse", "unknown");
    expect(audit.score).toBe(100);
  });
});
