import { describe, expect, it, vi } from "vitest";
// The wording/view layer pulls in no server function of its own, so it loads
// normally; only the chapter module below needs the mocked dynamic import.
import { describeOtherListing, listingView, postsView } from "./localSeoViews";

// The chapter module imports its three server functions at the top level, and
// each of those pulls `cloudflare:workers` in transitively. Only the pure
// builders are under test here, so the modules are replaced wholesale rather
// than loaded — the same shape the other client-side tests in this repo use.
vi.mock("@/serverFunctions/projects", () => ({ getProjects: vi.fn() }));
vi.mock("@/serverFunctions/local-seo", () => ({
  getCachedBusinessContext: vi.fn(),
}));
vi.mock("@/serverFunctions/gbp", () => ({
  getGbpConnection: vi.fn(),
  listGbpScheduledPosts: vi.fn(),
}));

const { buildlocalSeoChapter, photoCount, reportableChecks } =
  await import("./localSeo");
type LocalSeoData = Parameters<typeof buildlocalSeoChapter>[0];
type LocalSeoProfile = NonNullable<LocalSeoData["profile"]>;
type LocalSeoPost = LocalSeoData["posts"][number];

/**
 * This chapter is printed and handed to a client, so the assertion that matters
 * is never "the chapter is missing" — it is which sentence the sheet gives as
 * the reason. A read that threw, a read still in flight, and a lookup that was
 * never run are three different accusations, and only one of them blames the
 * agency. Every test below therefore pins the sentence that MUST appear and,
 * where the two could be confused, the one that must NOT.
 */

const CHAPTER_TITLE = "Your Google Business Profile";

const NEVER_RUN =
  "No Google Business Profile lookup is on file for this project. Saved lookups are kept for a limited window, so one run earlier in the period may no longer be on file — re-running the Local SEO lookup restores this chapter.";

const READ_FAILED =
  "The saved Google Business Profile lookup could not be read while this report was generated — that request failed rather than returning nothing.";

const LOOKUP_LOADING =
  "The saved Google Business Profile lookup was still loading when this report was generated.";

const POSTS_FAILED =
  "The Google Business Profile posting history could not be read while this report was generated — that request failed rather than returning nothing.";

const POSTS_LOADING =
  "The Google Business Profile posting history was still loading when this report was generated.";

const PROJECT_FAILED =
  "This project's own record could not be read while this report was generated — that request failed rather than returning nothing.";

const NO_POSTS_IN_JULY =
  "No posts scheduled for July 2026 have been published to your Google Business Profile.";

/** The sentence this chapter used to print for an unread posts query, an
 *  unconnected period and a post whose publication date it never had. It must
 *  not survive anywhere. */
const RETIRED_NO_POSTS =
  "No posts were published to your Google Business Profile during this period.";

function reads(
  overrides: Partial<LocalSeoData["readFailures"]> = {},
): LocalSeoData["readFailures"] {
  return {
    projects: false,
    localBusiness: false,
    gbpConnection: false,
    gbpPosts: false,
    ...overrides,
  };
}

function profile(overrides: Partial<LocalSeoProfile> = {}): LocalSeoProfile {
  return {
    found: true,
    title: "Nguyen Dental",
    category: "Dentist",
    additionalCategories: ["Cosmetic dentist"],
    description: "A long-standing family dental practice in the city centre.",
    logo: "https://example.com/logo.png",
    mainImage: "https://example.com/main.png",
    phone: "+1 555 0100",
    url: "https://example.com",
    rating: 4.6,
    reviewsCount: 128,
    isClaimed: true,
    fetchedAt: "2026-07-14T09:00:00.000Z",
    ...overrides,
  };
}

function post(overrides: Partial<LocalSeoPost> = {}): LocalSeoPost {
  return {
    id: "post-1",
    content: "Late-night appointments now available.",
    scheduledAt: "2026-07-10T09:00:00.000Z",
    status: "published",
    ...overrides,
  };
}

