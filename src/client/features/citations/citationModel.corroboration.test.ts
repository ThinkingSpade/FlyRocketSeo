import { describe, expect, it } from "vitest";
import {
  DIRECTORIES,
  type DirectoryEntry,
} from "@/shared/citations/directories";
import { buildCitationReport } from "./citationModel";

// Split into its own FILE (not just its own describe block, which is how
// this used to stay under budget) purely to stay under this repo's
// max-lines file budget once final wave item 4 added two more tests --
// these are still exercising buildCitationReport, just the
// confirmed-vs-unconfirmed corroboration behavior specifically (finding A1
// and its predecessor findings 10/11/12) rather than the coverage-tone
// arithmetic covered in citationModel.test.ts.
function requireDirectory(id: string): DirectoryEntry {
  const directory = DIRECTORIES.find((entry) => entry.id === id);
  if (!directory) throw new Error(`test fixture: unknown directory id "${id}"`);
  return directory;
}

const YELP = requireDirectory("yelp");

// Phone + city both present -- a query specific enough to trust a small
// result count (see MIN_RESULTS_DISAMBIGUATED in citationModel.ts).
const disambiguatedBusiness = {
  name: "Joe's Pizza",
  phone: "+1 718-555-0100",
  city: "Brooklyn",
};

const UNRELATED_RESULTS = [
  { domain: "example.com", url: "https://example.com/a", title: "A" },
  { domain: "another.com", url: "https://another.com/b", title: "B" },
  { domain: "third.com", url: "https://third.com/c", title: "C" },
  { domain: "fourth.com", url: "https://fourth.com/d", title: "D" },
];

describe("buildCitationReport confirmed vs unconfirmed corroboration (findings 10, 11, 12, A1, final wave item 4)", () => {
  it("does not confirm a directory's own search page as the business's listing, and does not count it as coverage (finding 10 / A1)", () => {
    // The exact failing input from finding A1 (originally reported fixed as
    // finding 10, but the coverage count regressed): a Yelp search results
    // page, not a listing -- the title names no business, and the URL is a
    // /search path. Before the A1 fix this still landed in report.found,
    // rendered "Found in search (1)", and counted toward "N of 19".
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

    // Not counted as a found (confirmed) citation...
    expect(
      report.found.find((match) => match.directory.id === "yelp"),
    ).toBeUndefined();
    expect(report.found).toEqual([]);
    // ...but reported in the separate unconfirmed group, not silently dropped.
    expect(report.unconfirmed).toEqual([
      {
        directory: YELP,
        url: "https://yelp.com/search?find_desc=pizza",
        confirmed: false,
      },
    ]);
    // The verdict counts confirmed matches only: 0 of 19, not 1 of 19.
    expect(report.verdict.tone).toBe("bad");
    expect(report.verdict.read).toContain(
      `didn't show up in search as a confirmed listing for any of the ${DIRECTORIES.length} directories`,
    );
    expect(report.verdict.read).toContain(
      "1 more directory appeared in search too, but couldn't be confirmed as this business's own listing",
    );
  });

  it("does not treat a directory's own blog/editorial post as a listing, even with a listing-length path (finding A1)", () => {
    // A "View listing"-worthy URL used to mean "any final path segment not
    // on a small search/category blacklist" -- which let non-listing
    // editorial content (a blog post) through as though it were the
    // business's own page, just because "top-pizza" isn't "search".
    const report = buildCitationReport({
      business: disambiguatedBusiness,
      results: [
        {
          domain: "yelp.com",
          url: "https://yelp.com/blog/top-pizza",
          title: "Top Pizza Restaurants",
        },
        ...UNRELATED_RESULTS,
      ],
    });

    expect(report.found).toEqual([]);
    const yelpMatch = report.unconfirmed.find(
      (match) => match.directory.id === "yelp",
    );
    expect(yelpMatch).toMatchObject({ confirmed: false });
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

  it("does not confirm a search page even when its title happens to contain the business name (final wave item 4)", () => {
    // THE LEAKED BUG: nameAppearsInTitle() confirmed a match BEFORE the
    // URL's own shape was ever considered, so a /search results page whose
    // title happened to name the business (a common pattern -- many sites
    // title search pages "<query> - Search results") was "confirmed" --
    // exactly the scenario that let 19 /search pages register as 19
    // confirmed listings and produce "a strong footprint among the majors".
    const results = DIRECTORIES.map((directory) => ({
      domain: directory.domain,
      url: `https://${directory.domain}/search?find_desc=pizza`,
      title: "Joe's Pizza - Search Results",
    }));

    const report = buildCitationReport({
      business: disambiguatedBusiness,
      results,
    });

    expect(report.found).toEqual([]);
    expect(report.unconfirmed).toHaveLength(DIRECTORIES.length);
    expect(report.verdict.tone).not.toBe("good");
    expect(report.verdict.read).not.toContain("strong footprint");
    expect(report.verdict.read).not.toContain(
      "showed up in search as a confirmed listing for all",
    );
  });

  it("does not confirm an unlisted generic editorial path just because it's absent from the blacklist (final wave item 4)", () => {
    // "Listing-shaped" used to mean "not on a small, finite blacklist of
    // known-bad segments" -- so a generic guide page ("/guides/...", not on
    // the enumerated bad-word list) passed as though it were an individual
    // listing. A blacklist can never enumerate every non-listing path a
    // directory might publish; requiring POSITIVE evidence (the business's
    // own name somewhere in the title or the URL) closes that gap instead
    // of playing whack-a-mole with more blacklist entries.
    const report = buildCitationReport({
      business: disambiguatedBusiness,
      results: [
        {
          domain: "yelp.com",
          url: "https://yelp.com/guides/top-pizza",
          title: "Top Pizza Restaurants",
        },
        ...UNRELATED_RESULTS,
      ],
    });

    expect(report.found).toEqual([]);
    const yelpMatch = report.unconfirmed.find(
      (match) => match.directory.id === "yelp",
    );
    expect(yelpMatch).toMatchObject({ confirmed: false });
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
      `Joe's Pizza in Brooklyn didn't show up in search as a confirmed listing for any of the ${DIRECTORIES.length} directories on this list -- that's not evidence the listings don't exist, only that none were confirmed in this search. A listing may well exist already; worth checking by hand before creating anything new.`,
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
