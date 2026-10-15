/**
 * Domain overviews run in this mounted session, and which one answers the
 * search the URL (the active tab) names. Same model as Keyword Research's
 * keywordSessionRuns.ts: every submit is remembered with the nonce its
 * (metered) query is cached under, the URL picks which one is on screen, and
 * only the run just submitted may fetch -- an earlier tab reads the cache, so
 * switching tabs never spends.
 */

export type DomainSessionRun = {
  input: {
    domain: string;
    includeSubdomains: boolean;
    locationCode: number;
    languageCode: string;
  };
  nonce: number;
};

/** The search the URL names. */
type DomainSearchScope = {
  domain: string;
  includeSubdomains: boolean;
  locationCode: number;
};

/** Runs a session remembers for tab switching (more than the tab strip holds). */
export const MAX_DOMAIN_SESSION_RUNS = 20;

function sameDomain(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function recordDomainSessionRun(
  runs: readonly DomainSessionRun[],
  run: DomainSessionRun,
): DomainSessionRun[] {
  return [...runs, run].slice(-MAX_DOMAIN_SESSION_RUNS);
}

/**
 * The newest session run for exactly the search the URL names. Null when the
 * URL names none, or names one this session never ran -- which must stay
 * visibly unrun, never borrow another domain's overview.
 */
export function findDomainSessionRun(
  runs: readonly DomainSessionRun[],
  scope: DomainSearchScope | null,
): DomainSessionRun | null {
  if (!scope || !scope.domain.trim()) return null;
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const run = runs[index];
    if (
      run &&
      sameDomain(run.input.domain, scope.domain) &&
      run.input.includeSubdomains === scope.includeSubdomains &&
      run.input.locationCode === scope.locationCode
    ) {
      return run;
    }
  }
  return null;
}

/**
 * Whether a stored past run may stand in for what the URL names: any run when
 * the URL names no domain, otherwise only a run for that domain AND market --
 * the overview's numbers are per market, so a US run must not appear under a
 * UK search. A run stored before its market was recorded is unknown, and does
 * not stand in for a specific one.
 */
export function storedDomainAnswers(
  url: { domain: string; locationCode: number },
  stored: { domain: string; locationCode: number | null },
): boolean {
  if (!url.domain.trim()) return true;
  return (
    sameDomain(url.domain, stored.domain) &&
    stored.locationCode === url.locationCode
  );
}
