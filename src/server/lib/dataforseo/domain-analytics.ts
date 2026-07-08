import { z } from "zod";
import {
  DomainAnalyticsTechnologiesDomainTechnologiesLiveRequestInfo,
  DomainAnalyticsWhoisOverviewLiveRequestInfo,
  type DomainAnalyticsTechnologiesDomainTechnologiesLiveResultInfo,
} from "dataforseo-client";
import { domainAnalyticsApi } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  type DataforseoApiResponse,
} from "@/server/lib/dataforseo/envelope";

// Domain Analytics: detected technology stack and WHOIS records enriched with
// SEO metrics.

type DomainTechnologiesResult =
  DomainAnalyticsTechnologiesDomainTechnologiesLiveResultInfo;

export async function fetchDomainTechnologies(input: {
  target: string;
}): Promise<DataforseoApiResponse<DomainTechnologiesResult | null>> {
  const response =
    await domainAnalyticsApi().technologiesDomainTechnologiesLive([
      new DomainAnalyticsTechnologiesDomainTechnologiesLiveRequestInfo({
        target: input.target,
      }),
    ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  return {
    data: task.result?.[0] ?? null,
    billing: buildTaskBilling(task),
  };
}

const whoisItemSchema = z
  .object({
    domain: z.string().nullable().optional(),
    created_datetime: z.string().nullable().optional(),
    changed_datetime: z.string().nullable().optional(),
    expiration_datetime: z.string().nullable().optional(),
    updated_datetime: z.string().nullable().optional(),
    first_seen: z.string().nullable().optional(),
    registered: z.boolean().nullable().optional(),
    registrar: z.string().nullable().optional(),
    tld: z.string().nullable().optional(),
    epp_status_codes: z.array(z.string()).nullable().optional(),
  })
  .passthrough();

type DomainWhoisItem = z.infer<typeof whoisItemSchema>;

export async function fetchDomainWhois(input: {
  domain: string;
}): Promise<DataforseoApiResponse<DomainWhoisItem | null>> {
  const response = await domainAnalyticsApi().whoisOverviewLive([
    new DomainAnalyticsWhoisOverviewLiveRequestInfo({
      // The whois endpoint is a filterable database; an exact-domain filter
      // turns it into a single-domain lookup.
      filters: [["domain", "=", input.domain]],
      limit: 1,
    }),
  ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  const first = task.result?.[0]?.items?.[0];
  const parsed = whoisItemSchema.safeParse(first ?? {});
  return {
    data: first && parsed.success ? parsed.data : null,
    billing: buildTaskBilling(task),
  };
}
