import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  createVisibleKeyTracker,
  useVisibleKeys,
  type VisibleKeyTracker,
} from "./useVisibleKeys";

/**
 * Regression cover for the render loop Link Opportunities shipped with.
 *
 * Two things kept the tab re-rendering for as long as it was open:
 *   1. `ref={observe(query)}` built a new closure on every render, so React
 *      detached and re-attached the ref every commit, which re-observed the
 *      node, which delivered another initial IntersectionObserver entry;
 *   2. the state updater allocated `new Set(current)` unconditionally, so an
 *      entry carrying nothing new still changed the state identity and
 *      scheduled the next render.
 * Separately, refs attach during commit and the observer is built by an effect
 * that runs after it, so every row of the first commit was registered and then
 * never watched.
 *
 * The repo has no DOM in its unit environment, so the loop is driven through
 * the tracker with the same rules React applies: a ref callback is re-attached
 * only when its identity changes, `observe()` always yields one initial entry,
 * and a state update only renders when it changes identity.
 */

const RENDER_CAP = 200;

/** The tracker only ever compares nodes by identity, so a plain object is a
 *  faithful stand-in -- and this environment has no DOM to build a real one. */
type FakeNode = { id: string };
type FakeEntry = { target: FakeNode; isIntersecting: boolean };

function fakeNode(id: string): FakeNode {
  return { id };
}

/** Stands in for IntersectionObserver. `autoEntry` mirrors the real thing
 *  always delivering an initial entry for a newly observed target. */
function createFakeObserver({ autoEntry = true } = {}) {
  const queued: FakeEntry[] = [];
  const watched = new Set<FakeNode>();
  let observeCount = 0;
  return {
    watcher: {
      observe(node: FakeNode) {
        observeCount += 1;
        watched.add(node);
        if (autoEntry) queued.push({ target: node, isIntersecting: true });
      },
      unobserve(node: FakeNode) {
        watched.delete(node);
      },
      disconnect() {
        watched.clear();
      },
    },
    observeCount: () => observeCount,
    watchedCount: () => watched.size,
    take: (): FakeEntry[] => queued.splice(0, queued.length),
  };
}

/** Renders until React would stop scheduling renders, or gives up at the cap. */
function simulateCommits(keys: readonly string[], observerFirst: boolean) {
  const tracker = createVisibleKeyTracker<FakeNode>();
  const observer = createFakeObserver();
  const nodes = new Map(keys.map((key) => [key, fakeNode(key)]));
  const attached = new Map<string, (node: FakeNode | null) => void>();
  if (observerFirst) tracker.start(observer.watcher);

  let renders = 0;
  let dirty = true;
  while (dirty && renders < RENDER_CAP) {
    renders += 1;
    dirty = false;
    for (const key of keys) {
      const next = tracker.observe(key);
      const previous = attached.get(key);
      // React only re-runs a ref whose identity changed.
      if (previous !== next) {
        previous?.(null);
        attached.set(key, next);
        next(nodes.get(key) ?? null);
      }
    }
    // The effect that builds the observer runs after the first commit.
    if (!observerFirst && renders === 1) tracker.start(observer.watcher);
    const entries = observer.take();
    if (entries.length > 0 && tracker.handleEntries(entries)) dirty = true;
  }
  return { tracker, observer, nodes, renders };
}

function attachAll(
  tracker: VisibleKeyTracker<FakeNode>,
  keys: readonly string[],
): Map<string, FakeNode> {
  const nodes = new Map(keys.map((key) => [key, fakeNode(key)]));
  for (const key of keys) tracker.observe(key)(nodes.get(key) ?? null);
  return nodes;
}

describe("useVisibleKeys", () => {
  it("hands out the same ref callback for a key on every call", () => {
    const captured: Array<ReturnType<typeof useVisibleKeys>> = [];
    function Probe() {
      captured.push(useVisibleKeys());
      return null;
    }
    renderToStaticMarkup(createElement(Probe));

    const { observe, visible } = captured[0];
    // The loop's first half: a fresh closure per call is a fresh ref identity
    // per render, which is what made React detach and re-attach every commit.
    expect(observe("keyword a")).toBe(observe("keyword a"));
    expect(observe("keyword a")).not.toBe(observe("keyword b"));
    expect([...visible]).toEqual([]);
  });
});