function data(overrides: Partial<LocalSeoData> = {}): LocalSeoData {
  return {
    profile: null,
    domain: "example.com",
    connected: false,
    posts: [],
    periodStart: "2026-07-01T00:00:00.000Z",
    periodEnd: "2026-08-01T00:00:00.000Z",
    periodLabel: "July 2026",
    readFailures: reads(),
    pendingReads: reads(),
    ...overrides,
  };
}

function collect(overrides: Partial<LocalSeoData> = {}) {
  const pages: Array<{ key: string; title: string }> = [];
  const omissions: Array<{ title: string; reason: string }> = [];
  buildlocalSeoChapter(data(overrides), {
    add: (spec) => pages.push({ key: spec.key, title: spec.title }),
    drop: (title, reason) => omissions.push({ title, reason }),
  });
  return { pages, omissions };
}

function dropReason(result: ReturnType<typeof collect>): string | undefined {
  return result.omissions.find((entry) => entry.title === CHAPTER_TITLE)
    ?.reason;
}

/** A check row, stripped to the two fields `reportableChecks` sorts on. */
function check(key: string, status: "pass" | "unknown") {
  return { key, label: key, status, detail: "", fix: null, weight: 10 };
}

describe("buildlocalSeoChapter", () => {
  it("adds the chapter when a found listing is on file", () => {
    const result = collect({ profile: profile() });

    expect(result.omissions).toEqual([]);
    expect(result.pages).toEqual([{ key: "local-seo", title: CHAPTER_TITLE }]);
  });

  it("adds the chapter on published posts alone, with no listing on file", () => {
    const result = collect({ connected: true, posts: [post()] });

    expect(result.pages).toHaveLength(1);
    expect(result.omissions).toEqual([]);
  });

  it("drops with the read-failure sentence when the saved lookup threw", () => {
    const result = collect({ readFailures: reads({ localBusiness: true }) });

    expect(result.pages).toEqual([]);
    expect(dropReason(result)).toBe(READ_FAILED);
  });

  it("never prints never-run for a failed read, even with the listing connected", () => {
    const result = collect({
      connected: true,
      readFailures: reads({ localBusiness: true }),
    });

    expect(dropReason(result)).toContain(READ_FAILED);
    expect(dropReason(result)).not.toContain(NEVER_RUN);
  });

  it("names both reads when the lookup and the posting history both threw", () => {
    const result = collect({
      readFailures: reads({ localBusiness: true, gbpPosts: true }),
    });

    expect(dropReason(result)).toBe(
      "The saved Google Business Profile lookup and the Google Business Profile posting history could not be read while this report was generated — those requests failed rather than returning nothing.",
    );
  });

  it("drops with the never-run sentence when nothing was ever run", () => {
    const result = collect();

    expect(result.pages).toEqual([]);
    expect(dropReason(result)).toBe(NEVER_RUN);
  });

  it("drops a lookup that found no listing without calling it never run", () => {
    const result = collect({ profile: profile({ found: false }) });

    expect(result.pages).toEqual([]);
    expect(dropReason(result)).toBe(
      "The Google Business Profile lookup on file found no listing for this business.",
    );
  });

  it("keeps the owner-response row off the sheet, and the rest in display order", () => {
    expect(
      reportableChecks([
        check("ownerResponse", "unknown"),
        check("website", "unknown"),
        check("phone", "pass"),
      ]).map((entry) => entry.key),
      // The report has no path to review text, so that row could only ever say
      // "Not visible" — and would hold scoreBasisHint at "9 of 10" forever.
    ).toEqual(["phone", "website"]);
  });

  it("ignores posts outside the period and posts that never published", () => {
    const result = collect({
      connected: true,
      posts: [
        post({ id: "old", scheduledAt: "2026-05-02T09:00:00.000Z" }),
        post({ id: "queued", status: "scheduled" }),
      ],
    });

    expect(result.pages).toEqual([]);
    expect(dropReason(result)).toContain(NO_POSTS_IN_JULY);
  });
});

