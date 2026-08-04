/**
 * Setting up rank tracking for many city subdomains at once.
 *
 * THE ONE THING ON THIS FEATURE THAT SPENDS MONEY, so it is built around
 * saying so rather than around convenience.
 *
 * Creating a config and attaching keywords is itself free — no provider is
 * called. What costs money is a config with a SCHEDULE, which the cron then
 * runs on its own. Creating hundreds of those in one click is the single
 * largest "spend without a further click" surface this app has, so:
 *
 *  - `plan` returns the exact recurring cost, computed with the same estimator
 *    the billing guard charges against, and writes nothing;
 *  - the UI defaults the interval to `manual`, so a bulk action never commits
 *    the account to recurring spend unless someone deliberately chose it;
 *  - `setupChunk` never triggers a check. Even for a scheduled config, the
 *    first run happens on the schedule, not at creation.
 *
 * Everything else here reuses RankTrackingService, so a city config is
 * identical to one made by hand on the Rank Tracking tab — this is a faster
 * way to create them, not a second kind of config.
 */
import {
  CitySiteRepository,
  type CitySiteRow,
} from "@/server/features/city-sites/repositories/CitySiteRepository";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { RankTrackingService } from "@/server/features/rank-tracking/services/RankTrackingService";
import { AppError } from "@/server/lib/errors";
import {
  expandCityKeywords,
  projectCityRankCost,
  type CityRankCostProjection,
  type RankScheduleInterval,
} from "@/shared/city-subdomains/cityKeywordTemplates";
import { MAX_CONFIGS_PER_PROJECT } from "@/shared/rank-tracking";
import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";

/**
 * Cities set up per `setupChunk` call.
 *
 * Smaller than the import's chunk because each city here is several writes (a
 * config row plus its keywords, each behind its own validation read) rather
 * than one, and this deployment's per-invocation CPU and subrequest ceilings
 * are the binding constraint — the same reason the import and the geo seed are
 * chunked at all.
 */
const CITY_RANK_SETUP_CHUNK_SIZE = 10;

/** Cap on how many cities one setup run may cover, matching the config cap. */
export const MAX_CITY_RANK_SETUP = MAX_CONFIGS_PER_PROJECT;

type CityRankTrackingSettings = {
  templates: string[];
  devices: RankTrackingConfig["devices"];
  serpDepth: number;
  interval: RankScheduleInterval;
};

export type CityRankSkipReason =
  /** No location code, so there is no geography to check ranks in. */
  | "not-matched"
  /** A config for this host and location already exists. */
  | "already-tracked"
  /** Would push the project past MAX_CONFIGS_PER_PROJECT. */
  | "config-cap"
  /** Every template collapsed to nothing for this city. */
  | "no-keywords";

type CityRankPlanRow = {
  citySiteId: string;
  host: string;
  cityLabel: string;
  locationCode: number;
  keywords: string[];
};

export type CityRankPlan = {
  eligible: CityRankPlanRow[];
  skipped: { host: string; reason: CityRankSkipReason }[];
  cost: CityRankCostProjection;
  /** Active configs the project already has, against the cap. */
  existingConfigCount: number;
  configCap: number;
};

function cityLabelOf(row: CitySiteRow): string {
  if (!row.cityName) return row.host;
  return row.stateCode ? `${row.cityName}, ${row.stateCode}` : row.cityName;
}

/**
 * Decides, without writing anything, which selected cities can be tracked and
 * what tracking them would cost.
 *
 * The skip reasons are kept apart rather than collapsed into "can't": an
 * unmatched city is fixed by picking its location, an already-tracked one
 * needs nothing, and hitting the config cap is a limit the operator has to
 * make a decision about. One combined count would tell them none of that.
 */
