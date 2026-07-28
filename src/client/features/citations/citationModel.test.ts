import { describe, expect, it } from "vitest";
import {
  DIRECTORIES,
  type DirectoryEntry,
} from "@/shared/citations/directories";
import { buildCitationReport } from "./citationModel";

function requireDirectory(id: string): DirectoryEntry {
  const directory = DIRECTORIES.find((entry) => entry.id === id);
  if (!directory) throw new Error(`test fixture: unknown directory id "${id}"`);
  return directory;
}

const YELP = requireDirectory("yelp");
const FACEBOOK = requireDirectory("facebook");

// Phone + city both present -- a query specific enough to trust a small
// result count (see MIN_RESULTS_DISAMBIGUATED in citationModel.ts).
const disambiguatedBusiness = {
  name: "Joe's Pizza",
  phone: "+1 718-555-0100",
  city: "Brooklyn",
};

// Neither disambiguator known -- the service would have had to search on the
// bare name alone, which needs a larger result count before "not found"
// means anything (see MIN_RESULTS_NAME_ONLY).
const nameOnlyBusiness = {
  name: "Joe's Pizza",
  phone: null,
  city: null,
};

const UNRELATED_RESULTS = [
  { domain: "example.com", url: "https://example.com/a", title: "A" },
  { domain: "another.com", url: "https://another.com/b", title: "B" },
  { domain: "third.com", url: "https://third.com/c", title: "C" },
  { domain: "fourth.com", url: "https://fourth.com/d", title: "D" },
];

