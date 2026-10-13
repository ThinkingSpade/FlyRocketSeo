import { z } from "zod";

const rankScopeSchema = z.object({
  domain: z.string().min(1),
  locationCode: z.number().int().positive(),
  languageCode: z.string().min(1),
  serpDepth: z.number().int().min(10).max(100),
});
type RankScope = z.infer<typeof rankScopeSchema>;

export function rankScopeJson(config: RankScope): string {
  return JSON.stringify(rankScopeSchema.parse(config));
}

export function matchesRankScope(
  raw: string | null | undefined,
  config: RankScope,
): boolean {
  try {
    if (raw == null) return false;
    const value: unknown = JSON.parse(raw);
    return (
      rankScopeJson(rankScopeSchema.parse(value)) === rankScopeJson(config)
    );
  } catch {
    return false;
  }
}

export function keywordMetricsScopeJson(
  config: Pick<RankScope, "locationCode" | "languageCode">,
): string {
  return JSON.stringify({
    locationCode: config.locationCode,
    languageCode: config.languageCode,
  });
}

export function matchesKeywordMetricsScope(
  raw: string | null | undefined,
  config: Pick<RankScope, "locationCode" | "languageCode">,
): boolean {
  try {
    if (raw == null) return false;
    const value: unknown = JSON.parse(raw);
    const scope = rankScopeSchema
      .pick({ locationCode: true, languageCode: true })
      .parse(value);
    return keywordMetricsScopeJson(scope) === keywordMetricsScopeJson(config);
  } catch {
    return false;
  }
}