// Finding 9: the connected-but-empty drop used to speak only about posts, so
// the client was never told the half they can act on — the lookup — is missing.
describe("a drop states both halves", () => {
  it("names the missing lookup as well as the empty posting month", () => {
    const reason = dropReason(collect({ connected: true }));

    expect(reason).toBe(`${NEVER_RUN} ${NO_POSTS_IN_JULY}`);
    expect(reason).toContain(NEVER_RUN);
    expect(reason).not.toBe(
      "Your Google Business Profile is connected, but no posts were published to it during this period.",
    );
  });

  it("says the lookup is missing when only the posting history is in flight", () => {
    const reason = dropReason(
      collect({ connected: true, pendingReads: reads({ gbpPosts: true }) }),
    );

    // Finding 8: the in-flight sentence must name the read that is actually in
    // flight, and must not swallow the never-run reason the lookup did return.
    expect(reason).toBe(`${NEVER_RUN} ${POSTS_LOADING}`);
    expect(reason).not.toContain(LOOKUP_LOADING);
    expect(reason).not.toContain(NO_POSTS_IN_JULY);
  });

  it("names the lookup when the lookup itself is the read in flight", () => {
    const reason = dropReason(
      collect({ pendingReads: reads({ localBusiness: true }) }),
    );

    expect(reason).toBe(LOOKUP_LOADING);
    expect(reason).not.toContain(NEVER_RUN);
  });
});

// Finding 1: the posts read settles after the listing read, so the chapter was
// admitted on the listing and then printed "no posts" for a query that had not
// returned. Findings 4 and 5 live here too: a connection failure must not
// suppress posts we did read, and no sentence may claim a publication date.
describe("postsView", () => {
  it("says the posting history is still loading rather than claiming none", () => {
    const view = postsView(
      data({
        profile: profile(),
        connected: true,
        pendingReads: reads({ gbpPosts: true }),
      }),
    );

    expect(view).toEqual({ kind: "note", text: POSTS_LOADING });
    expect(JSON.stringify(view)).not.toContain(RETIRED_NO_POSTS);
    expect(JSON.stringify(view)).not.toContain(NO_POSTS_IN_JULY);
  });

  it("says the posting history failed rather than claiming none", () => {
    const view = postsView(
      data({ connected: true, readFailures: reads({ gbpPosts: true }) }),
    );

    expect(view).toEqual({ kind: "note", text: POSTS_FAILED });
  });

  it("still shows posts it read when only the connection read failed", () => {
    const view = postsView(
      data({
        profile: profile(),
        posts: [post({ id: "a" }), post({ id: "b" })],
        readFailures: reads({ gbpConnection: true }),
      }),
    );

    expect(view.kind).toBe("table");
    expect(
      view.kind === "table" ? view.posts.map((entry) => entry.id) : [],
    ).toEqual(["a", "b"]);
  });

  it("names the month from the cover instead of an unstated 'this period'", () => {
    const view = postsView(data({ connected: true }));

    expect(view).toEqual({ kind: "note", text: NO_POSTS_IN_JULY });
    expect(NO_POSTS_IN_JULY).not.toBe(RETIRED_NO_POSTS);
    expect(NO_POSTS_IN_JULY).toContain("scheduled for July 2026");
  });

  it("says nothing at all when posting was never set up", () => {
    expect(postsView(data({ profile: profile() }))).toEqual({ kind: "hidden" });
  });
});

