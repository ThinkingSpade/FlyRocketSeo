/**
 * Narrowing for ECharts tooltip formatter arguments.
 *
 * ECharts types the formatter's parameter as `any`, and hands it either a
 * single object or an array of them depending on the tooltip's `trigger`. The
 * lint config forbids asserting `any` into a shape, so the fields these charts
 * actually read are checked rather than claimed. That is worth doing once here
 * instead of at fourteen call sites, all of which want the same three fields.
 */

type TooltipRow = {
  /** The category or time value on the x-axis. */
  axisValue: string;
  /** The series' value at that point. `null` where the series has a gap. */
  value: number | null;
  /** Series display name, for multi-series tooltips. */
  seriesName: string;
  /** The series' assigned colour, for the legend dot. */
  color: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Array.isArray narrows to `any[]`, so indexing it yields `any` and trips the
 *  lint config. This predicate narrows to `unknown[]` instead. */
function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function toRow(candidate: unknown): TooltipRow | null {
  if (!isRecord(candidate)) return null;

  // ECharts sends the y-value as `value` for most series, but as a [x, y] pair
  // for scatter and any series on a value-value grid.
  const raw = isUnknownArray(candidate.value)
    ? candidate.value.at(-1)
    : candidate.value;

  return {
    axisValue:
      typeof candidate.axisValue === "string"
        ? candidate.axisValue
        : typeof candidate.name === "string"
          ? candidate.name
          : "",
    value: typeof raw === "number" ? raw : null,
    seriesName:
      typeof candidate.seriesName === "string" ? candidate.seriesName : "",
    color: typeof candidate.color === "string" ? candidate.color : "",
  };
}

/** Every series row at the hovered point, in series order. */
export function tooltipRows(params: unknown): TooltipRow[] {
  const list = isUnknownArray(params) ? params : [params];
  return list.map(toRow).filter((row): row is TooltipRow => row !== null);
}
