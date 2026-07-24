import { createMeteredRunKey } from "../../../lib/useMeteredQuery";

export function buildKeywordSerpRunKey(
  projectId: string,
  keyword: string | null,
  locationCode: number,
): string {
  return createMeteredRunKey(projectId, keyword, locationCode);
}
