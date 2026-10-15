import { ArrowSquareOut } from "@phosphor-icons/react";

/**
 * Free, keyless places to vet a dropped domain before paying for it.
 *
 * Links rather than lookups on purpose. The archive is the only way to see
 * what the domain used to BE -- a vending blog, or a casino doorway page -- and
 * a person has to look at it. Google's `site:` answer is not offered by any API
 * this app pays for, and scraping Google from a Worker is both against its
 * terms and unreliable, so the honest version is a one-click search.
 */
export function waybackHistoryUrl(domain: string): string {
  return `https://web.archive.org/web/*/${encodeURIComponent(domain)}`;
}

export function googleSiteSearchUrl(domain: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`site:${domain}`)}`;
}

const LINK_CLASS =
  "inline-flex items-center gap-0.5 text-xs text-base-content/70 hover:text-base-content hover:underline";

export function DomainVetLinks({ domain }: { domain: string }) {
  return (
    <span className="inline-flex items-center gap-3 whitespace-nowrap">
      <a
        className={LINK_CLASS}
        href={waybackHistoryUrl(domain)}
        target="_blank"
        rel="noreferrer"
        title={`What ${domain} used to host, on the Wayback Machine`}
      >
        History
        <ArrowSquareOut className="size-3 shrink-0" />
      </a>
      <a
        className={LINK_CLASS}
        href={googleSiteSearchUrl(domain)}
        target="_blank"
        rel="noreferrer"
        title={`site:${domain} on Google — no results can mean deindexed`}
      >
        Google
        <ArrowSquareOut className="size-3 shrink-0" />
      </a>
    </span>
  );
}
