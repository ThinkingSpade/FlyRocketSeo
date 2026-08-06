import { AppError } from "@/server/lib/errors";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import {
  collectDataforseoHosts,
  collectGscHosts,
  isSubdomainOfApex,
  mergeDiscoveredHosts,
  normalizeHost,
  type DiscoveredHost,
} from "@/server/lib/subdomainHosts";
import { toStoredTimestamp } from "@/server/features/rank-tracking/rankTrackingTimestamps";
import {
  classifyGscAccessFailure,
  GscService,
} from "@/server/features/gsc/services/GscService";
import type { GscAccessFailureReason } from "@/shared/gsc";
import { GSC_ANALYTICS_ROW_CEILING } from "@/server/features/gsc/searchAnalytics";
import { pullWasTruncated } from "@/server/features/gsc/fetchAllRows";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import {
  ProjectSubdomainRepository,
  type DiscoveryMetrics,
  type ProjectSubdomainRow,
} from "@/server/features/projects/repositories/ProjectSubdomainRepository";
import {
  MAX_SUBDOMAINS_PER_PROJECT,
  SUBDOMAIN_GSC_DATE_RANGE,
  type SubdomainDiscoverySource,
  type SubdomainSource,
} from "@/shared/project-subdomains";
import type {
  AddProjectSubdomainInput,
  DiscoverProjectSubdomainsInput,
  RemoveProjectSubdomainsInput,
  SetProjectSubdomainsActiveInput,
} from "@/types/schemas/project-subdomains";

/**
 * How many ranked keywords a DataForSEO discovery pass examines.
 *
 * Discovery reads hosts out of ranked-keyword URLs, so this is a sampling depth,
 * not a result count: the deeper the page, the more long-tail subdomains appear.
 * 1000 is the same order as a Domain Overview page pull, keeping the cost of a
 * discovery run comparable to opening that tab once.
 */
const DISCOVERY_RANKED_KEYWORDS_LIMIT = 1000;

type SubdomainSummary = {
  id: string;
  host: string;
  source: SubdomainSource;
  isActive: boolean;
  organicKeywords: number | null;
  organicTraffic: number | null;
  clicks: number | null;
  impressions: number | null;
  lastSeenAt: string | null;
  createdAt: string;
};

function mapSubdomain(row: ProjectSubdomainRow): SubdomainSummary {
  return {
    id: row.id,
    host: row.host,
    source: row.source,
    isActive: row.isActive,
    organicKeywords: row.organicKeywords,
    organicTraffic: row.organicTraffic,
    clicks: row.clicks,
    impressions: row.impressions,
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
  };
}

/**
 * The project's apex host, or an error explaining what to do about its absence.
 *
 * `projects.domain` is optional and a few legacy rows still carry a scheme, so
 * every path that reasons about "under this project's domain" has to normalize
 * first -- comparing against a raw column value would classify hosts against
 * `https://example.com` and match nothing.
 */
async function requireApex(organizationId: string, projectId: string) {
  const project = await ProjectRepository.getProjectForOrganization(
    projectId,
    organizationId,
  );
  if (!project) {
    throw new AppError("NOT_FOUND", "Project not found");
  }

  const apex = project.domain ? normalizeHost(project.domain) : null;
  if (!apex) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Set the project's domain before adding subdomains",
    );
  }

  return { project, apex };
}

async function listSubdomains(organizationId: string, projectId: string) {
  const project = await ProjectRepository.getProjectForOrganization(
    projectId,
    organizationId,
  );
  if (!project) {
    throw new AppError("NOT_FOUND", "Project not found");
  }

  const rows = await ProjectSubdomainRepository.listForProject(projectId);
  return {
    // Null rather than an error: the settings page renders this list beside the
    // domain field itself, so "no domain set yet" is an ordinary state to show,
    // not a failed read.
    apex: project.domain ? normalizeHost(project.domain) : null,
    subdomains: rows.map(mapSubdomain),
    limit: MAX_SUBDOMAINS_PER_PROJECT,
  };
}

