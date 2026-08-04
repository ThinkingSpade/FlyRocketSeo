/**
 * Turning one keyword template into per-city tracked keywords, and working out
 * what tracking them would cost.
 *
 * Pure, because this is the arithmetic a user is asked to approve before the
 * account starts spending on a schedule. A cost figure that is derived
 * somewhere untestable is a cost figure nobody can check.
 */
import { devicesCount, estimateRankCheckCredits } from "@/shared/rank-tracking";
import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";

type RankTrackingDevices = RankTrackingConfig["devices"];

type CityKeywordContext = {
  /** "Austin" — the matched city name. */
  city: string;
  /** "TX", when the matched city has one. */
  stateCode: string | null;
};

/**
 * Placeholders a template may use. Anything else is left alone, so a template
 * with no placeholder at all is still valid: the city subdomain is tracked at
 * its own location code, which is what localizes a bare "plumber".
 */
const CITY_TOKEN = /\{city\}/giu;
const STATE_TOKEN = /\{state\}/giu;

/**
 * True when a template references the city, so the UI can point out that every
 * city would otherwise be tracked on an identical keyword list.
 *
 * Builds its own non-global regex rather than reusing CITY_TOKEN: a `g` regex
 * carries `lastIndex` between `.test()` calls, so a shared one would alternate
 * true and false on the same input.
 */
export function usesCityToken(template: string): boolean {
  return /\{city\}/iu.test(template);
}

/**
 * Expands templates for one city.
 *
 * A template that uses `{state}` for a city with no state code resolves to a
 * keyword with the token removed and the spacing tidied, rather than the
 * literal text "{state}" — a keyword nobody searches for, sent to a paid API
 * once per check.
 *
 * Output is lowercased and deduplicated because that is what `addKeywords`
 * stores; doing it here means the count shown in the cost estimate is the
 * count that will actually be tracked, not an optimistic one.
 */
export function expandCityKeywords(
  templates: readonly string[],
  context: CityKeywordContext,
): string[] {
  const seen = new Set<string>();
  for (const template of templates) {
    const keyword = template
      .replace(CITY_TOKEN, context.city)
      .replace(STATE_TOKEN, context.stateCode ?? "")
      .replace(/\s+/gu, " ")
      .trim()
      .toLowerCase();
    if (keyword) seen.add(keyword);
  }
  return [...seen];
}

/** Templates as typed into a textarea: one per line, blanks dropped. */
export function parseKeywordTemplates(input: string): string[] {
  const seen = new Set<string>();
  for (const line of input.split(/\r?\n/u)) {
    const template = line.trim();
    if (template) seen.add(template);
  }
  return [...seen];
}

export type RankScheduleInterval = "daily" | "weekly" | "monthly" | "manual";

const INTERVALS: readonly RankScheduleInterval[] = [
  "daily",
  "weekly",
  "monthly",
  "manual",
];

/**
 * Narrows a select's string value to an interval.
 *
 * A cast would do the same thing to the type checker while letting an
 * unexpected value through to a control that decides recurring spend; this
 * falls back to the one option that never recurs.
 */
export function toRankScheduleInterval(value: string): RankScheduleInterval {
  return INTERVALS.find((interval) => interval === value) ?? "manual";
}

/**
 * Checks a scheduled config runs in a month.
 *
 * Weekly is 365/7/12 rather than 4, because "4 weeks" understates a weekly
 * schedule by about 8% — and the whole point of this number is that someone
 * can trust it before agreeing to recurring spend.
 */
export function checksPerMonth(interval: RankScheduleInterval): number {
  if (interval === "daily") return 365 / 12;
  if (interval === "weekly") return 365 / 7 / 12;
  if (interval === "monthly") return 1;
  return 0;
}

export type CityRankCostProjection = {
  cityCount: number;
  keywordsPerCity: number;
  /** SERP requests one check of every selected city issues. */
  requestsPerCheck: number;
  /** USD to check every selected city once, on this schedule's endpoint. */
  costPerCheckUsd: number;
  /** USD per month at this interval. Zero for manual — nothing recurs. */
  costPerMonthUsd: number;
};

/**
 * What tracking these cities would cost.
 *
 * Delegates the per-request price to `estimateRankCheckCredits`, the same
 * function `assertRankCheckCreditsAvailable` charges against, so the estimate
 * shown and the amount billed cannot drift apart.
 *
 * A scheduled check goes through DataForSEO's cheaper task queue and a manual
 * one through the live endpoint, so the method follows the interval — quoting
 * the live price for a queued schedule would overstate the bill by roughly
 * three times, and quoting the queued price for manual checks would understate
 * it by the same factor.
 */
export function projectCityRankCost(input: {
  cityCount: number;
  keywordsPerCity: number;
  devices: RankTrackingDevices;
  serpDepth: number;
  interval: RankScheduleInterval;
}): CityRankCostProjection {
  const method = input.interval === "manual" ? "live" : "queued";
  const perCity = estimateRankCheckCredits(
    input.keywordsPerCity,
    input.devices,
    input.serpDepth,
    method,
  );
  const costPerCheckUsd = perCity.costUsd * input.cityCount;

  return {
    cityCount: input.cityCount,
    keywordsPerCity: input.keywordsPerCity,
    requestsPerCheck:
      input.cityCount * input.keywordsPerCity * devicesCount(input.devices),
    costPerCheckUsd,
    costPerMonthUsd: costPerCheckUsd * checksPerMonth(input.interval),
  };
}
