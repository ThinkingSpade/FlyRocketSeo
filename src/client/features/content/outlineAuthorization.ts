type OutlineBriefIdentity = {
  keyword: string;
  locationCode: number;
  languageCode: string;
  fetchedAt: string;
  scope?: Record<string, string | number>;
  competitors: readonly { url: string | null }[];
};

/** Consent belongs to the captured brief and URL set, including a pending
 * history selection before its stored result arrives. No effect can reset
 * consent quickly enough to prevent a query during that render. */
export function outlineAuthorizationKey(
  projectId: string,
  brief: OutlineBriefIdentity | null | undefined,
  selectedRunId: string | null,
): string | null {
  if (!brief) return null;
  const urls = [
    ...new Set(
      brief.competitors
        .map((competitor) => competitor.url)
        .filter((url): url is string => Boolean(url)),
    ),
  ].toSorted();
  if (urls.length === 0) return null;
  return JSON.stringify({
    projectId,
    selectedRunId,
    keyword: brief.keyword,
    locationCode: brief.locationCode,
    languageCode: brief.languageCode,
    capturedAt: brief.fetchedAt,
    scope: brief.scope
      ? Object.entries(brief.scope).toSorted(([a], [b]) => a.localeCompare(b))
      : null,
    urls,
  });
}