describe("buildCitationReport", () => {
  it("says so when there are no search results, not '0 citations found'", () => {
    const report = buildCitationReport({
      business: nameOnlyBusiness,
      results: [],
    });

    expect(report.verdict.tone).toBe("unknown");
    expect(report.found).toEqual([]);
    expect(report.missing).toEqual([]);
    expect(report.verdict.read).toBe(
      "Only 0 organic results came back for Joe's Pizza -- too few to judge citation coverage one way or the other.",
    );
    expect(report.verdict.actions).toEqual([]);
  });

  it("matches an exact domain with no subdomain or prefix", () => {
    const report = buildCitationReport({
      business: disambiguatedBusiness,
      results: [
        {
          domain: "facebook.com",
          url: "https://facebook.com/joespizzabk",
          title: "Joe's Pizza",
        },
        ...UNRELATED_RESULTS,
      ],
    });

    expect(report.found).toEqual([
      {
        directory: FACEBOOK,
        url: "https://facebook.com/joespizzabk",
        confirmed: true,
      },
    ]);
  });

  it("matches a 'www.' prefix against the bare canonical domain", () => {
    const report = buildCitationReport({
      business: disambiguatedBusiness,
      results: [
        {
          domain: "www.yelp.com",
          url: "https://www.yelp.com/biz/joes-pizza-brooklyn",
          title: "Joe's Pizza - Yelp",
        },
        ...UNRELATED_RESULTS,
      ],
    });

    expect(report.found).toEqual([
      {
        directory: YELP,
        url: "https://www.yelp.com/biz/joes-pizza-brooklyn",
        confirmed: true,
      },
    ]);
  });

  it("matches a subdomain of the canonical domain", () => {
    const report = buildCitationReport({
      business: disambiguatedBusiness,
      results: [
        {
          domain: "business.yelp.com",
          url: "https://business.yelp.com/joes-pizza",
          title: "Joe's Pizza",
        },
        ...UNRELATED_RESULTS,
      ],
    });

    expect(report.found).toEqual([
      {
        directory: YELP,
        url: "https://business.yelp.com/joes-pizza",
        confirmed: true,
      },
    ]);
  });

  it("matches a confident country-variant domain (Yelp UK)", () => {
    const report = buildCitationReport({
      business: disambiguatedBusiness,
      results: [
        {
          domain: "www.yelp.co.uk",
          url: "https://www.yelp.co.uk/biz/joes-pizza-london",
          title: "Joe's Pizza",
        },
        ...UNRELATED_RESULTS,
      ],
    });

    expect(report.found).toEqual([
      {
        directory: YELP,
        url: "https://www.yelp.co.uk/biz/joes-pizza-london",
        confirmed: true,
      },
    ]);
  });

  it("ignores a result whose domain is not a known directory", () => {
    const report = buildCitationReport({
      business: disambiguatedBusiness,
      results: UNRELATED_RESULTS,
    });

    expect(report.found).toEqual([]);
  });

  it("reports a found directory together with the URL it appeared at", () => {
    const report = buildCitationReport({
      business: disambiguatedBusiness,
      results: [
        {
          domain: "yelp.com",
          url: "https://www.yelp.com/biz/joes-pizza-brooklyn-2",
          title: "Joe's Pizza",
        },
        ...UNRELATED_RESULTS,
      ],
    });

    const yelpMatch = report.found.find(
      (match) => match.directory.id === "yelp",
    );
    expect(yelpMatch).toEqual({
      directory: YELP,
      url: "https://www.yelp.com/biz/joes-pizza-brooklyn-2",
      confirmed: true,
    });
  });

  it("calls coverage good when every known directory turns up in search", () => {
    const results = DIRECTORIES.map((directory) => ({
      domain: directory.domain,
      url: `https://${directory.domain}/joes-pizza`,
      title: "Joe's Pizza",
    }));

    const report = buildCitationReport({
      business: disambiguatedBusiness,
      results,
    });

    expect(report.verdict.tone).toBe("good");
    expect(report.missing).toEqual([]);
    expect(report.found).toHaveLength(DIRECTORIES.length);
    expect(report.verdict.read).toBe(
      `Joe's Pizza in Brooklyn showed up in search for all ${DIRECTORIES.length} directories on this list. A strong footprint among the majors -- though this list isn't every citation that could exist.`,
    );
    expect(report.verdict.actions).toEqual([]);
  });

  it("calls coverage bad when a properly sized search finds none of the known directories", () => {
    const report = buildCitationReport({
      business: disambiguatedBusiness,
      results: UNRELATED_RESULTS,
    });

    expect(report.verdict.tone).toBe("bad");
    expect(report.found).toEqual([]);
    expect(report.missing).toHaveLength(DIRECTORIES.length);
    expect(report.verdict.read).toBe(
      `Joe's Pizza in Brooklyn didn't show up in search for any of the ${DIRECTORIES.length} directories on this list -- that's not evidence the listings don't exist, only that none surfaced in this search. A listing may well exist already; worth checking by hand before creating anything new.`,
    );
    expect(report.verdict.actions).toEqual([
      {
        label: "Check by hand before creating any new listing",
        evidence: `${DIRECTORIES.length} of ${DIRECTORIES.length} directories didn't surface in this search -- not proof they're missing`,
        weight: 80,
      },
    ]);
  });

  it("calls coverage mixed when some but not all known directories turn up", () => {
    const results = [
      {
        domain: "yelp.com",
        url: "https://yelp.com/biz/joes-pizza",
        title: "Joe's Pizza",
      },
      {
        domain: "facebook.com",
        url: "https://facebook.com/joespizzabk",
        title: "Joe's Pizza",
      },
      ...UNRELATED_RESULTS,
    ];

    const report = buildCitationReport({
      business: disambiguatedBusiness,
      results,
    });

    expect(report.verdict.tone).toBe("mixed");
    expect(report.found).toHaveLength(2);
    expect(report.missing).toHaveLength(DIRECTORIES.length - 2);
    expect(report.verdict.read).toBe(
      `Joe's Pizza in Brooklyn showed up in search for 2 of ${DIRECTORIES.length} directories on this list. The other ${DIRECTORIES.length - 2} didn't surface in this search -- worth checking manually, since a listing may well exist that just didn't come up here.`,
    );
  });

  it("treats a name-only search as thin below the higher no-disambiguator threshold", () => {
    // 4 results would already clear the disambiguated threshold (3), but not
    // the bare-name one (6) -- a common name with no phone or city returns
    // too much incidental noise to trust a "not found" reading yet.
    const report = buildCitationReport({
      business: nameOnlyBusiness,
      results: UNRELATED_RESULTS,
    });

    expect(report.verdict.tone).toBe("unknown");
    expect(report.missing).toEqual([]);
    expect(report.verdict.read).toBe(
      "Only 4 organic results came back for Joe's Pizza -- too few to judge citation coverage one way or the other.",
    );
  });

  it("trusts the same result count once a city disambiguates the search", () => {
    const report = buildCitationReport({
      business: disambiguatedBusiness,
      results: UNRELATED_RESULTS,
    });

    expect(report.verdict.tone).toBe("bad");
  });

  it("does not confirm a directory's own search page as the business's listing (finding 10)", () => {
    // The exact failing input from finding 10: a Yelp search results page,
    // not a listing -- the title names no business, and the URL is a
    // /search path.
    const report = buildCitationReport({
      business: disambiguatedBusiness,
      results: [
        {
          domain: "yelp.com",
          url: "https://yelp.com/search?find_desc=pizza",
          title: "Top Pizza Restaurants",
        },
        ...UNRELATED_RESULTS,
      ],
    });

    const yelpMatch = report.found.find(
      (match) => match.directory.id === "yelp",
    );
    expect(yelpMatch).toEqual({
      directory: YELP,
      url: "https://yelp.com/search?find_desc=pizza",
      confirmed: false,
    });
  });

  it("confirms a match via a listing-shaped URL alone, without the name in the title (finding 10)", () => {
    const report = buildCitationReport({
      business: disambiguatedBusiness,
      results: [
        {
          domain: "yelp.com",
          url: "https://yelp.com/biz/joes-pizza-brooklyn",
          title: "Best slice in the neighborhood",
        },
        ...UNRELATED_RESULTS,
      ],
    });

    const yelpMatch = report.found.find(
      (match) => match.directory.id === "yelp",
    );
    expect(yelpMatch).toMatchObject({ confirmed: true });
  });

  it("falls back to parsing the host from the URL when domain is null (finding 12)", () => {
    // The exact failing input from finding 12.
    const report = buildCitationReport({
      business: disambiguatedBusiness,
      results: [
        {
          domain: null,
          url: "https://www.yelp.com/biz/joes-pizza",
          title: "Joe's Pizza",
        },
        ...UNRELATED_RESULTS,
      ],
    });

    const yelpMatch = report.found.find(
      (match) => match.directory.id === "yelp",
    );
    expect(yelpMatch).toEqual({
      directory: YELP,
      url: "https://www.yelp.com/biz/joes-pizza",
      confirmed: true,
    });
  });

  it("never advises creating a listing based on one search's absence (finding 11)", () => {
    // The exact failing input from finding 11: a business that already has a
    // Yelp listing, which simply didn't surface among 3 (disambiguated,
    // thin-data-threshold-clearing) unrelated results.
    const report = buildCitationReport({
      business: disambiguatedBusiness,
      results: UNRELATED_RESULTS.slice(0, 3),
    });

    expect(report.verdict.tone).toBe("bad");
    expect(report.verdict.read).toBe(
      `Joe's Pizza in Brooklyn didn't show up in search for any of the ${DIRECTORIES.length} directories on this list -- that's not evidence the listings don't exist, only that none surfaced in this search. A listing may well exist already; worth checking by hand before creating anything new.`,
    );
    // Not a substring check: "Create" must not appear anywhere, in any casing.
    expect(report.verdict.read.toLowerCase()).not.toContain("create");
    expect(report.verdict.actions).toEqual([
      {
        label: "Check by hand before creating any new listing",
        evidence: `${DIRECTORIES.length} of ${DIRECTORIES.length} directories didn't surface in this search -- not proof they're missing`,
        weight: 80,
      },
    ]);
    expect(
      report.verdict.actions.every(
        (action) => !/create (a |any )?listing/i.test(action.label),
      ),
    ).toBe(true);
  });
});
