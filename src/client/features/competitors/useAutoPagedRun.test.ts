import { describe, expect, it } from "vitest";
import {
  INITIAL_AUTHORIZED_RUN_STATE,
  authorizeRunState,
  isRunAuthorized,
} from "@/client/lib/useMeteredQuery";
import type {
  CompetitorsTab,
  KeywordGapMode,
} from "@/types/schemas/competitors";
import { buildCompetitorsAuthorizationKey } from "./competitorsAuthorization";
import {
  NO_AUTHORIZED_RUN,
  shouldReauthorizePagedRun,
  trackAuthorizedRun,
  type AuthorizedRunSnapshot,
} from "./useAutoPagedRun";

const PROJECT = "project-1";

type SearchState = {
  target: string;
  competitor: string;
  tab: CompetitorsTab;
  mode: KeywordGapMode;
  page: number;
};

const EMPTY_SEARCH: SearchState = {
  target: "",
  competitor: "",
  tab: "competitors",
  mode: "missing",
  page: 1,
};

/**
 * A stand-in for one mounted `CompetitorsPage`, advanced a COMMIT at a time:
 * the URL, the real authorized-run state, and this hook's own snapshot.
 *
 * This project's vitest runs in a `node` environment and cannot render hooks
 * (see `buildMeteredQueryOptions`, split out for the same reason), so the hook
 * is exercised through its two pure halves plus the genuine authorization
 * primitives -- `authorizeRunState`/`isRunAuthorized` and the page's own key
 * builder -- rather than against a restated model of them.
 *
 * `identity` and `position` mirror what `CompetitorsPage` passes in.
 */
function mountCompetitorsPage(initial: SearchState = EMPTY_SEARCH) {
  let url = initial;
  let run = INITIAL_AUTHORIZED_RUN_STATE;
  let snapshot: AuthorizedRunSnapshot = NO_AUTHORIZED_RUN;
  let autoRuns = 0;

  const keyFor = (search: SearchState) =>
    buildCompetitorsAuthorizationKey(PROJECT, search);
  const currentState = () => ({
    identity: `${PROJECT}|${url.target.trim()}|${url.competitor.trim()}|${url.tab}`,
    authorized: isRunAuthorized(run, keyFor(url)),
    position: `${url.page}|${url.mode}`,
  });

  /** One render plus its effect, repeated while the effect re-authorizes (a
   *  state change, so React would render again). */
  const commit = () => {
    for (let pass = 0; pass < 5; pass += 1) {
      const state = currentState();
      snapshot = trackAuthorizedRun(snapshot, state);
      if (!shouldReauthorizePagedRun(snapshot, state)) return;
      autoRuns += 1;
      // `authorize()` -- no override, so it re-keys to the CURRENT key.
      run = authorizeRunState(run, keyFor(url));
    }
    throw new Error("the auto-run never settled");
  };

  commit();

  return {
    /**
     * A user-initiated run: both of the page's handlers authorize the key the
     * URL is ABOUT to have and only then navigate, and the router writes match
     * stores after an `await` inside `startTransition` -- so there is a commit
     * where the authorization has landed and the URL has not.
     */
    analyze(next: Partial<SearchState>) {
      run = authorizeRunState(run, keyFor({ ...url, ...next }));
      commit();
      url = { ...url, ...next };
      commit();
    },
    /** A URL change with no authorize of its own: paging, the gap-mode
     *  toggle, a link into this tab. */
    navigate(next: Partial<SearchState>) {
      url = { ...url, ...next };
      commit();
    },
    get authorized() {
      return isRunAuthorized(run, keyFor(url));
    },
    get autoRuns() {
      return autoRuns;
    },
    get runNonce() {
      return run.runNonce;
    },
    get url() {
      return url;
    },
  };
}