async function plan(input: {
  projectId: string;
  citySiteIds: string[];
  settings: CityRankTrackingSettings;
}): Promise<CityRankPlan> {
  const [rows, existingConfigs] = await Promise.all([
    CitySiteRepository.getByIds(input.projectId, input.citySiteIds),
    RankTrackingRepository.getConfigsForProject(input.projectId),
  ]);

  // The unique index is (project, domain, location), so that pair is what
  // decides whether a city is already tracked.
  const tracked = new Set(
    existingConfigs.map((config) => `${config.domain}::${config.locationCode}`),
  );

  const eligible: CityRankPlanRow[] = [];
  const skipped: { host: string; reason: CityRankSkipReason }[] = [];
  let budget = MAX_CONFIGS_PER_PROJECT - existingConfigs.length;

  for (const row of rows) {
    const locationCode = row.locationCode;
    if (row.matchStatus !== "matched" || locationCode == null) {
      skipped.push({ host: row.host, reason: "not-matched" });
      continue;
    }
    if (tracked.has(`${row.host}::${locationCode}`)) {
      skipped.push({ host: row.host, reason: "already-tracked" });
      continue;
    }
    if (budget <= 0) {
      skipped.push({ host: row.host, reason: "config-cap" });
      continue;
    }

    const keywords = expandCityKeywords(input.settings.templates, {
      city: row.cityName ?? row.host,
      stateCode: row.stateCode,
    });
    if (keywords.length === 0) {
      skipped.push({ host: row.host, reason: "no-keywords" });
      continue;
    }

    budget -= 1;
    eligible.push({
      citySiteId: row.id,
      host: row.host,
      cityLabel: cityLabelOf(row),
      locationCode,
      keywords,
    });
  }

  // Keyword counts can differ per city (a template using {state} collapses for
  // a city that has none), so the cost is quoted on the LARGEST list rather
  // than an average: an estimate someone is asked to approve should never be
  // beatable upward by a rounding choice.
  const keywordsPerCity = eligible.reduce(
    (max, row) => Math.max(max, row.keywords.length),
    0,
  );

  return {
    eligible,
    skipped,
    cost: projectCityRankCost({
      cityCount: eligible.length,
      keywordsPerCity,
      devices: input.settings.devices,
      serpDepth: input.settings.serpDepth,
      interval: input.settings.interval,
    }),
    existingConfigCount: existingConfigs.length,
    configCap: MAX_CONFIGS_PER_PROJECT,
  };
}

type CityRankSetupResult = {
  /**
   * Where the caller should resume.
   *
   * NOT `offset + slice.length`. `plan` re-runs on every call and a city
   * created by this chunk drops out of it (it is now "already-tracked"), so
   * the list SHRINKS by exactly the number created. Only the failures stay
   * behind and have to be stepped over — advancing by the whole slice would
   * skip that many untouched cities, silently setting up fewer than asked.
   */
  nextOffset: number;
  /** Cities still eligible when this chunk started, for a progress display. */
  remaining: number;
  created: number;
  keywordsAdded: number;
  failed: { host: string; message: string }[];
  done: boolean;
};

/**
 * Creates configs and keywords for one bounded slice of the plan.
 *
 * Re-derives the plan from the same input rather than accepting a client-built
 * list, so eligibility and the config cap are enforced on every chunk instead
 * of being trusted from the browser.
 *
 * A city that fails is recorded and the run continues. Half a setup is a
 * normal outcome worth reporting — one bad host must not strand the rest — and
 * re-running is safe, because an existing config is skipped as
 * "already-tracked" rather than colliding.
 */
async function setupChunk(input: {
  projectId: string;
  citySiteIds: string[];
  settings: CityRankTrackingSettings;
  offset: number;
}): Promise<CityRankSetupResult> {
  if (input.settings.templates.length === 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Add at least one keyword to track before setting up.",
    );
  }

  const { eligible } = await plan(input);
  const slice = eligible.slice(
    input.offset,
    input.offset + CITY_RANK_SETUP_CHUNK_SIZE,
  );
  if (slice.length === 0) {
    return {
      nextOffset: input.offset,
      remaining: eligible.length,
      created: 0,
      keywordsAdded: 0,
      failed: [],
      done: true,
    };
  }

  let created = 0;
  let keywordsAdded = 0;
  const failed: { host: string; message: string }[] = [];

  for (const row of slice) {
    try {
      const { configId } = await RankTrackingService.createConfig({
        projectId: input.projectId,
        domain: row.host,
        // The whole point of the feature: this city's ranks are checked in
        // this city, not at the project's national default.
        locationCode: row.locationCode,
        devices: input.settings.devices,
        serpDepth: input.settings.serpDepth,
        scheduleInterval: input.settings.interval,
      });
      created += 1;

      const result = await RankTrackingService.addKeywords(
        configId,
        input.projectId,
        row.keywords,
      );
      keywordsAdded += result.added;
    } catch (error) {
      failed.push({
        host: row.host,
        message: error instanceof Error ? error.message : "Setup failed",
      });
    }
  }

  return {
    nextOffset: input.offset + failed.length,
    remaining: eligible.length,
    created,
    keywordsAdded,
    failed,
    done: input.offset + slice.length >= eligible.length,
  };
}

export const CityRankTrackingService = {
  plan,
  setupChunk,
} as const;
