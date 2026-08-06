import * as React from "react";

/**
 * Scroll-and-entrance reveal: fade the element up into place the first time it
 * enters the viewport.
 *
 * The timing, distance and easing all live in CSS (see the "Motion foundation"
 * section of app.css). This hook owns only the *when* — it flips a
 * `data-reveal` attribute and lets the stylesheet do the rest. Keeping the
 * values in CSS is what lets `prefers-reduced-motion` be handled in exactly one
 * place instead of in every caller.
 *
 * Content ships visible and is hidden by this hook a frame before it reveals,
 * never the other way round. A static `opacity: 0` would mean any browser that
 * fails to run this script renders a blank page — the worst possible outcome
 * for a tool whose whole subject is crawlability.
 */

/** useLayoutEffect warns when it runs during SSR, and the hidden state must be
 *  applied before paint or the element flashes in at full opacity first. */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

function canAnimate(): boolean {
  if (typeof window === "undefined") return false;
  // Older browsers and some embedded webviews lack IntersectionObserver. Without
  // it there is nothing to un-hide the element, so never hide it in the first place.
  if (!("IntersectionObserver" in window)) return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export type UseRevealOptions = {
  /** Re-hide and replay when the element scrolls back out of view. Off by
   *  default: content that re-animates every time you scroll past it is the
   *  single most common way "polished" tips over into "distracting". */
  replay?: boolean;
  /** Fraction of the element that must be visible before it reveals. */
  threshold?: number;
  /** Shrinks the viewport for the purposes of the test. The default trims 12%
   *  off the bottom so an element starts moving once it is meaningfully on
   *  screen, rather than the instant its first pixel crosses the fold. */
  rootMargin?: string;
  /** Opt out entirely — e.g. for a row inside an already-revealed list. */
  disabled?: boolean;
};

export function useReveal<TElement extends HTMLElement = HTMLDivElement>({
  replay = false,
  threshold = 0.15,
  rootMargin = "0px 0px -12% 0px",
  disabled = false,
}: UseRevealOptions = {}) {
  const ref = React.useRef<TElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (disabled || !canAnimate()) {
      // Clear rather than return: `disabled` can flip to true while an element
      // is still hidden, and leaving the attribute behind would strand it at
      // opacity 0 forever.
      delete element.dataset.reveal;
      return;
    }

    element.dataset.reveal = "hidden";

    // The observer watches exactly this one element, so the closed-over
    // `element` is the entry's target — no need to widen `entry.target` back
    // out of Element.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            element.dataset.reveal = "shown";
            if (!replay) observer.disconnect();
          } else if (replay) {
            element.dataset.reveal = "hidden";
          }
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
      delete element.dataset.reveal;
    };
  }, [disabled, replay, rootMargin, threshold]);

  return ref;
}
