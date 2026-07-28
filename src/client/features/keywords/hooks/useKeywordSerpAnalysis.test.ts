import { describe, expect, it } from "vitest";
import {
  INITIAL_AUTHORIZED_RUN_STATE,
  authorizeRunState,
  isRunAuthorized,
} from "../../../lib/useMeteredQuery";
import { buildKeywordSerpRunKey } from "./keywordSerpAuthorization";

describe("keyword SERP authorization", () => {
  it("does not remain authorized when the location changes", () => {
    const projectId = "project-1";
    const keyword = "seo audit";
    const usKey = buildKeywordSerpRunKey(projectId, keyword, 2840);
    const ukKey = buildKeywordSerpRunKey(projectId, keyword, 2826);
    const authorized = authorizeRunState(INITIAL_AUTHORIZED_RUN_STATE, usKey);

    expect(isRunAuthorized(authorized, usKey)).toBe(true);
    expect(isRunAuthorized(authorized, ukKey)).toBe(false);
  });
});
