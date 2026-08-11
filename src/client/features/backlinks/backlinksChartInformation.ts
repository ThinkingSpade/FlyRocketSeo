export type NumericSeriesInformation =
  | { kind: "insufficient" }
  | { kind: "all-null" }
  | { kind: "all-zero" }
  | { kind: "constant"; value: number }
  | { kind: "varying" };

/** Classify whether a nullable numeric series contains enough information to plot. */
export function classifyNumericSeries(
  values: ReadonlyArray<number | null | undefined>,
): NumericSeriesInformation {
  if (values.length === 0) {
    return { kind: "insufficient" };
  }

  const usable = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );

  if (usable.length === 0) {
    return { kind: "all-null" };
  }

  if (usable.length < 2) {
    return { kind: "insufficient" };
  }

  if (usable.every((value) => value === 0)) {
    return { kind: "all-zero" };
  }

  const first = usable[0];
  if (usable.every((value) => value === first)) {
    return { kind: "constant", value: first };
  }

  return { kind: "varying" };
}
