import { describe, expect, it } from "vitest";
import {
  EMPTY_ANCHORS_FILTERS,
  EMPTY_BACKLINKS_FILTERS,
  EMPTY_REFERRING_DOMAINS_FILTERS,
  EMPTY_TOP_PAGES_FILTERS,
  toBacklinksFiltersPayload,
  toReferringDomainsFiltersPayload,
} from "./backlinksFilterTypes";
import type { BacklinksSearchState } from "./backlinksPageTypes";
import {
  buildBacklinksAuthorizationKey,
  selectActiveBacklinksFilters,
} from "./backlinksAuthorizationKey";

const SEARCH: BacklinksSearchState = {
  target: "example.com",
  scope: "domain",
  tab: "backlinks",
  page: 1,
  pageSize: 50,
};

/** The key builder reads only the applied values, so that is all this supplies. */
function filtersState(
  overrides: Partial<{
    backlinks: typeof EMPTY_BACKLINKS_FILTERS;
    domains: typeof EMPTY_REFERRING_DOMAINS_FILTERS;
    pages: typeof EMPTY_TOP_PAGES_FILTERS;
    anchors: typeof EMPTY_ANCHORS_FILTERS;
  }> = {},
) {
  return {
    backlinks: { values: overrides.backlinks ?? EMPTY_BACKLINKS_FILTERS },
    domains: { values: overrides.domains ?? EMPTY_REFERRING_DOMAINS_FILTERS },
    pages: { values: overrides.pages ?? EMPTY_TOP_PAGES_FILTERS },
    anchors: { values: overrides.anchors ?? EMPTY_ANCHORS_FILTERS },
  };
}

describe("backlinks authorization key", () => {
  it("changes when the active tab's filters change", () => {
    const unfiltered = buildBacklinksAuthorizationKey(
      "proj",
      SEARCH,
      selectActiveBacklinksFilters("backlinks", filtersState()),
    );
    const filtered = buildBacklinksAuthorizationKey(
      "proj",
      SEARCH,
      selectActiveBacklinksFilters(
        "backlinks",
        filtersState({
          backlinks: { ...EMPTY_BACKLINKS_FILTERS, include: "pricing" },
        }),
      ),
    );
    // This inequality is the whole reason Apply has to re-authorize: a filtered
    // DataForSEO call is a different billed request, so the unfiltered
    // authorization must not cover it.
    expect(filtered).not.toBe(unfiltered);
  });

  it("ignores filters belonging to other tabs", () => {
    const base = buildBacklinksAuthorizationKey(
      "proj",
      SEARCH,
      selectActiveBacklinksFilters("backlinks", filtersState()),
    );
    const otherTabFiltered = buildBacklinksAuthorizationKey(
      "proj",
      SEARCH,
      selectActiveBacklinksFilters(
        "backlinks",
        filtersState({
          anchors: { ...EMPTY_ANCHORS_FILTERS, include: "brand" },
        }),
      ),
    );
    expect(otherTabFiltered).toBe(base);
  });

  it("selects each tab's own payload", () => {
    const state = filtersState({
      backlinks: { ...EMPTY_BACKLINKS_FILTERS, include: "from-backlinks-tab" },
      domains: {
        ...EMPTY_REFERRING_DOMAINS_FILTERS,
        include: "from-domains-tab",
      },
    });
    expect(selectActiveBacklinksFilters("backlinks", state)).toEqual(
      toBacklinksFiltersPayload({
        ...EMPTY_BACKLINKS_FILTERS,
        include: "from-backlinks-tab",
      }),
    );
    expect(selectActiveBacklinksFilters("domains", state)).toEqual(
      toReferringDomainsFiltersPayload({
        ...EMPTY_REFERRING_DOMAINS_FILTERS,
        include: "from-domains-tab",
      }),
    );
  });

  /**
   * The invariant the Apply fix rests on.
   *
   * Apply authorizes using the payload it was just handed, because the hook's
   * state is still one render behind. That only works if the key built that way
   * is byte-identical to the key the page computes on the next render, once the
   * state has settled. If someone adds a field to the key and forgets the Apply
   * path, this fails instead of silently de-authorizing the run again.
   */
  it("builds the same key from a handed-in payload as from settled state", () => {
    const applied = { ...EMPTY_BACKLINKS_FILTERS, minDomainRank: "40" };

    const authorizedAtApplyTime = buildBacklinksAuthorizationKey(
      "proj",
      { ...SEARCH, tab: "backlinks", page: 1 },
      toBacklinksFiltersPayload(applied),
    );
    const currentAfterStateSettles = buildBacklinksAuthorizationKey(
      "proj",
      { ...SEARCH, tab: "backlinks", page: 1 },
      selectActiveBacklinksFilters(
        "backlinks",
        filtersState({ backlinks: applied }),
      ),
    );

    expect(authorizedAtApplyTime).toBe(currentAfterStateSettles);
  });

  /**
   * Documents a REAL remaining defect rather than asserting desired behaviour.
   *
   * `page` is part of the authorization key, and no paging handler
   * re-authorizes, so clicking through to page 2 leaves the run unauthorized and
   * its metered queries disabled. Same for pageSize, sort, order, view and tab.
   *
   * This is deliberately not "fixed" by authorizing on paging: every authorize
   * bumps `runNonce`, which is part of the query key, so doing that would make
   * navigating back to page 1 re-fetch — and re-pay for — a page already
   * fetched. The fix is to decide what a single consent actually covers, which
   * is a pricing decision, not a refactor.
   */
  it("still treats a page change as a different authorization (known defect)", () => {
    const pageOne = buildBacklinksAuthorizationKey(
      "proj",
      { ...SEARCH, page: 1 },
      selectActiveBacklinksFilters("backlinks", filtersState()),
    );
    const pageTwo = buildBacklinksAuthorizationKey(
      "proj",
      { ...SEARCH, page: 2 },
      selectActiveBacklinksFilters("backlinks", filtersState()),
    );
    expect(pageTwo).not.toBe(pageOne);
  });
});
