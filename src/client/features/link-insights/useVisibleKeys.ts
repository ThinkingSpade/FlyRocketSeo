import { useEffect, useRef, useState } from "react";

/** The part of IntersectionObserver the tracker drives, so a test can hand it
 *  a stand-in without a DOM. */
type NodeWatcher<TNode> = {
  observe: (node: TNode) => void;
  unobserve: (node: TNode) => void;
  disconnect: () => void;
};

/** The two fields of an IntersectionObserverEntry this reads. */
type VisibilityEntry<TNode> = {
  readonly target: TNode;
  readonly isIntersecting: boolean;
};

/** Generic in the node only because nothing here needs a node to be anything
 *  but a stable identity — which is what lets a DOM-free test drive it. */
export type VisibleKeyTracker<TNode extends object = Element> = {
  /** Stable per key, for the tracker's whole life — see `observe` below. */
  observe: (key: string) => (node: TNode | null) => void;
  /** Hand over the observer; anything registered before now is picked up. */
  start: (watcher: NodeWatcher<TNode>) => void;
  stop: () => void;
  /** Returns whether the visible set actually grew. */
  handleEntries: (entries: readonly VisibilityEntry<TNode>[]) => boolean;
  /** The same reference until `handleEntries` reports a change. */
  snapshot: () => ReadonlySet<string>;
};

/**
 * The bookkeeping behind `useVisibleKeys`, with no React in it.
 *
 * Split out because the two properties that keep this from spinning are
 * identity properties — a ref callback that does not change, and a result set
 * that does not change — and identity is exactly what a markup snapshot cannot
 * check.
 */
export function createVisibleKeyTracker<
  TNode extends object = Element,
>(): VisibleKeyTracker<TNode> {
  let watcher: NodeWatcher<TNode> | null = null;
  let seen: ReadonlySet<string> = new Set<string>();
  const keyByNode = new Map<TNode, string>();
  const nodeByKey = new Map<string, TNode>();
  const refByKey = new Map<string, (node: TNode | null) => void>();
  // Refs attach during commit; the observer is built by an effect, which runs
  // after that commit. Rows registered in the gap wait here rather than being
  // dropped — otherwise the whole first screenful is registered and never
  // watched, and every Status cell spins until some unrelated render happens
  // to re-attach it. Reachable on any return to the tab inside
  // useLinkInsights' ten-minute staleTime, where the first commit already has
  // every row.
  const waiting = new Set<TNode>();

  function watch(node: TNode) {
    if (watcher === null) {
      waiting.add(node);
      return;
    }
    watcher.observe(node);
  }

  function drop(node: TNode) {
    waiting.delete(node);
    keyByNode.delete(node);
    watcher?.unobserve(node);
  }

  function attach(key: string, node: TNode | null) {
    const previous = nodeByKey.get(key);
    if (previous === node) return;
    if (previous !== undefined) {
      nodeByKey.delete(key);
      drop(previous);
    }
    // "Seen once" is the whole contract, so a row that has already been
    // checked never needs watching again. That also means no stray re-attach
    // can ask the observer for a fresh entry about it.
    if (node === null || seen.has(key)) return;
    nodeByKey.set(key, node);
    keyByNode.set(node, key);
    watch(node);
  }

  return {
    observe(key) {
      // One callback per key, cached. `ref={observe(key)}` is evaluated on
      // every render, and a fresh closure each time makes React detach and
      // re-attach the ref every commit — which re-observes the node, which
      // delivers another initial entry, which renders again.
      let ref = refByKey.get(key);
      if (ref === undefined) {
        ref = (node) => attach(key, node);
        refByKey.set(key, ref);
      }
      return ref;
    },

    start(next) {
      watcher = next;
      for (const node of waiting) next.observe(node);
      waiting.clear();
    },

    stop() {
      watcher?.disconnect();
      watcher = null;
      // A remount — or React's double-invoked effects in development — builds
      // a fresh observer, which still has to pick up the rows that were
      // attached to the old one.
      for (const node of nodeByKey.values()) waiting.add(node);
    },

    handleEntries(entries) {
      let next: Set<string> | null = null;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const key = keyByNode.get(entry.target);
        if (key !== undefined) nodeByKey.delete(key);
        drop(entry.target);
        if (key === undefined || seen.has(key)) continue;
        next ??= new Set(seen);
        next.add(key);
      }
      // Nothing new: keep the very same set, so an identical visibility
      // result cannot schedule a render.
      if (next === null) return false;
      seen = next;
      return true;
    },

    snapshot() {
      return seen;
    },
  };
}

/**
 * Which of a list's rows have been on screen at least once.
 *
 * Link Opportunities checks whether each suggested internal link already
 * exists, and each check is a real fetch of the client's own page. Building
 * those queries for every row on mount meant up to fifteen opportunities times
 * five sources — seventy-five requests, or a hundred and fifty with the retry —
 * fired against the client's site the moment the tab opened, whether or not
 * anyone scrolled that far.
 *
 * "Seen once" rather than "currently visible" on purpose: a result that has
 * been fetched should not disappear when the row scrolls back off, and React
 * Query keeps it cached anyway, so re-enabling on every scroll would only churn
 * the query set.
 */
export function useVisibleKeys(): {
  visible: ReadonlySet<string>;
  observe: (key: string) => (node: Element | null) => void;
} {
  const trackerRef = useRef<VisibleKeyTracker | null>(null);
  trackerRef.current ??= createVisibleKeyTracker();
  const tracker = trackerRef.current;
  const [visible, setVisible] = useState<ReadonlySet<string>>(() =>
    tracker.snapshot(),
  );

  useEffect(() => {
    // Not available in the SSR pass, and DOM-free unit renders do not have it
    // either; without an observer every row simply stays unchecked, which is
    // the same state it starts in.
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!tracker.handleEntries(entries)) return;
        setVisible(tracker.snapshot());
      },
      // A screen's worth of margin so a row is checked just before it is read,
      // rather than after the user is already looking at an empty column.
      { rootMargin: "200px" },
    );
    tracker.start(observer);
    return () => tracker.stop();
  }, [tracker]);

  return { visible, observe: tracker.observe };
}
