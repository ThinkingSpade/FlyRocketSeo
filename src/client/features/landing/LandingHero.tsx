import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@cloudflare/kumo/components/button";
import { Eyebrow, Section } from "./parts";

/**
 * The top bar and the first screen of the public landing page.
 *
 * Everything here is written off the README and nothing else. FlyRocketSEO is
 * an invite-only tool for one team, so there is no social proof to show and
 * none is invented: no logos, no counts, no testimonials, no plan tiers. The
 * hero's whole job is to say plainly what the thing is and put the sign-in
 * door where a visitor expects it — with the honest note that the door is
 * locked to an allow-list.
 */

/* The hero visual, as geometry.
   ---------------------------------------------------------------------------
   A hand-built impression of a panel rather than a screenshot. A screenshot of
   the real app would either leak a live project's data or need fake rows
   invented for it, and both are worse than an abstraction: the first is a
   privacy problem, the second is a lie told in pixels. So the panel carries no
   numbers and no labels at all — bars stand in for text and the only real
   drawing is the trend, which is obviously illustrative because nothing names
   its axes.

   It is also two SVG paths and some divs. Importing ECharts to draw a
   decorative line would put the charting bundle on the one page a stranger
   loads first, which is the opposite of what a landing page should cost. */

const CHART_W = 320;
const CHART_H = 104;
/** Series are scaled against this rather than their own max, so the two lines
 *  share one axis and the peak keeps a little headroom under the top edge. */
const CHART_MAX = 92;
const CHART_TOP_PAD = 8;

/** An upward line with enough wobble to read as measured rather than drawn. */
const TREND = [14, 19, 16, 24, 29, 26, 35, 41, 38, 49, 57, 62, 71, 80];
/** The flatter "previous period" line that gives the trend something to beat. */
const COMPARE = [11, 13, 12, 16, 18, 17, 21, 22, 20, 25, 27, 26, 30, 33];
/** Three hairlines, not a full grid: enough to imply an axis, quiet enough
 *  that the eye still goes to the line. */
const GRID_Y = [24, 52, 80];

function plotY(value: number): number {
  // SVG y grows downward, so the larger value has to take the smaller y.
  return CHART_H - (value / CHART_MAX) * (CHART_H - CHART_TOP_PAD);
}

function toPath(values: number[]): string {
  const stepX = CHART_W / (values.length - 1);
  const points = values.map(
    (value, index) =>
      `${(index * stepX).toFixed(1)},${plotY(value).toFixed(1)}`,
  );
  return `M${points.join(" L")}`;
}

const TREND_LINE = toPath(TREND);
/** Closed down to the baseline for the fill, leaving the stroke open so no
 *  vertical edge is drawn at either end of the line itself. */
const TREND_AREA = `${TREND_LINE} L${CHART_W},${CHART_H} L0,${CHART_H} Z`;
const COMPARE_LINE = toPath(COMPARE);
const TREND_END_Y = plotY(TREND.at(-1) ?? 0);

/** The three rows of the list band. Tailwind cannot generate a class from a
 *  runtime value, so the widths are literals — which is also what keeps them
 *  irregular enough to read as content rather than as a loading skeleton. */
const LIST_ROWS = [
  { key: "a", dot: "bg-primary", label: "w-32 sm:w-40", meter: "w-9" },
  { key: "b", dot: "bg-primary/60", label: "w-24 sm:w-32", meter: "w-14" },
  { key: "c", dot: "bg-primary/30", label: "w-28 sm:w-36", meter: "w-7" },
];

/**
 * The slim public top bar.
 *
 * Sticky, hairline-bottomed and translucent — the dashboard's own chrome
 * idiom. The only action on it is the door, so it is the only thing with a
 * fill; everything else is the mark and the wordmark at body weight.
 */
export function LandingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-base-300 bg-base-100/80 backdrop-blur">
      <nav className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-5 md:px-8">
        <Link
          to="/"
          className="flex items-center gap-2 text-base font-semibold text-base-content transition-opacity duration-(--motion-duration-fast) ease-out-soft hover:opacity-80"
        >
          <img
            src="/logo-mark.png"
            alt=""
            width={24}
            height={24}
            className="h-6 w-6"
          />
          FlyRocketSEO
        </Link>
        <Link to="/sign-in" className={buttonVariants({ variant: "primary" })}>
          Sign in
        </Link>
      </nav>
    </header>
  );
}

/**
 * The first screen.
 *
 * `Section` supplies the rhythm and the entrance reveal, and because it
 * staggers its direct children the copy lands a beat before the panel — which
 * is the reading order anyway. `tone="raised"` puts the hero on the canvas
 * grey so the panel can be `bg-base-100` and read as a card sitting on it,
 * exactly as a card does inside the app.
 */
