type TechnicalIssueKey =
  | "status"
  | "redirect"
  | "unverified"
  | "title"
  | "meta"
  | "h1"
  | "thin"
  | "alt";

type TechnicalIssue = {
  key: TechnicalIssueKey;
  label: string;
  description: string;
  severity: "high" | "medium" | "low";
  pageCount: number;
  examples: string[];
};

type AuditPageRow = {
  url: string;
  statusCode: number | null;
  title: string | null;
  metaDescription: string | null;
  h1Count: number;
  wordCount: number;
  imagesMissingAlt: number;
};

const EXAMPLE_LIMIT = 3;
const SHORT_CONTENT_WORDS = 300;

const definitions: Array<{
  key: TechnicalIssueKey;
  label: string;
  description: string;
  severity: TechnicalIssue["severity"];
  matches: (page: AuditPageRow) => boolean;
}> = [
  {
    key: "status",
    label: "Failed HTTP responses",
    description:
      "Investigate these 4xx or 5xx responses and whether the URLs should remain accessible.",
    severity: "high",
    matches: (page) =>
      page.statusCode != null &&
      Number.isInteger(page.statusCode) &&
      page.statusCode >= 400 &&
      page.statusCode <= 599,
  },
  {
    key: "redirect",
    label: "Redirects and non-content responses to review",
    description:
      "Check the response and intended destination. A redirect is not inherently an SEO error.",
    severity: "medium",
    matches: (page) =>
      page.statusCode != null &&
      Number.isInteger(page.statusCode) &&
      page.statusCode >= 300 &&
      page.statusCode < 400,
  },
  {
    key: "unverified",
    label: "Full-page fetch evidence unavailable",
    description:
      "No complete 200 response was recorded. Retry or inspect the fetch before diagnosing metadata.",
    severity: "medium",
    matches: (page) =>
      page.statusCode !== 200 &&
      !(
        page.statusCode != null &&
        Number.isInteger(page.statusCode) &&
        page.statusCode >= 300 &&
        page.statusCode <= 599
      ),
  },
  {
    key: "title",
    label: "Missing page title",
    description:
      "Review the captured page and provide a clear, descriptive title where appropriate.",
    severity: "high",
    matches: (page) =>
      page.statusCode === 200 && (page.title ?? "").trim() === "",
  },
  {
    key: "meta",
    label: "Missing meta description",
    description:
      "Consider a page-specific summary. Search engines may still choose a different snippet.",
    severity: "medium",
    matches: (page) =>
      page.statusCode === 200 && (page.metaDescription ?? "").trim() === "",
  },
  {
    key: "h1",
    label: "Primary heading to review",
    description:
      "Review the page's main heading. Multiple H1 elements are not automatically an SEO error.",
    severity: "medium",
    matches: (page) => page.statusCode === 200 && page.h1Count !== 1,
  },
  {
    key: "thin",
    label: "Short content to review",
    description: `Under ${SHORT_CONTENT_WORDS} captured words. Review usefulness and intent; word count alone does not establish an SEO problem.`,
    severity: "medium",
    matches: (page) =>
      page.statusCode === 200 &&
      page.wordCount > 0 &&
      page.wordCount < SHORT_CONTENT_WORDS,
  },
  {
    key: "alt",
    label: "Image alternatives to review",
    description:
      "Check informative images for descriptive alternatives; decorative images may correctly use empty alt text.",
    severity: "low",
    matches: (page) => page.statusCode === 200 && page.imagesMissingAlt > 0,
  },
];

/** Count distinct affected URLs, not category totals or capped display examples.
 * Exact URLs are retained: query strings and trailing slashes may be different
 * pages, and treating them as equivalent requires canonical evidence.
 */
export function summarizeTechnicalIssues(pages: AuditPageRow[]): {
  issues: TechnicalIssue[];
  affectedPages: number;
} {
  const affectedUrls = new Set<string>();
  const issues = definitions
    .map((definition) => {
      const urls = [
        ...new Set(pages.filter(definition.matches).map((page) => page.url)),
      ];
      for (const url of urls) affectedUrls.add(url);
      return {
        key: definition.key,
        label: definition.label,
        description: definition.description,
        severity: definition.severity,
        pageCount: urls.length,
        examples: urls.slice(0, EXAMPLE_LIMIT),
      };
    })
    .filter((issue) => issue.pageCount > 0)
    .toSorted((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 } as const;
      return rank[a.severity] - rank[b.severity] || b.pageCount - a.pageCount;
    });
  return { issues, affectedPages: affectedUrls.size };
}

/** Compatibility for consumers that need only the category list. */
export function buildTechnicalIssues(pages: AuditPageRow[]): TechnicalIssue[] {
  return summarizeTechnicalIssues(pages).issues;
}