// Finding 2: the cache holds whichever business was last typed into the Local
// SEO tab's free-text box, so an unchecked snapshot can print a competitor's
// rating, review count and photo tiles under the title "Your ... Profile".
describe("listingView", () => {
  it("withholds a listing whose website is not this project's domain", () => {
    const rival = profile({
      title: "Bright Smile Dental",
      url: "https://brightsmile.example",
    });
    const view = listingView(data({ profile: rival }));

    expect(view.kind).toBe("other");
    expect(view.kind === "other" ? view.text : "").toBe(
      "The Google Business Profile lookup on file is for Bright Smile Dental, whose listed website is brightsmile.example — not this project's domain (example.com). This report could not confirm that listing belongs to this project, so the listing was left out rather than presented as yours.",
    );
  });

  it("drops the chapter with that reason when the rival listing is all there is", () => {
    const reason = dropReason(
      collect({ profile: profile({ url: "https://brightsmile.example" }) }),
    );

    expect(reason).toContain("not this project's domain (example.com)");
    expect(reason).not.toContain(NEVER_RUN);
  });

  it("keeps the client's own posts when the listing is withheld", () => {
    const result = collect({
      connected: true,
      posts: [post()],
      profile: profile({ url: "https://brightsmile.example" }),
    });

    expect(result.pages).toHaveLength(1);
    expect(result.omissions).toEqual([]);
  });

  it("calls the profile the client's only when the hosts match", () => {
    const matched = listingView(data({ profile: profile() }));
    const unverifiable = listingView(
      data({ profile: profile(), domain: null }),
    );

    // The date is formatted with the printer's own locale, so this pins the
    // possessive claim and the named listing rather than the date's spelling.
    expect(matched.kind === "listing" ? matched.provenance : "").toMatch(
      /^Read from your Google Business Profile for Nguyen Dental on .+\.$/,
    );
    const hedged =
      unverifiable.kind === "listing" ? unverifiable.provenance : "";
    expect(hedged).toContain(
      "Read from the Google Business Profile listing for Nguyen Dental",
    );
    expect(hedged).toContain(
      "Nothing on file ties that listing to this project's domain",
    );
    expect(hedged).not.toContain("your Google Business Profile");
  });

  it("compares hosts ignoring www and scheme", () => {
    expect(
      describeOtherListing(
        profile({ url: "http://www.example.com/book" }),
        "example.com",
      ),
    ).toBeNull();
    expect(
      describeOtherListing(profile({ url: null }), "example.com"),
    ).toBeNull();
    expect(describeOtherListing(profile(), null)).toBeNull();
  });

  // Finding 3: a failed ["projects"] read left the audit with no domain, which
  // printed as a "Not visible" website row with no stated cause.
  it("names the failed project read next to the listing", () => {
    const view = listingView(
      data({
        profile: profile(),
        domain: null,
        readFailures: reads({ projects: true }),
      }),
    );

    expect(view.kind === "listing" ? view.domainNote : null).toBe(
      PROJECT_FAILED,
    );
  });

  it("names an in-flight project read next to the listing", () => {
    const view = listingView(
      data({
        profile: profile(),
        domain: null,
        pendingReads: reads({ projects: true }),
      }),
    );

    expect(view.kind === "listing" ? view.domainNote : null).toBe(
      "This project's own record was still loading when this report was generated.",
    );
  });

  it("says nothing about the project read when it succeeded", () => {
    const view = listingView(data({ profile: profile() }));

    expect(view.kind === "listing" ? view.domainNote : "unset").toBeNull();
  });
});

// Finding 7: `[logo, mainImage].filter(Boolean).length` turned "the source did
// not return this field" into "the business has not set it", one line above a
// checks table saying the same field is unreadable.
describe("photoCount", () => {
  it("reports nothing when either photo field was not returned", () => {
    expect(photoCount(profile({ logo: null }))).toBe("—");
    expect(photoCount(profile({ mainImage: null }))).toBe("—");
    expect(photoCount(profile({ logo: null, mainImage: null }))).toBe("—");
  });

  it("counts only fields the source actually returned", () => {
    expect(photoCount(profile())).toBe("2/2");
    expect(photoCount(profile({ mainImage: "" }))).toBe("1/2");
    expect(photoCount(profile({ logo: "", mainImage: "" }))).toBe("0/2");
  });
});