async function addSubdomain(
  organizationId: string,
  input: AddProjectSubdomainInput,
) {
  const { apex } = await requireApex(organizationId, input.projectId);

  const host = normalizeHost(input.host);
  if (!host) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Enter a valid subdomain like blog.example.com",
    );
  }

  if (!isSubdomainOfApex(host, apex)) {
    throw new AppError(
      "VALIDATION_ERROR",
      `${host} is not a subdomain of ${apex}`,
    );
  }

  const existing = await ProjectSubdomainRepository.getByHost(
    input.projectId,
    host,
  );
  if (existing) {
    throw new AppError("CONFLICT", `${host} is already on this project`);
  }

  const total = await ProjectSubdomainRepository.countForProject(
    input.projectId,
  );
  if (total >= MAX_SUBDOMAINS_PER_PROJECT) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Maximum ${MAX_SUBDOMAINS_PER_PROJECT} subdomains per project`,
    );
  }

  const row = await ProjectSubdomainRepository.insert({
    projectId: input.projectId,
    host,
    source: "manual",
  });
  return mapSubdomain(row);
}

async function removeSubdomains(
  organizationId: string,
  input: RemoveProjectSubdomainsInput,
) {
  // Confirms the project belongs to this org before any id-keyed write; the
  // repository then scopes the delete to that project as a second gate.
  await requireProject(organizationId, input.projectId);
  await ProjectSubdomainRepository.removeMany(
    input.projectId,
    input.subdomainIds,
  );
  return { removed: input.subdomainIds.length };
}

async function setSubdomainsActive(
  organizationId: string,
  input: SetProjectSubdomainsActiveInput,
) {
  await requireProject(organizationId, input.projectId);
  await ProjectSubdomainRepository.setActiveMany(
    input.projectId,
    input.subdomainIds,
    input.isActive,
  );
  return { updated: input.subdomainIds.length };
}

async function requireProject(organizationId: string, projectId: string) {
  const project = await ProjectRepository.getProjectForOrganization(
    projectId,
    organizationId,
  );
  if (!project) {
    throw new AppError("NOT_FOUND", "Project not found");
  }
  return project;
}

type SourceRun = {
  hosts: DiscoveredHost[];
  warning: string | null;
};

/**
 * Why the Search Console pass was skipped, phrased as something to act on.
 *
 * Kept as its own map rather than reusing the read-surface copy: those strings
 * describe a tab that cannot render, while these have to explain what a
 * discovery run did NOT look at.
 */
const GSC_SKIP_MESSAGES: Record<GscAccessFailureReason, string> = {
  not_connected:
    "Search Console isn't connected, so it was skipped. Connect a domain property (sc-domain:) to also find subdomains that get impressions but no organic rankings.",
  requires_reconnect:
    "Search Console needs reconnecting, so it was skipped. Reconnect it in Project settings and run discovery again.",
  api_not_configured:
    "The Search Console API isn't enabled for this deployment, so it was skipped.",
  permission_denied:
    "Google refused access to the connected Search Console property, so it was skipped. Check that the connected account still has access to it.",
};

/**
 * Search Console pass. Free -- it spends GSC quota, not credits.
 *
 * Authoritative for ownership in a way the organic pass is not: a host only
 * appears here if it is inside the connected property. That is also its limit --
 * a URL-prefix property reports only its own prefix, so an estate behind one
 * yields nothing and the run says so instead of implying the estate is empty.
 *
 * Every connection or permission failure degrades to a warning instead of
 * propagating. A run asking for both sources must not lose the paid pass because
 * the free one has an expired token -- the user would be left with no results at
 * all, having already spent the credits.
 */
async function discoverFromGsc(
  projectId: string,
  apex: string,
): Promise<SourceRun> {
  try {
    const performance = await GscService.getAnalyticsPerformance({
      projectId,
      dimensions: ["page"],
      dateRange: SUBDOMAIN_GSC_DATE_RANGE,
      rowLimit: GSC_ANALYTICS_ROW_CEILING,
    });

    const hosts = collectGscHosts(performance.rows, apex);
    // GSC returns top rows by clicks, so hitting the ceiling means quiet
    // subdomains may sit below the cut. Saying so is the difference between
    // "these are the ones you have" and "these are the ones we saw".
    const truncated = pullWasTruncated({
      rows: performance.rows,
      request: performance.request,
    });

    return {
      hosts,
      warning: truncated
        ? "Search Console returned its maximum number of pages, so quieter subdomains may be missing. Run discovery again after excluding the ones you already have."
        : null,
    };
  } catch (error) {
    // Returns null for real faults -- 429, 5xx, transport, programming defects --
    // which stay thrown rather than being reported as "skipped".
    const reason = classifyGscAccessFailure(error);
    if (!reason) throw error;
    return { hosts: [], warning: GSC_SKIP_MESSAGES[reason] };
  }
}

/**
 * Organic-search pass. Metered -- this is a billable DataForSEO call.
 *
 * Finds subdomains that rank, whether or not the project owns a Search Console
 * property, which is what makes discovery useful before GSC is connected. It
 * only sees hosts with organic visibility: a staging or internal subdomain that
 * ranks for nothing is invisible here by definition.
 */
async function discoverFromDataforseo(
  apex: string,
  project: { locationCode: number; languageCode: string },
  billingCustomer: BillingCustomerContext,
): Promise<SourceRun> {
  const dataforseo = createDataforseoClient(billingCustomer);
  const response = await dataforseo.domain.rankedKeywords({
    target: apex,
    locationCode: project.locationCode,
    languageCode: project.languageCode,
    limit: DISCOVERY_RANKED_KEYWORDS_LIMIT,
    // The whole point of the pass: without this, DataForSEO returns the apex's
    // own rankings and no subdomain ever appears.
    includeSubdomains: true,
    itemTypes: ["organic"],
    orderBy: ["ranked_serp_element.serp_item.etv,desc"],
  });

  const hosts = collectDataforseoHosts(response.items, apex);
  const totalCount = response.totalCount ?? 0;

  return {
    hosts,
    warning:
      totalCount > DISCOVERY_RANKED_KEYWORDS_LIMIT
        ? `Organic search matched ${totalCount.toLocaleString()} ranking keywords and the top ${DISCOVERY_RANKED_KEYWORDS_LIMIT.toLocaleString()} were scanned, so subdomains that rank only for long-tail terms may be missing.`
        : null,
  };
}

type DiscoverySummary = {
  found: number;
  added: number;
  refreshed: number;
  skipped: number;
  warnings: string[];
  subdomains: SubdomainSummary[];
};

/**
 * Find the project's subdomains and reconcile them into the stored list.
 *
 * Runs each requested source, merges their hosts, then inserts what is new and
 * refreshes what was already there. Existing rows keep their `source` and their
 * `isActive` flag, so re-running is safe: it can only add hosts and improve
 * metrics, never resurrect an exclusion or overwrite a manual entry.
 */
async function discoverSubdomains(
  organizationId: string,
  input: DiscoverProjectSubdomainsInput,
  billingCustomer: BillingCustomerContext,
): Promise<DiscoverySummary> {
  const { project, apex } = await requireApex(organizationId, input.projectId);

  const groups: DiscoveredHost[][] = [];
  const warnings: string[] = [];
  // First source to find a host owns its provenance. GSC runs first and proves
  // ownership, so a host it found stays labelled `gsc` even when the organic
  // pass sees it too.
  const sourceByHost = new Map<string, SubdomainSource>();

  const recordSource = (hosts: DiscoveredHost[], source: SubdomainSource) => {
    for (const entry of hosts) {
      if (!sourceByHost.has(entry.host)) sourceByHost.set(entry.host, source);
    }
  };

  const requested = new Set<SubdomainDiscoverySource>(input.sources);

  if (requested.has("gsc")) {
    const run = await discoverFromGsc(input.projectId, apex);
    groups.push(run.hosts);
    recordSource(run.hosts, "gsc");
    if (run.warning) warnings.push(run.warning);
  }

  if (requested.has("dataforseo")) {
    const run = await discoverFromDataforseo(apex, project, billingCustomer);
    groups.push(run.hosts);
    recordSource(run.hosts, "dataforseo");
    if (run.warning) warnings.push(run.warning);
  }

  const discovered = mergeDiscoveredHosts(groups);
  const existing = await ProjectSubdomainRepository.listForProject(
    input.projectId,
  );
  const existingByHost = new Map(existing.map((row) => [row.host, row]));

  const lastSeenAt = toStoredTimestamp(new Date());
  const inserts: Array<{
    host: string;
    source: SubdomainSource;
    metrics: DiscoveryMetrics;
    lastSeenAt: string;
  }> = [];
  const refreshes: Array<{
    id: string;
    metrics: DiscoveryMetrics;
    lastSeenAt: string;
  }> = [];
  let skipped = 0;
  let total = existing.length;

  for (const entry of discovered) {
    const metrics: DiscoveryMetrics = {
      organicKeywords: entry.organicKeywords,
      organicTraffic: entry.organicTraffic,
      clicks: entry.clicks,
      impressions: entry.impressions,
    };

    const row = existingByHost.get(entry.host);
    if (row) {
      refreshes.push({ id: row.id, metrics, lastSeenAt });
      continue;
    }

    // Stop inserting at the cap and count the rest, rather than truncating
    // quietly -- the caller reports the number so a user at the ceiling finds
    // out from the result instead of from a list that stopped growing.
    if (total >= MAX_SUBDOMAINS_PER_PROJECT) {
      skipped += 1;
      continue;
    }

    inserts.push({
      host: entry.host,
      source: sourceByHost.get(entry.host) ?? "dataforseo",
      metrics,
      lastSeenAt,
    });
    total += 1;
  }

  await ProjectSubdomainRepository.insertMany(input.projectId, inserts);
  await ProjectSubdomainRepository.refreshMetricsMany(
    input.projectId,
    refreshes,
  );

  if (skipped > 0) {
    warnings.push(
      `${skipped} more subdomain${skipped === 1 ? "" : "s"} were found but not added — this project is at the ${MAX_SUBDOMAINS_PER_PROJECT}-subdomain limit.`,
    );
  }

  const rows = await ProjectSubdomainRepository.listForProject(input.projectId);

  return {
    found: discovered.length,
    added: inserts.length,
    refreshed: refreshes.length,
    skipped,
    warnings,
    subdomains: rows.map(mapSubdomain),
  };
}

export const ProjectSubdomainService = {
  listSubdomains,
  addSubdomain,
  removeSubdomains,
  setSubdomainsActive,
  discoverSubdomains,
};
