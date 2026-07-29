/**
 * Shared because both halves of the comparison need the same answer: the server
 * correlates DataForSEO's echoed targets against the ones it sent, and the
 * client de-duplicates competitor chips before they are ever submitted. If the
 * two sides normalized differently, `example.com` and `www.example.com` would
 * become two rows for one site.
 *
 * Lives in `shared/` rather than in the service so the client can import it
 * without pulling the DataForSEO SDK into the browser bundle.
 */
export function normalizeComparisonTarget(
  value: string | null | undefined,
): string {
  return (value ?? "")
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}
