import { useMemo, useSyncExternalStore } from "react";

/**
 * Resolved colour values for ECharts.
 *
 * This exists because of one difference from the Recharts charts these replaced,
 * and it is why their `chartTheme.ts` constants could not simply be carried
 * over. Recharts wrote colours out as SVG presentation attributes, so
 * `fill="var(--color-base-content)"` worked: the browser resolved the variable
 * at paint time, per theme, for free. ECharts computes styles in JavaScript and
 * hands its renderer concrete values, so anything it cannot parse itself renders
 * black or not at all.
 *
 * Two things it cannot parse, both of which this app's tokens are made of:
 *
 *   - `var(...)`. Worse, reading the variable directly does not help —
 *     getComputedStyle returns a custom property's SPECIFIED value, not its
 *     resolved one, so `--color-base-content` comes back as the literal string
 *     "light-dark(oklch(...), oklch(...))".
 *   - `color-mix()` and `light-dark()`, which zrender's colour parser has no
 *     concept of.
 *
 * So the values are measured rather than read: a probe element gets the token
 * applied to a real colour property, and getComputedStyle on THAT returns a
 * single resolved colour instead of an expression.
 *
 * Then converted, because measuring is not enough. Chrome preserves the source
 * colour space, so `color-mix(in oklab, ...)` measures back as
 * `oklab(0.452805 0.0373447 -0.210475 / 0.32)`, and zrender's colour parser
 * predates those functions: `parse()` returns undefined for both `oklab()` and
 * `oklch()`.
 *
 * Registering the SVG renderer is NOT a defence against that, which is the
 * assumption this file was originally written on. SVG only covers PAINTING —
 * the colour goes into an attribute and the browser parses it. zrender still
 * parses colours in JavaScript on the ANIMATION path, whichever renderer is
 * mounted, and there an unparseable colour is a crash rather than a fallback:
 * hovering an area chart whose gradient stops were `oklab()` threw
 * `Cannot read properties of undefined` out of `interpolate1DArray` on every
 * frame, ~70 times a second, for the life of the page.
 *
 * So each measured colour is round-tripped through a 1x1 canvas and read back
 * as pixels, which yields plain `rgba()`. Canvas stores pixels premultiplied,
 * so a translucent colour comes back off by a few 1/255 in the channels — an
 * error bounded by the alpha itself, and therefore invisible exactly when it
 * happens. Reading `ctx.fillStyle` back instead would be exact but useless:
 * Chrome returns modern colour functions from it verbatim.
 */

type ChartTheme = {
  /** Axis tick labels and other chart text. */
  text: string;
  /** Grid lines and axis rules — the text colour at low alpha. */
  line: string;
  /** The hover crosshair, which sits above the grid and so is stronger than it.
   *  30%, the value the Recharts charts used for the same cursor. */
  crosshair: string;
  /** Series colour for single-series charts. */
  brand: string;
  /** Panel behind the chart, for tooltip backgrounds. */
  surface: string;
  /** Top and bottom stops of the gradient under an area series. Read from the
   *  --trend-fill-*-opacity tokens the Recharts charts used, so an area chart's
   *  fill came through the swap unchanged. */
  brandFillStart: string;
  brandFillEnd: string;
  /** True when the dark theme is active — Kumo's Chart takes this directly. */
  isDark: boolean;
};

const FALLBACK: ChartTheme = {
  text: "rgb(23, 32, 51)",
  line: "rgba(23, 32, 51, 0.12)",
  crosshair: "rgba(23, 32, 51, 0.3)",
  brand: "rgb(73, 52, 199)",
  surface: "rgb(255, 255, 255)",
  brandFillStart: "rgba(73, 52, 199, 0.32)",
  brandFillEnd: "rgba(73, 52, 199, 0.05)",
  isDark: false,
};

/** Collapse a colour expression to a single `rgba()` colour: the browser
 *  resolves it on a real element, then a canvas pixel strips the colour space
 *  back to something zrender can parse. */
function resolve(
  probe: HTMLElement,
  ctx: CanvasRenderingContext2D | null,
  expression: string,
  fallback: string,
) {
  probe.style.color = "";
  probe.style.color = expression;
  // An unparseable expression leaves the property unset rather than throwing.
  if (probe.style.color === "") return fallback;
  const value = getComputedStyle(probe).color;
  if (value === "") return fallback;
  if (!ctx) return value;

  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = ctx.getImageData(0, 0, 1, 1).data;
  if (red === undefined || green === undefined || blue === undefined) {
    return fallback;
  }
  return `rgba(${red}, ${green}, ${blue}, ${((alpha ?? 255) / 255).toFixed(3)})`;
}

