import type { LlmTarget } from "@/server/lib/dataforseoAiTarget";
import {
  DataforseoChargedTaskError,
  buildTaskBilling,
  isRecord,
  type DataforseoTaskLike,
} from "./envelope";

export function firstResult(
  task: DataforseoTaskLike,
  scope: {
    platform?: string;
    locationCode?: number;
    languageCode?: string;
    modelSlug?: string;
    target?: LlmTarget;
    groups?: Array<{ key: string; target: LlmTarget }>;
    userPrompt?: string;
    webSearch?: boolean;
  },
): Record<string, unknown> {
  const first = task.result?.[0];
  if (!isRecord(first))
    throw new DataforseoChargedTaskError(
      "DataForSEO AI response has no valid result envelope",
      buildTaskBilling(task),
    );
  const expected = {
    platform: scope.platform,
    location_code: scope.locationCode,
    language_code: scope.languageCode,
    user_prompt: scope.userPrompt,
    web_search: scope.webSearch,
  };
  for (const echoed of [task.data, first].filter(isRecord)) {
    for (const [field, value] of Object.entries(expected)) {
      if (
        value !== undefined &&
        echoed[field] != null &&
        !(typeof value === "string"
          ? typeof echoed[field] === "string" &&
            (field === "user_prompt"
              ? echoed[field] === value
              : echoed[field].toLowerCase() === value.toLowerCase())
          : echoed[field] === value)
      )
        throw new DataforseoChargedTaskError(
          "DataForSEO AI returned a different declared scope",
          buildTaskBilling(task),
        );
    }
    if (
      scope.target &&
      echoed.target != null &&
      !matchesTarget(echoed.target, scope.target)
    )
      throw new DataforseoChargedTaskError(
        "DataForSEO AI returned a different target",
        buildTaskBilling(task),
      );
    if (scope.groups && echoed.targets != null) {
      const groups = echoed.targets;
      if (
        !Array.isArray(groups) ||
        groups.length !== scope.groups.length ||
        scope.groups.some((expectedGroup) => {
          const matches = (groups as unknown[])
            .filter(isRecord)
            .filter((group) => group.aggregation_key === expectedGroup.key);
          return (
            matches.length !== 1 ||
            !matchesTarget(matches[0].target, expectedGroup.target)
          );
        })
      )
        throw new DataforseoChargedTaskError(
          "DataForSEO AI returned different comparison targets",
          buildTaskBilling(task),
        );
    }
  }
  return first;
}

function matchesTarget(raw: unknown, expected: LlmTarget): boolean {
  if (!Array.isArray(raw) || raw.length !== 1 || !isRecord(raw[0]))
    return false;
  const entry: Record<string, unknown> = raw[0];
  const field = "domain" in expected ? "domain" : "keyword";
  const value = "domain" in expected ? expected.domain : expected.keyword;
  return (
    typeof entry[field] === "string" &&
    entry[field].toLowerCase() === value.toLowerCase() &&
    Object.entries(expected).every(
      ([key, expectedValue]) =>
        key === field ||
        entry[key] == null ||
        JSON.stringify(entry[key]) === JSON.stringify(expectedValue),
    )
  );
}

export function listResult(
  task: DataforseoTaskLike,
  scope: Parameters<typeof firstResult>[1],
): unknown {
  const result = firstResult(task, scope);
  if (!Object.hasOwn(result, "items"))
    throw new DataforseoChargedTaskError(
      "DataForSEO AI returned no list payload",
      buildTaskBilling(task),
    );
  return result.items ?? [];
}