describe("createVisibleKeyTracker", () => {
  const keys = ["a", "b", "c"];

  it("settles instead of re-rendering forever", () => {
    const { renders, tracker, observer } = simulateCommits(keys, true);

    expect(renders).toBeLessThan(RENDER_CAP);
    expect(renders).toBe(2); // one to attach, one for the visibility result
    expect([...tracker.snapshot()].toSorted()).toEqual(keys);
    // Re-observing the same node is what produced the extra entries.
    expect(observer.observeCount()).toBe(keys.length);
  });

  it("watches rows that attached before the observer existed", () => {
    // Refs run during commit, the observer is built by the effect after it.
    // This is the ordering of every first commit, including a return to the
    // tab while useLinkInsights still has its data cached.
    const { renders, tracker, observer } = simulateCommits(keys, false);

    expect(renders).toBeLessThan(RENDER_CAP);
    expect([...tracker.snapshot()].toSorted()).toEqual(keys);
    expect(observer.observeCount()).toBe(keys.length);
  });

  it("keeps the same set when a batch adds nothing", () => {
    const tracker = createVisibleKeyTracker<FakeNode>();
    const observer = createFakeObserver({ autoEntry: false });
    tracker.start(observer.watcher);
    const nodes = attachAll(tracker, ["a"]);
    const node = nodes.get("a") ?? fakeNode("a");

    expect(
      tracker.handleEntries([{ target: node, isIntersecting: true }]),
    ).toBe(true);
    const settled = tracker.snapshot();

    // The loop's second half: a repeat entry used to allocate a new Set and so
    // schedule another render even though the answer was unchanged.
    expect(
      tracker.handleEntries([{ target: node, isIntersecting: true }]),
    ).toBe(false);
    expect(tracker.snapshot()).toBe(settled);

    // Same for an entry about a node it has never been told about.
    expect(
      tracker.handleEntries([
        { target: fakeNode("stranger"), isIntersecting: true },
      ]),
    ).toBe(false);
    expect(tracker.snapshot()).toBe(settled);
  });

  it("stays lazy: an unreached row is never marked visible", () => {
    const tracker = createVisibleKeyTracker<FakeNode>();
    const observer = createFakeObserver({ autoEntry: false });
    tracker.start(observer.watcher);
    const nodes = attachAll(tracker, keys);

    expect(observer.watchedCount()).toBe(keys.length);
    expect([...tracker.snapshot()]).toEqual([]);

    // Off-screen entries stay off the list, so no link-presence check fires.
    expect(
      tracker.handleEntries([
        { target: nodes.get("a") ?? fakeNode("a"), isIntersecting: false },
      ]),
    ).toBe(false);
    expect([...tracker.snapshot()]).toEqual([]);
  });

  it("does not re-watch a row it has already seen", () => {
    const tracker = createVisibleKeyTracker<FakeNode>();
    const observer = createFakeObserver({ autoEntry: false });
    tracker.start(observer.watcher);
    const node = fakeNode("a");
    const ref = tracker.observe("a");
    ref(node);
    tracker.handleEntries([{ target: node, isIntersecting: true }]);

    expect(observer.watchedCount()).toBe(0); // unobserved once seen
    ref(null);
    ref(fakeNode("a-again"));
    expect(observer.watchedCount()).toBe(0);
    expect(observer.observeCount()).toBe(1);
  });

  it("unwatches a row whose ref detaches", () => {
    const tracker = createVisibleKeyTracker<FakeNode>();
    const observer = createFakeObserver({ autoEntry: false });
    tracker.start(observer.watcher);
    attachAll(tracker, keys);

    tracker.observe("a")(null);
    expect(observer.watchedCount()).toBe(keys.length - 1);
  });

  it("hands still-unseen rows to a replacement observer", () => {
    // React double-invokes effects in development, and a remount does the same
    // thing: the second observer has to pick up the rows the first was given.
    const tracker = createVisibleKeyTracker<FakeNode>();
    const first = createFakeObserver({ autoEntry: false });
    tracker.start(first.watcher);
    attachAll(tracker, keys);
    tracker.stop();

    const second = createFakeObserver({ autoEntry: false });
    tracker.start(second.watcher);
    expect(second.watchedCount()).toBe(keys.length);
  });
});