export function LandingHero() {
  return (
    <Section
      tone="raised"
      className="lg:flex-row lg:items-center lg:gap-16 xl:gap-20"
    >
      <div className="flex max-w-xl flex-col items-start gap-5 lg:flex-1">
        <Eyebrow>Self-hosted on Cloudflare Workers</Eyebrow>

        <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-balance md:text-5xl">
          SEO research and reporting for one team.
        </h1>

        <p className="text-base leading-relaxed text-base-content/70 text-pretty md:text-lg">
          A private workspace for keyword research, rank tracking, backlinks,
          site audits and client reports — one project per domain, every
          analysis kept against it. Nothing metered ever runs on its own: each
          paid lookup shows its cost before it runs.
        </p>

        <div className="flex flex-col items-start gap-2.5 pt-2">
          <Link
            to="/sign-in"
            className={buttonVariants({ variant: "primary", size: "lg" })}
          >
            Sign in
          </Link>
          <p className="text-xs text-base-content/55">
            Access is invite-only — the team's email allow-list, plus invited
            teammates.
          </p>
        </div>
      </div>

      <div className="w-full lg:flex-1">
        <HeroPanel />
      </div>
    </Section>
  );
}

/**
 * Decorative only, hence `aria-hidden`. There is nothing here a screen reader
 * could usefully be told: every bar is a stand-in for text that does not
 * exist, and the trend line has no numbers behind it.
 */
function HeroPanel() {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-sm"
    >
      {/* Title bar: mark, a two-line title, and a pair of controls. */}
      <div className="flex items-center gap-3 border-b border-base-300 px-4 py-3">
        <span className="size-6 shrink-0 rounded-md bg-primary/90" />
        <span className="flex flex-col gap-1.5">
          <span className="block h-2 w-28 rounded-full bg-base-content/20" />
          <span className="block h-1.5 w-16 rounded-full bg-base-content/10" />
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <span className="block h-6 w-10 rounded-md border border-base-300 bg-base-200" />
          <span className="block h-6 w-6 rounded-md border border-base-300 bg-base-200" />
        </span>
      </div>

      {/* Chart band. */}
      <div className="border-b border-base-300 px-4 pb-4 pt-5">
        {/* Legend: the live series, then the comparison. */}
        <div className="mb-4 flex items-center gap-4">
          <span className="flex items-center gap-2">
            <span className="block size-2 rounded-full bg-primary" />
            <span className="block h-1.5 w-14 rounded-full bg-base-content/20" />
          </span>
          <span className="flex items-center gap-2">
            <span className="block h-0.5 w-3 rounded-full bg-base-content/30" />
            <span className="block h-1.5 w-10 rounded-full bg-base-content/10" />
          </span>
        </div>

        {/* `preserveAspectRatio="none"` lets one viewBox stretch to whatever
            width the panel is, so the height is set here per breakpoint rather
            than falling out of the container's width — which is what stops the
            chart from turning into a tall slab on a stacked tablet layout.
            `non-scaling-stroke` holds an even line weight through the stretch. */}
        <div className="h-28 w-full sm:h-36 lg:h-40">
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            preserveAspectRatio="none"
            className="h-full w-full overflow-visible"
            focusable="false"
          >
            <g className="text-base-content/10">
              {GRID_Y.map((y) => (
                <line
                  key={y}
                  x1={0}
                  y1={y}
                  x2={CHART_W}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>

            <path
              d={COMPARE_LINE}
              fill="none"
              stroke="currentColor"
              className="text-base-content/25"
              strokeWidth={1.5}
              strokeDasharray="4 5"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />

            <path
              d={TREND_AREA}
              fill="var(--color-primary)"
              fillOpacity={0.1}
            />
            <path
              d={TREND_LINE}
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {/* The head of the line, ringed in the panel's own surface so it
              reads as a marker sitting on top rather than a kink in the path. */}
            <circle
              cx={CHART_W}
              cy={TREND_END_Y}
              r={3}
              fill="var(--color-primary)"
              stroke="var(--color-base-100)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>

        {/* Stand-in for the axis labels. */}
        <div className="mt-3 flex items-center justify-between">
          {[0, 1, 2, 3, 4, 5].map((tick) => (
            <span
              key={tick}
              className="block h-1 w-5 rounded-full bg-base-content/10"
            />
          ))}
        </div>
      </div>

      {/* List band: rows of something ranked, with a small meter on each. */}
      <div className="divide-y divide-base-300">
        {LIST_ROWS.map((row) => (
          <div key={row.key} className="flex items-center gap-3 px-4 py-3">
            <span
              className={`block size-1.5 shrink-0 rounded-full ${row.dot}`}
            />
            <span
              className={`block h-1.5 rounded-full bg-base-content/15 ${row.label}`}
            />
            <span className="ml-auto flex h-5 w-16 shrink-0 items-center rounded border border-base-300 bg-base-200 px-1">
              <span
                className={`block h-1.5 rounded-full bg-base-content/20 ${row.meter}`}
              />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
