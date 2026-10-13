/** Counts are observations, never rounded estimates or defaulted absence. */
export function providerCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

/** Backlinks requests explicitly select DataForSEO's one_hundred rank scale. */
export function providerHundredScore(value: unknown): number | null {
  const count = providerCount(value);
  return count !== null && count <= 100 ? count : null;
}

export function providerDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
    ? date
    : null;
}

export function providerTimestamp(value: unknown): string | null {
  if (!providerDate(value) || typeof value !== "string") return null;
  if (value.length === 10) return value;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
