import { describe, expect, it } from "vitest";
import { buildGbpAudit, type GbpAudit, type GbpAuditInput } from "./gbpAudit";

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

function findCheck(audit: GbpAudit, key: string) {
  const check = audit.checks.find((c) => c.key === key);
  if (!check)
    throw new Error(
      `no check with key "${key}" in ${audit.checks.map((c) => c.key).join(", ")}`,
    );
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
    const claimed = findCheck(audit, "claimed");
    expect(claimed.status).toBe("fail");
    const maxWeight = Math.max(...audit.checks.map((c) => c.weight));
    expect(claimed.weight).toBe(maxWeight);
  });

  it("treats isClaimed: null as unknown rather than a failure", () => {
    const audit = buildGbpAudit(baseInput({ isClaimed: null }));
    const claimed = findCheck(audit, "claimed");
    expect(claimed.status).toBe("unknown");
    expect(claimed.fix).toBeNull();
  });

  it("passes a claimed profile", () => {
    const audit = buildGbpAudit(baseInput({ isClaimed: true }));
    expect(findCheck(audit, "claimed").status).toBe("pass");
  });
});

describe("buildGbpAudit - categories", () => {
  it("fails when there is no primary category", () => {
    const audit = buildGbpAudit(
      baseInput({ category: null, additionalCategories: [] }),
    );
    expect(findCheck(audit, "category").status).toBe("fail");
  });

  it("warns when a primary category is set but no additional categories are used", () => {
    const audit = buildGbpAudit(
      baseInput({ category: "Plumber", additionalCategories: [] }),
    );
    const check = findCheck(audit, "category");
    expect(check.status).toBe("warn");
    expect(check.detail).toContain("Plumber");
  });

  it("passes when a primary category and at least one additional category are set", () => {
    const audit = buildGbpAudit(
      baseInput({
        category: "Plumber",
        additionalCategories: ["Emergency plumber"],
      }),
    );
    expect(findCheck(audit, "category").status).toBe("pass");
  });
});

describe("buildGbpAudit - description", () => {
  it("treats a null description as unknown, not a failure", () => {
    const audit = buildGbpAudit(baseInput({ description: null }));
    const check = findCheck(audit, "description");
    expect(check.status).toBe("unknown");
    expect(check.fix).toBeNull();
  });

  it("fails a genuinely empty description, distinct from an unknown one", () => {
    const audit = buildGbpAudit(baseInput({ description: "" }));
    expect(findCheck(audit, "description").status).toBe("fail");
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
    expect(findCheck(audit, "description").status).toBe("warn");
  });

  it("passes a description at the healthy length threshold", () => {
    const audit = buildGbpAudit(baseInput({ description: "a".repeat(100) }));
    expect(findCheck(audit, "description").status).toBe("pass");
  });
});

describe("buildGbpAudit - imagery", () => {
  it("warns when the logo is missing", () => {
    const audit = buildGbpAudit(baseInput({ logo: null }));
    expect(findCheck(audit, "logo").status).toBe("warn");
  });

  it("passes when a logo is set", () => {
    const audit = buildGbpAudit(baseInput({ logo: "https://x/logo.png" }));
    expect(findCheck(audit, "logo").status).toBe("pass");
  });

  it("warns when the main image is missing", () => {
    const audit = buildGbpAudit(baseInput({ mainImage: null }));
    expect(findCheck(audit, "mainImage").status).toBe("warn");
  });

  it("passes when a main image is set", () => {
    const audit = buildGbpAudit(
      baseInput({ mainImage: "https://x/photo.jpg" }),
    );
    expect(findCheck(audit, "mainImage").status).toBe("pass");
  });
});

describe("buildGbpAudit - phone", () => {
  it("fails when the phone number is missing", () => {
    const audit = buildGbpAudit(baseInput({ phone: null }));
    expect(findCheck(audit, "phone").status).toBe("fail");
  });

  it("passes when a phone number is set", () => {
    const audit = buildGbpAudit(baseInput({ phone: "+15551234567" }));
    expect(findCheck(audit, "phone").status).toBe("pass");
  });
});

describe("buildGbpAudit - website", () => {
  it("treats a null url as unknown", () => {
    const audit = buildGbpAudit(baseInput({ url: null }));
    expect(findCheck(audit, "website").status).toBe("unknown");
  });

  it("warns and names both hosts when the url does not match the project's domain", () => {
    const audit = buildGbpAudit(
      baseInput({ url: "https://www.otherbrand.com", domain: "example.com" }),
    );
    const check = findCheck(audit, "website");
    expect(check.status).toBe("warn");
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
    expect(findCheck(audit, "website").status).toBe("pass");
  });

  it("treats an unknown project domain as unknown rather than guessing at a mismatch", () => {
    const audit = buildGbpAudit(
      baseInput({ url: "https://example.com", domain: null }),
    );
    expect(findCheck(audit, "website").status).toBe("unknown");
  });
});

describe("buildGbpAudit - review count", () => {
  it("fails at zero reviews", () => {
    const audit = buildGbpAudit(baseInput({ reviewsCount: 0 }));
    const check = findCheck(audit, "reviewsCount");
    expect(check.status).toBe("fail");
    expect(check.detail).toContain("0");
  });

  it("warns on a low review count", () => {
    const audit = buildGbpAudit(baseInput({ reviewsCount: 3 }));
    const check = findCheck(audit, "reviewsCount");
    expect(check.status).toBe("warn");
    expect(check.detail).toContain("3");
  });

  it("passes a healthy review count", () => {
    const audit = buildGbpAudit(baseInput({ reviewsCount: 40 }));
    expect(findCheck(audit, "reviewsCount").status).toBe("pass");
  });

  it("treats a null review count as unknown", () => {
    const audit = buildGbpAudit(baseInput({ reviewsCount: null }));
    expect(findCheck(audit, "reviewsCount").status).toBe("unknown");
  });
});

describe("buildGbpAudit - rating", () => {
  it("warns below the healthy rating threshold", () => {
    const audit = buildGbpAudit(baseInput({ rating: 3.5 }));
    expect(findCheck(audit, "rating").status).toBe("warn");
  });

  it("passes at the healthy rating threshold", () => {
    const audit = buildGbpAudit(baseInput({ rating: 4.0 }));
    expect(findCheck(audit, "rating").status).toBe("pass");
  });

  it("treats a null rating as unknown", () => {
    const audit = buildGbpAudit(baseInput({ rating: null }));
    expect(findCheck(audit, "rating").status).toBe("unknown");
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
    expect(audit.checks.map((c) => c.key)).toEqual([
      "claimed",
      "category",
      "phone",
      "reviewsCount",
      "rating",
      "description",
      "website",
      "logo",
      "mainImage",
    ]);
  });
});
