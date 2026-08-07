import * as React from "react";
import { useReveal, type UseRevealOptions } from "@/client/hooks/useReveal";

/**
 * Wraps content in a fade-and-rise reveal.
 *
 * Above the fold this reads as the page-load entrance; further down it becomes
 * a scroll reveal. It is deliberately the same mechanism for both — one motion
 * vocabulary across the page is what makes a site feel designed rather than
 * decorated.
 *
 * `index` staggers a group: item n waits n × the stagger step before it starts.
 * Keep runs short. Past roughly six items the last one is still waiting long
 * after the reader's eye has arrived, which reads as sluggishness, not polish.
 */
/** React.CSSProperties has no room for custom properties, and asserting one in
 *  is banned by the lint config. Widening the type is the honest version. */
type MotionIndexStyle = React.CSSProperties & { "--motion-index": number };

export function Reveal({
  children,
  index = 0,
  className,
  ...revealOptions
}: {
  children: React.ReactNode;
  index?: number;
  className?: string;
} & UseRevealOptions) {
  const ref = useReveal(revealOptions);

  // Read by the transition-delay calc() in app.css. Set as a variable rather
  // than an inline transition-delay so reduced motion can zero it from the
  // stylesheet without JS needing to know anything about it.
  const style: MotionIndexStyle | undefined = index
    ? { "--motion-index": index }
    : undefined;

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}

/**
 * Staggers a list without every caller hand-counting `index`.
 *
 * Each child gets its own wrapper element, so apply the layout classes here
 * (`className` lands on the container): in a grid or flex container the
 * wrappers become the items and the layout is unchanged.
 */
export function RevealGroup({
  children,
  className,
  startIndex = 0,
  ...revealOptions
}: {
  children: React.ReactNode;
  className?: string;
  /** Offset the stagger, to continue a run started by an earlier group. */
  startIndex?: number;
} & UseRevealOptions) {
  return (
    <div className={className}>
      {React.Children.map(children, (child, childIndex) => (
        <Reveal index={startIndex + childIndex} {...revealOptions}>
          {child}
        </Reveal>
      ))}
    </div>
  );
}
