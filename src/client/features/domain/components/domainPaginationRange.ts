const format = (value: number) => value.toLocaleString("en-US");

/** Describe actual returned records without inventing an unknown total. */
export function domainPaginationRange(
  page: number,
  pageSize: number,
  total: number | null,
  rows: number,
): string {
  if (rows === 0) {
    if (total === 0) return "0 results";
    return `0 results on this page · ${total === null ? "total unavailable" : `${format(total)} total`}`;
  }
  const start = (page - 1) * pageSize + 1;
  const end = start + rows - 1;
  const suffix =
    total !== null && total >= end
      ? ` of ${format(total)}`
      : " · total unavailable";
  return `${format(start)}–${format(end)}${suffix}`;
}
