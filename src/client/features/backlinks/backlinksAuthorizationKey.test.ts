import { describe, expect, it } from "vitest";
import type { BacklinksSearchState } from "./backlinksPageTypes";
import { buildBacklinksAuthorizationKey } from "./backlinksAuthorizationKey";

const SEARCH: BacklinksSearchState = {
  target: "example.com",
  scope: "domain",
  tab: "backlinks",
  page: 1,
  pageSize: 50,
};

/**
 * Builds a variant through a typed value rather than an object literal.
 *
 * Deliberate: the key builder takes `Pick<BacklinksSearchState, "target" |
 * "scope">`, so passing a literal with `page` in it is a COMPILE error — the
 * type already forbids keying on a slice. These tests guard the runtime value
 * behind that, for the day someone widens the parameter.
 */
function withSlice(
  overrides: Partial<BacklinksSearchState>,
): BacklinksSearchState {
  return { ...SEARCH, ...overrides };
}

/**
 * The key is the RUN, not the slice.
 *
 * Each of these used to produce a different key, and `useAuthorizedRun` is
 * strict equality — so every one of them de-authorized the run mid-session and
 * blanked a table the user had already paid for. Listed individually rather
 * than looped, so a failure names the control that broke.
 */
describe("a slice change keeps the run authorized", () => {
  const base = buildBacklinksAuthorizationKey("proj", SEARCH);

  it("paging", () => {
    expect(buildBacklinksAuthorizationKey("proj", withSlice({ page: 2 }))).toBe(
      base,
    );
  });

  it("page size", () => {
    expect(
      buildBacklinksAuthorizationKey("proj", withSlice({ pageSize: 100 })),
    ).toBe(base);
  });

  it("sorting", () => {
    expect(
      buildBacklinksAuthorizationKey(
        "proj",
        withSlice({
          sort: "domain_rank",
          order: "asc",
        }),
      ),
    ).toBe(base);
  });

  it("switching result tab", () => {
    expect(
      buildBacklinksAuthorizationKey("proj", withSlice({ tab: "anchors" })),
    ).toBe(base);
  });

  it("switching view", () => {
    expect(
      buildBacklinksAuthorizationKey("proj", withSlice({ view: "all" })),
    ).toBe(base);
  });
});

/**
 * The other half of the contract, and why this is not simply "authorize
 * everything": a different target is a different purchase, so it has to fall
 * back to unauthorized and wait for a click.
 */
describe("a different run needs its own authorization", () => {
  const base = buildBacklinksAuthorizationKey("proj", SEARCH);

  it("a different target", () => {
    expect(
      buildBacklinksAuthorizationKey(
        "proj",
        withSlice({
          target: "other.com",
        }),
      ),
    ).not.toBe(base);
  });

  it("a different scope for the same target", () => {
    expect(
      buildBacklinksAuthorizationKey("proj", withSlice({ scope: "page" })),
    ).not.toBe(base);
  });

  it("a different project", () => {
    expect(buildBacklinksAuthorizationKey("other-proj", SEARCH)).not.toBe(base);
  });
});

describe("key shape", () => {
  // The key is compared with `===`, so anything unstable in it de-authorizes on
  // a re-render with no visible cause.
  it("is stable across identical inputs", () => {
    expect(buildBacklinksAuthorizationKey("proj", withSlice({}))).toBe(
      buildBacklinksAuthorizationKey("proj", withSlice({})),
    );
  });

  it("reads only target and scope from the search state", () => {
    expect(
      buildBacklinksAuthorizationKey("proj", {
        target: "example.com",
        scope: "domain",
      }),
    ).toBe(buildBacklinksAuthorizationKey("proj", SEARCH));
  });
});
