import type { ReactNode } from "react";
import { useReveal } from "@/client/hooks/useReveal";

/**
 * The shared furniture of the landing page.
 *
 * Kept deliberately small. Everything here is layout and rhythm — the parts
 * every section repeats — so that a section file only ever contains its own
 * content. The app's tokens do the colour work: `bg-base-100/200`,
 * `text-base-content`, `bg-primary` (Signal) and `text-primary` (Signal
 * darkened enough to read on white). Nothing on this page hardcodes a hex, so
 * it follows the brand and both themes for free.
 */

/** Vertical rhythm for a full-width band, and the reveal that brings its
 *  children in one after another. The ref goes on the inner column so the
 *  stagger applies to sections rather than to the band's background. */
export function Section({
  children,
  tone = "base",
  className = "",
  id,
}: {
  children: ReactNode;
  /** `base` is the page; `raised` is the alternating panel that separates one
   *  band from the next without needing a rule between them. */
  tone?: "base" | "raised";
  className?: string;
  id?: string;
}) {
  const revealRef = useReveal({ stagger: true });
  const surface = tone === "raised" ? "bg-base-200" : "bg-base-100";

  return (
    <section id={id} className={`${surface} px-5 py-20 md:px-8 md:py-28`}>
      <div
        ref={revealRef}
        className={`mx-auto flex w-full max-w-6xl flex-col gap-12 ${className}`}
      >
        {children}
      </div>
    </section>
  );
}

/** The small uppercase label above a section heading. Signal-coloured, which
 *  is most of the orange anyone sees on this page — the accent's job. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
      {children}
    </p>
  );
}

/** Heading plus optional standfirst, at the one size pairing the page uses. */
export function SectionHeading({
  eyebrow,
  title,
  children,
  align = "start",
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  align?: "start" | "center";
}) {
  const alignment =
    align === "center" ? "items-center text-center" : "items-start";

  return (
    <div
      className={`flex max-w-2xl flex-col gap-3 ${alignment} ${align === "center" ? "mx-auto" : ""}`}
    >
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
        {title}
      </h2>
      {children ? (
        <p className="text-base leading-relaxed text-base-content/70 text-pretty">
          {children}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One capability in a grid.
 *
 * `border-base-300` and `bg-base-100` rather than a shadow: the reference
 * dashboard separates cards with a hairline and lets the surface do the rest,
 * which is what keeps a dense grid from reading as clutter.
 */
export function FeatureCard({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="group flex flex-col gap-2 rounded-xl border border-base-300 bg-base-100 p-5 transition-[border-color,transform] duration-(--motion-duration-base) ease-out-soft hover:-translate-y-0.5 hover:border-primary/40">
      {icon ? (
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
      ) : null}
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-base-content/65">{children}</p>
    </div>
  );
}

/** A plain three-or-four-across grid for FeatureCards. */
export function CardGrid({
  children,
  columns = 3,
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4;
}) {
  const cols =
    columns === 4
      ? "sm:grid-cols-2 lg:grid-cols-4"
      : columns === 2
        ? "sm:grid-cols-2"
        : "sm:grid-cols-2 lg:grid-cols-3";
  return <div className={`grid gap-4 ${cols}`}>{children}</div>;
}
