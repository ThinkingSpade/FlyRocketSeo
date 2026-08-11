import { useCallback, useEffect, useRef, useState } from "react";

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
  observe: (key: string) => (node: HTMLElement | null) => void;
} {
  const [visible, setVisible] = useState<ReadonlySet<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const keyByNode = useRef(new Map<Element, string>());

  useEffect(() => {
    // Not available in the SSR pass, and jsdom-free unit renders do not have it
    // either; without an observer every row simply stays unchecked, which is
    // the same state it starts in.
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const seen: string[] = [];
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const key = keyByNode.current.get(entry.target);
          if (key !== undefined) seen.push(key);
          observer.unobserve(entry.target);
        }
        if (seen.length === 0) return;
        setVisible((current) => {
          const next = new Set(current);
          for (const key of seen) next.add(key);
          return next;
        });
      },
      // A screen's worth of margin so a row is checked just before it is read,
      // rather than after the user is already looking at an empty column.
      { rootMargin: "200px" },
    );
    observerRef.current = observer;
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, []);

  const observe = useCallback(
    (key: string) => (node: HTMLElement | null) => {
      if (!node) return;
      keyByNode.current.set(node, key);
      observerRef.current?.observe(node);
    },
    [],
  );

  return { visible, observe };
}