function readNumber(
  styles: CSSStyleDeclaration,
  name: string,
  fallback: number,
) {
  const parsed = Number.parseFloat(styles.getPropertyValue(name));
  return Number.isFinite(parsed) ? parsed : fallback;
}

let cached: ChartTheme = FALLBACK;
let cacheKey: string | null = null;

function readTheme(): ChartTheme {
  if (typeof document === "undefined") return FALLBACK;

  const root = document.documentElement;
  const key = root.getAttribute("data-theme") ?? "";
  // useSyncExternalStore compares snapshots by identity, so returning a fresh
  // object on every call would loop forever. Recompute only on a theme change.
  if (key === cacheKey) return cached;

  // Inside the document so it inherits the active theme, but never painted.
  const probe = document.createElement("span");
  probe.style.display = "none";
  root.appendChild(probe);
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  try {
    const styles = getComputedStyle(root);
    const text = resolve(
      probe,
      ctx,
      "var(--color-base-content)",
      FALLBACK.text,
    );
    const brand = resolve(probe, ctx, "var(--color-primary)", FALLBACK.brand);
    cached = {
      text,
      // The 12% grid opacity the Recharts charts used.
      line: resolve(
        probe,
        ctx,
        `color-mix(in oklab, ${text} 12%, transparent)`,
        FALLBACK.line,
      ),
      crosshair: resolve(
        probe,
        ctx,
        `color-mix(in oklab, ${text} 30%, transparent)`,
        FALLBACK.crosshair,
      ),
      brand,
      surface: resolve(probe, ctx, "var(--color-base-100)", FALLBACK.surface),
      // These two tokens are plain numbers rather than colours, so unlike the
      // colours above they can be read straight off the custom property — a
      // literal's specified value is its resolved one.
      brandFillStart: resolve(
        probe,
        ctx,
        `color-mix(in oklab, ${brand} ${readNumber(styles, "--trend-fill-start-opacity", 0.32) * 100}%, transparent)`,
        FALLBACK.brandFillStart,
      ),
      brandFillEnd: resolve(
        probe,
        ctx,
        `color-mix(in oklab, ${brand} ${readNumber(styles, "--trend-fill-end-opacity", 0.05) * 100}%, transparent)`,
        FALLBACK.brandFillEnd,
      ),
      isDark: key.endsWith("-dark"),
    };
    cacheKey = key;
  } finally {
    probe.remove();
  }

  return cached;
}

function subscribe(onChange: () => void) {
  if (typeof window === "undefined") return () => {};

  // data-theme is set by useThemePreference and by the inline boot script.
  // Observing the attribute catches both without either having to announce
  // itself, and catches anything that sets it in future.
  const observer = new MutationObserver(() => {
    cacheKey = null;
    onChange();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  return () => observer.disconnect();
}

export function useChartTheme(): ChartTheme {
  return useSyncExternalStore(subscribe, readTheme, () => FALLBACK);
}

/**
 * The axis, grid and tooltip shell every chart shares, so fourteen of them do
 * not each re-describe what an axis looks like.
 */
export function useChartBase(theme: ChartTheme) {
  return useMemo(
    () => ({
      // `outerBoundsMode`/`outerBoundsContain` rather than `containLabel: true`,
      // which ECharts 6 deprecated and warns about once per chart. The docs give
      // this pair as its exact equivalent, and the new mechanism measures the
      // labels instead of estimating them from a sample.
      grid: {
        left: 8,
        right: 8,
        top: 16,
        bottom: 8,
        outerBoundsMode: "same" as const,
        outerBoundsContain: "axisLabel" as const,
      },
      textStyle: { color: theme.text, fontSize: 10 },
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: theme.surface,
        borderColor: theme.line,
        textStyle: { color: theme.text, fontSize: 12 },
        // ECharts' default crosshair is a fixed mid-grey, which is the exact
        // problem the old chart tokens existed to fix: a single grey reads as
        // disabled on the dark surface and misses contrast on the light one.
        // Same 30% the Recharts cursor used, off the same token.
        axisPointer: { lineStyle: { color: theme.crosshair } },
      },
      axisCommon: {
        axisLine: { lineStyle: { color: theme.line } },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: theme.line } },
        axisLabel: { color: theme.text, opacity: 0.6, fontSize: 10 },
      },
    }),
    [theme],
  );
}
