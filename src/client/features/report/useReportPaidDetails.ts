import { getDomainKeywordsPage } from "@/serverFunctions/domain";
import {
  getBacklinksReferringDomains,
  getBacklinksRows,
} from "@/serverFunctions/backlinks";
import {
  BACKLINKS_DEFAULT_SORT,
  DEFAULT_BACKLINKS_PAGE_SIZE,
} from "@/types/schemas/backlinks";
import { DEFAULT_DOMAIN_KEYWORDS_PAGE_SIZE } from "@/types/schemas/domain";
import {
  createMeteredRunKey,
  useAuthorizedRun,
  useMeteredQuery,
} from "@/client/lib/useMeteredQuery";
import { DEFAULT_LOCATION_CODE } from "@/shared/keyword-locations";
import { getLanguageCode } from "@/client/features/keywords/utils";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

/**
 * The two metered detail requests the report can make, behind the toolbar's
 * paid-request buttons.
 *
 * Split out of `useClientReportData` for size only — nothing here runs until
 * someone presses one of those buttons, which is the whole reason the keys go
 * through `useAuthorizedRun`.
 */
export function useReportPaidDetails(projectId: string, domain: string | null) {
  const hasDomain = Boolean(domain);
  const keywordDetailsRun = useAuthorizedRun(
    createMeteredRunKey(
      projectId,
      domain,
      true,
      DEFAULT_LOCATION_CODE,
      getLanguageCode(DEFAULT_LOCATION_CODE),
      1,
      DEFAULT_DOMAIN_KEYWORDS_PAGE_SIZE,
      "traffic",
      "desc",
      {},
    ),
  );
  const keywordDetailsQuery = useMeteredQuery({
    authorized: keywordDetailsRun.authorized,
    runNonce: keywordDetailsRun.runNonce,
    enabled: hasDomain,
    queryKey: ["report-domain-keywords", projectId, domain],
    queryFn: () =>
      getDomainKeywordsPage({
        data: {
          projectId,
          domain: domain ?? "",
          includeSubdomains: true,
          locationCode: DEFAULT_LOCATION_CODE,
          languageCode: getLanguageCode(DEFAULT_LOCATION_CODE),
          page: 1,
          pageSize: DEFAULT_DOMAIN_KEYWORDS_PAGE_SIZE,
          sortMode: "traffic",
          sortOrder: "desc",
          filters: {},
        },
      }),
  });

  const backlinkDetailsRun = useAuthorizedRun(
    createMeteredRunKey(
      projectId,
      domain,
      "domain",
      1,
      DEFAULT_BACKLINKS_PAGE_SIZE,
      BACKLINKS_DEFAULT_SORT.backlinks,
      BACKLINKS_DEFAULT_SORT.domains,
    ),
  );
  const backlinkRowsQuery = useMeteredQuery({
    authorized: backlinkDetailsRun.authorized,
    runNonce: backlinkDetailsRun.runNonce,
    enabled: hasDomain,
    queryKey: ["report-backlink-rows", projectId, domain],
    queryFn: () =>
      getBacklinksRows({
        data: {
          projectId,
          target: domain ?? "",
          scope: "domain",
          page: 1,
          pageSize: DEFAULT_BACKLINKS_PAGE_SIZE,
          sortField: BACKLINKS_DEFAULT_SORT.backlinks.field,
          sortOrder: BACKLINKS_DEFAULT_SORT.backlinks.order,
          filters: {},
          mode: "one_per_domain",
        },
      }),
  });
  const referringDomainsQuery = useMeteredQuery({
    authorized: backlinkDetailsRun.authorized,
    runNonce: backlinkDetailsRun.runNonce,
    enabled: hasDomain,
    queryKey: ["report-referring-domains", projectId, domain],
    queryFn: () =>
      getBacklinksReferringDomains({
        data: {
          projectId,
          target: domain ?? "",
          scope: "domain",
          page: 1,
          pageSize: DEFAULT_BACKLINKS_PAGE_SIZE,
          sortField: BACKLINKS_DEFAULT_SORT.domains.field,
          sortOrder: BACKLINKS_DEFAULT_SORT.domains.order,
          filters: {},
        },
      }),
  });

  return {
    keywordDetailsMissing: hasDomain && keywordDetailsQuery.data == null,
    backlinkDetailsMissing:
      hasDomain &&
      (backlinkRowsQuery.data == null || referringDomainsQuery.data == null),
    keywordDetailsLoading: keywordDetailsQuery.isFetching,
    backlinkDetailsLoading:
      backlinkRowsQuery.isFetching || referringDomainsQuery.isFetching,
    // The message is for the on-screen banner; the printed sheet gets the
    // neutral sentence in `reportReads` instead, because a provider's raw error
    // text is not something to hand a client.
    keywordDetailsError: keywordDetailsQuery.isError
      ? getStandardErrorMessage(
          keywordDetailsQuery.error,
          "Could not load keyword details.",
        )
      : null,
    backlinkDetailsError:
      backlinkRowsQuery.isError || referringDomainsQuery.isError
        ? getStandardErrorMessage(
            backlinkRowsQuery.error ?? referringDomainsQuery.error,
            "Could not load backlink details.",
          )
        : null,
    refreshKeywordDetails: keywordDetailsRun.authorize,
    refreshBacklinkDetails: backlinkDetailsRun.authorize,
    rankings: (keywordDetailsQuery.data?.keywords ?? []).slice(0, 10),
    suggestions: (keywordDetailsQuery.data?.keywords ?? [])
      .filter((row) => row.position == null || row.position > 10)
      .slice(0, 10)
      .map((row) => ({
        keyword: row.keyword,
        searchVolume: row.searchVolume,
        keywordDifficulty: row.keywordDifficulty,
        cpc: row.cpc,
      })),
    backlinkRows: (backlinkRowsQuery.data?.rows ?? []).slice(0, 10),
    referringDomains: (referringDomainsQuery.data?.rows ?? []).slice(0, 10),
  };
}
