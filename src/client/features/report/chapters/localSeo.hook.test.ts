import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type * as ReactQuery from "@tanstack/react-query";

/**
 * Sibling of localSeo.test.ts, split out once that file crossed this repo's
 * `max-lines` cap — same module under test, split at the one describe block
 * that needs a boundary none of that file's tests want: `useQuery` itself
 * stubbed, so the hook can be run against read states no hand-built fixture can
 * express.
 *
 * Finding 11 is why that is worth a file. `pendingReads` was built from
 * `query.isLoading`, which is `isPending && isFetching`. A query that is pending
 * but PAUSED — `fetchStatus: "paused"`, the ordinary state of an offline
 * browser, which is exactly the browser a client's PDF gets printed from —
 * reports `isError` false, `isLoading` false and no data. The chapter therefore
 * saw a read that had neither failed, nor was loading, nor had returned, and
 * fell through to "No Google Business Profile lookup is on file for this
 * project": an accusation about the agency's work, printed because the laptop
 * was on a train. Every sibling chapter reads `isPending`.
 */

// The same boundary stubs localSeo.test.ts uses: the chapter module imports
// three server functions at the top level and each pulls `cloudflare:workers`
// in transitively.
vi.mock("@/serverFunctions/projects", () => ({ getProjects: vi.fn() }));
vi.mock("@/serverFunctions/local-seo", () => ({
  getCachedBusinessContext: vi.fn(),
}));
vi.mock("@/serverFunctions/gbp", () => ({
  getGbpConnection: vi.fn(),
  listGbpScheduledPosts: vi.fn(),
}));

/** Per-query state for the `useQuery` stub, addressed by the first element of
 *  each query key. Nothing supplies `data`: every state below is a read that
 *  has not returned one. */
const queryStubs = vi.hoisted(() => {
  const settled = { isError: false, isLoading: false, isPending: false };
  const byKey = new Map<string, typeof settled>();
  return { byKey, settled, read: (key: unknown) => byKey.get(String(key)) };
});

// Only `useQuery` is replaced — the rest of the module is left in place so the
// chapter's own imports, and its transitive ones, still link.
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof ReactQuery>();
  return {
    ...actual,
    useQuery: (options: { queryKey: readonly unknown[] }) =>
      queryStubs.read(options.queryKey[0]) ?? queryStubs.settled,
  };
});

const { buildlocalSeoChapter, uselocalSeoReportData } =
  await import("./localSeo");
type LocalSeoData = Parameters<typeof buildlocalSeoChapter>[0];

const NEVER_RUN =
  "No Google Business Profile lookup is on file for this project. Saved lookups are kept for a limited window, so one run earlier in the period may no longer be on file — re-running the Local SEO lookup restores this chapter.";

const READ_FAILED =
  "The saved Google Business Profile lookup could not be read while this report was generated — that request failed rather than returning nothing.";

const LOOKUP_LOADING =
  "The saved Google Business Profile lookup was still loading when this report was generated.";

const POSTS_LOADING =
  "The Google Business Profile posting history was still loading when this report was generated.";

const NOTHING_FLAGGED: LocalSeoData["pendingReads"] = {
  projects: false,
  localBusiness: false,
  gbpConnection: false,
  gbpPosts: false,
};

/** Runs the real hook against the stubbed queries. Server rendering drives
 *  `useQuery` and `useMemo` perfectly well, so this needs no React Query
 *  provider and no DOM. */
function hookData(
  states: Record<string, Partial<typeof queryStubs.settled>> = {},
): LocalSeoData {
  queryStubs.byKey.clear();
  for (const [key, state] of Object.entries(states)) {
    queryStubs.byKey.set(key, { ...queryStubs.settled, ...state });
  }
  const seen: LocalSeoData[] = [];
  function Probe() {
    seen.push(uselocalSeoReportData("project-1"));
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  const captured = seen[0];
  if (!captured) throw new Error("the probe component never rendered");
  return captured;
}

/** The sentence a client would read, which is the only thing a flag on this
 *  hook is worth anything for. Nothing is on file in any state below, so the
 *  chapter is always dropped. */
function reasonFor(data: LocalSeoData): string {
  const reasons: string[] = [];
  buildlocalSeoChapter(data, {
    add: () => expect.unreachable("no read returns data, so nothing to print"),
    drop: (_title, reason) => reasons.push(reason),
  });
  return reasons.join(" ");
}

describe("uselocalSeoReportData", () => {
  /** Pending but NOT fetching, which is all a paused query looks like from
   *  here: `isLoading` stays false, so `isLoading` alone reports nothing. */
  const paused = { isPending: true };

  it("counts a paused lookup as pending, not as a lookup never run", () => {
    const hook = hookData({ "cached-business-context": paused });

    expect(hook.pendingReads.localBusiness).toBe(true);
    expect(hook.readFailures.localBusiness).toBe(false);
    expect(reasonFor(hook)).toBe(LOOKUP_LOADING);
    expect(reasonFor(hook)).not.toContain(NEVER_RUN);
  });

  it("counts every paused read as pending", () => {
    const hook = hookData({
      projects: paused,
      "cached-business-context": paused,
      gbpConnection: paused,
      gbpScheduledPosts: paused,
    });

    expect(hook.pendingReads).toEqual({
      projects: true,
      localBusiness: true,
      gbpConnection: true,
      gbpPosts: true,
    });
    expect(reasonFor(hook)).toBe(`${LOOKUP_LOADING} ${POSTS_LOADING}`);
  });

  it("keeps settled and thrown reads out of the pending set", () => {
    // Settled and empty really is the never-run case, so that sentence stands.
    expect(hookData().pendingReads).toEqual(NOTHING_FLAGGED);
    expect(reasonFor(hookData())).toBe(NEVER_RUN);

    const threw = hookData({ "cached-business-context": { isError: true } });

    expect(threw.readFailures.localBusiness).toBe(true);
    expect(threw.pendingReads.localBusiness).toBe(false);
    expect(reasonFor(threw)).toBe(READ_FAILED);
  });
});
