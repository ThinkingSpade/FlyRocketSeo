type QueryState = { isError: boolean; isPending: boolean };

export type TechnicalAuditState =
  | "loading"
  | "not-run"
  | "unavailable"
  | "empty"
  | "ready";

/** A disabled TanStack query is pending without fetching. Check whether there
 * is an audit to load BEFORE considering the dependent query's pending flag.
 * Empty evidence and unavailable evidence must not become a healthy zero.
 */
export function getTechnicalAuditState(
  history: QueryState,
  audit: QueryState,
  latestAuditId: string | undefined,
  pages: readonly unknown[] | undefined,
): TechnicalAuditState {
  if (history.isError) return "unavailable";
  if (history.isPending) return "loading";
  if (latestAuditId == null) return "not-run";
  if (audit.isError) return "unavailable";
  if (audit.isPending) return "loading";
  if (pages == null) return "unavailable";
  return pages.length === 0 ? "empty" : "ready";
}