describe("useAutoPagedRun", () => {
  it("keeps the first Analyze on a new domain, which the auto-run used to clobber", () => {
    const page = mountCompetitorsPage();
    page.analyze({ target: "alpha.com", page: 1 });
    expect(page.authorized).toBe(true);

    // Regression: in the commit between this authorize and the URL landing,
    // `authorized` is already false (the authorized key is the future one)
    // while `identity` still reads alpha.com -- which used to be the whole
    // fire condition. The auto-run then re-keyed to the STALE current key,
    // overwriting what the user had just authorized, and once the URL landed
    // the identity guard blocked any recovery: the table sat on "Press
    // Analyze to discover organic competitors" until a second press.
    page.analyze({ target: "beta.com", page: 1 });

    expect(page.url.target).toBe("beta.com");
    expect(page.authorized).toBe(true);
    expect(page.autoRuns).toBe(0);
  });

  it("keeps the Compare-competitor authorize, which lands on the Keyword Gap tab", () => {
    const page = mountCompetitorsPage();
    page.analyze({ target: "alpha.com", page: 1 });
    page.navigate({ page: 3 });
    expect(page.autoRuns).toBe(1);

    // The row action authorizes gap/page 1 while the URL still says
    // competitors/page 3 -- identity and position both unchanged in that gap.
    page.analyze({
      competitor: "rival.com",
      tab: "gap",
      mode: "missing",
      page: 1,
    });

    expect(page.url.tab).toBe("gap");
    expect(page.authorized).toBe(true);
    expect(page.autoRuns).toBe(1);
  });

  it("still re-authorizes a page turn without a second click", () => {
    const page = mountCompetitorsPage();
    page.analyze({ target: "alpha.com", page: 1 });
    const nonceAfterAnalyze = page.runNonce;

    page.navigate({ page: 2 });

    expect(page.authorized).toBe(true);
    expect(page.autoRuns).toBe(1);
    // A fresh nonce, so the paid query refetches rather than re-reading the
    // previous page's cache entry.
    expect(page.runNonce).toBeGreaterThan(nonceAfterAnalyze);
  });

  it("still re-authorizes a gap-mode switch without a second click", () => {
    const page = mountCompetitorsPage();
    page.analyze({
      target: "alpha.com",
      competitor: "rival.com",
      tab: "gap",
      page: 1,
    });

    page.navigate({ mode: "shared", page: 1 });

    expect(page.authorized).toBe(true);
    expect(page.autoRuns).toBe(1);
  });

  it("never authorizes a tab the user merely opened, or paged through", () => {
    const page = mountCompetitorsPage();

    page.navigate({ target: "alpha.com" });
    expect(page.authorized).toBe(false);

    page.navigate({ page: 2 });
    expect(page.authorized).toBe(false);
    expect(page.autoRuns).toBe(0);
  });

  it("does not re-authorize once the question itself changes", () => {
    const page = mountCompetitorsPage();
    page.analyze({ target: "alpha.com", page: 1 });

    // A different target is a different question: it needs its own Analyze.
    page.navigate({ target: "beta.com" });

    expect(page.authorized).toBe(false);
    expect(page.autoRuns).toBe(0);
  });
});

describe("shouldReauthorizePagedRun", () => {
  const AUTHORIZED_RUN = {
    identity: "p|alpha.com||competitors",
    position: "1|missing",
  };

  it("re-authorizes when only the position moved", () => {
    expect(
      shouldReauthorizePagedRun(AUTHORIZED_RUN, {
        identity: AUTHORIZED_RUN.identity,
        authorized: false,
        position: "2|missing",
      }),
    ).toBe(true);
  });

  it("does nothing while the run is authorized", () => {
    expect(
      shouldReauthorizePagedRun(AUTHORIZED_RUN, {
        identity: AUTHORIZED_RUN.identity,
        authorized: true,
        position: "2|missing",
      }),
    ).toBe(false);
  });

  it("does nothing when nothing has ever been authorized", () => {
    expect(
      shouldReauthorizePagedRun(NO_AUTHORIZED_RUN, {
        identity: AUTHORIZED_RUN.identity,
        authorized: false,
        position: "2|missing",
      }),
    ).toBe(false);
  });

  it("does nothing when the identity changed", () => {
    expect(
      shouldReauthorizePagedRun(AUTHORIZED_RUN, {
        identity: "p|beta.com||competitors",
        authorized: false,
        position: "2|missing",
      }),
    ).toBe(false);
  });

  it("does nothing when the position has not moved -- an authorize is in flight", () => {
    expect(
      shouldReauthorizePagedRun(AUTHORIZED_RUN, {
        identity: AUTHORIZED_RUN.identity,
        authorized: false,
        position: AUTHORIZED_RUN.position,
      }),
    ).toBe(false);
  });
});

describe("trackAuthorizedRun", () => {
  it("records identity and position while authorized", () => {
    expect(
      trackAuthorizedRun(NO_AUTHORIZED_RUN, {
        identity: "p|alpha.com||competitors",
        authorized: true,
        position: "2|missing",
      }),
    ).toEqual({ identity: "p|alpha.com||competitors", position: "2|missing" });
  });

  it("holds the last authorized pair while unauthorized", () => {
    const previous = {
      identity: "p|alpha.com||competitors",
      position: "1|missing",
    };

    expect(
      trackAuthorizedRun(previous, {
        identity: "p|beta.com||competitors",
        authorized: false,
        position: "9|shared",
      }),
    ).toBe(previous);
  });
});
