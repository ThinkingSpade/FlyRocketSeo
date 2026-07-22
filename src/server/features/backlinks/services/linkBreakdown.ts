/**
 * DataForSEO returns the country and link-type splits as objects keyed by
 * label (`{ BE: 1720, NL: 8 }`). Flatten them into a ranked list the report can
 * render directly.
 *
 * Entries without a usable count are dropped rather than shown as zero — a
 * label with nothing behind it is noise in a client deliverable. Ties break on
 * label so the ordering is deterministic between runs.
 */
export function toLinkBreakdown(
  raw: Record<string, number | null> | null | undefined,
  limit: number,
): Array<{ label: string; value: number }> {
  if (!raw) return [];

  return Object.entries(raw)
    .flatMap(([label, value]) =>
      value != null && value > 0 ? [{ label, value }] : [],
    )
    .toSorted((a, b) =>
      b.value !== a.value ? b.value - a.value : a.label.localeCompare(b.label),
    )
    .slice(0, limit);
}
