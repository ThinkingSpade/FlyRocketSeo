import type { Opportunity } from "@/client/features/opportunities/opportunityModel";
type Action = {
  title: string;
  reason: string;
  url: string;
  source: "Stored crawl" | "Google Search Console";
};
export function buildDashboardActions(
  domain: string | null,
  pages: { url: string; statusCode: number | null }[],
  ranked: Opportunity[],
): Action[] {
  if (!domain) return [];
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(domain) ? domain : `https://${domain}`)
      .hostname;
  } catch {
    return [];
  }
  const ownPage = (url: string) => {
    try {
      return new URL(url).hostname === host;
    } catch {
      return false;
    }
  };
  const actions: Action[] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    if (
      !ownPage(page.url) ||
      !Number.isInteger(page.statusCode) ||
      page.statusCode == null ||
      page.statusCode < 400 ||
      page.statusCode > 599 ||
      seen.has(page.url)
    )
      continue;
    seen.add(page.url);
    actions.push({
      title: `Investigate HTTP ${page.statusCode}`,
      reason:
        "A stored crawl captured a failed response. Review its current state and intended accessibility.",
      url: page.url,
      source: "Stored crawl",
    });
  }
  for (const row of ranked) {
    if (!ownPage(row.page) || seen.has(row.page)) continue;
    seen.add(row.page);
    actions.push({
      title: `Review ${row.query}`,
      reason: `${row.impressions.toLocaleString()} observed impressions; average position ${row.position.toFixed(1)}. Investigate query intent, title and relevant internal links.`,
      url: row.page,
      source: "Google Search Console",
    });
  }
  return actions;
}
