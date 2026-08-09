/**
 * Escaping for ECharts tooltip bodies.
 *
 * ECharts formats its tooltip as an HTML STRING rather than rendering a React
 * subtree, so every value interpolated into one is raw markup. React used to
 * escape these for free; a template literal does not. Anything that reaches a
 * tooltip from outside the code — a keyword the user typed, a competitor domain
 * or page path returned by the data provider — has to be escaped by hand.
 *
 * Three charts arrived at an identical private copy of this during the Recharts
 * migration. One copy, because the failure mode of the version that drifts is
 * script injection rather than a wrong-looking label.
 *
 * Only the four characters that can break out of an element body or a
 * double-quoted attribute. `'` is absent deliberately: every attribute these
 * tooltips build is double-quoted, and escaping it would put `&#39;` into
 * ordinary prose.
 */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => HTML_ESCAPES[char] ?? char);
}
