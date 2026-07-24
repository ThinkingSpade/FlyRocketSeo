import { getDomainOverview } from "@/serverFunctions/domain";
import { useMeteredQuery } from "@/client/lib/useMeteredQuery";

type Input = {
  projectId: string;
  domain: string;
  includeSubdomains: boolean;
  locationCode: number;
  languageCode: string;
  authorized: boolean;
};

export function useDomainOverviewQuery(input: Input) {
  const trimmedDomain = input.domain.trim();

  return useMeteredQuery({
    authorized: input.authorized,
    enabled: trimmedDomain !== "",
    queryKey: [
      "domain-overview",
      input.projectId,
      trimmedDomain,
      input.includeSubdomains,
      input.locationCode,
      input.languageCode,
    ],
    queryFn: () =>
      getDomainOverview({
        data: {
          projectId: input.projectId,
          domain: trimmedDomain,
          includeSubdomains: input.includeSubdomains,
          locationCode: input.locationCode,
          languageCode: input.languageCode,
        },
      }),
  });
}
