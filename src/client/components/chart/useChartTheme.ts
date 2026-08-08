import { useMemo, useSyncExternalStore } from "react";

/**
 * Resolved colour values for ECharts.
 *
 * This exists because of one difference from Recharts, and it is why
 * chartTheme.ts cannot simply be reused. Recharts writes colours out as SVG
 * presentation attributes, so `fill="var(--color-base-content)"` works: the
 * browser resolves the variable at paint time, per theme, for free. ECharts
 * computes styles in JavaScript and hands its renderer concrete values, so
 * anything it cannot parse itself renders black or not at all.
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
 * What it returns is NOT always `rgb()`. Chrome preserves the source colour
 * space, so these come back as `oklch(...)` and `oklab(...)`. That is fine here
 * only because echarts.ts registers the SVG renderer, which writes colours into
 * SVG attributes for the browser to parse. Under the canvas renderer zrender
 * would have to parse them itself and every one of these would fail.
 */

type ChartTheme = {
  /** Axis tick labels and other chart text. */
  text: string;
  /** Grid lines and axis rules — the text colour at low alpha. */
  line: string;
  /** Series colour for single-series charts. */
  brand: string;
  /** Panel behind the chart, for tooltip backgrounds. */
  surface: string;
  /** Top and bottom stops of the gradient under an area series. Read from the
   *  --trend-fill-*-opacity tokens the Recharts charts already used, so an
   *  area chart's fill is unchanged by the swap. */
  brandFillStart: string;
  brandFillEnd: string;
  /** True when the dark theme is active — Kumo's Chart takes this directly. */
  isDark: boolean;
};

const FALLBACK: ChartTheme = {
  text: "rgb(23, 32, 51)",
  line: "rgba(23, 32, 51, 0.12)",
  brand: "rgb(73, 52, 199)",
  surface: "rgb(255, 255, 255)",
  brandFillStart: "rgba(73, 52, 199, 0.32)",
  brandFillEnd: "rgba(73, 52, 199, 0.05)",
  isDark: false,
};

/** Collapse a colour expression to a single resolved colour, by making the
 *  browser do it on a real element. */
function resolve(probe: HTMLElement, expression: string, fallback: string) {
  probe.style.color = "";
  probe.style.color = expression;
  // An unparseable expression leaves the property unset rather than throwing.
  if (probe.style.color === "") return fallback;
  const value = getComputedStyle(probe).color;
  return value === "" ? fallback : value;
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
  try {
    const styles = getComputedStyle(root);
    const text = resolve(probe, "var(--color-base-content)", FALLBACK.text);
    const brand = resolve(probe, "var(--color-primary)", FALLBACK.brand);
    cached = {
      text,
      // Matches the 12% grid opacity the Recharts charts used, so the two read
      // the same while both exist.
      line: resolve(
        probe,
        `color-mix(in oklab, ${text} 12%, transparent)`,
        FALLBACK.line,
      ),
      brand,
      surface: resolve(probe, "var(--color-base-100)", FALLBACK.surface),
      // These two tokens are plain numbers rather than colours, so unlike the
      // colours above they can be read straight off the custom property — a
      // literal's specified value is its resolved one.
      brandFillStart: resolve(
        probe,
        `color-mix(in oklab, ${brand} ${readNumber(styles, "--trend-fill-start-opacity", 0.32) * 100}%, transparent)`,
        FALLBACK.brandFillStart,
      ),
      brandFillEnd: resolve(
        probe,
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
      grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
      textStyle: { color: theme.text, fontSize: 10 },
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: theme.surface,
        borderColor: theme.line,
        textStyle: { color: theme.text, fontSize: 12 },
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
