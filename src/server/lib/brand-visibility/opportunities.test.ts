import { describe, it, expect } from "vitest";
import { buildOpportunities } from "./opportunities";
import type { BrandLookupResult } from "@/types/schemas/ai-search";

function result(overrides: Partial<BrandLookupResult> = {}): BrandLookupResult {
  return {
    query: "acme.com",
    detectedTargetType: "domain",
    resolvedTarget: "acme.com",
    fetchedAt: "2026-07-21T00:00:00.000Z",
    hasData: true,
    totalMentions: 120,
    totalAiSearchVolume: 3400,
    perPlatform: [],
    shareOfVoice: {
      platforms: ["chat_gpt", "google"],
      entries: [
        { label: "acme.com", isTarget: true, mentions: 120, sharePct: 25 },
        { label: "rival-a.com", isTarget: false, mentions: 180, sharePct: 37 },
        { label: "rival-b.com", isTarget: false, mentions: 200, sharePct: 38 },
      ],
    },
    topPages: [],
    topQueries: [],
    monthlyVolume: [],
    ...overrides,
  };
}

function query(
  overrides: Partial<BrandLookupResult["topQueries"][number]> = {},
): BrandLookupResult["topQueries"][number] {
  return {
    question: "best crm for startups",
    platform: "chat_gpt",
    aiSearchVolume: 500,
    firstSeenAt: null,
    lastSeenAt: null,
    citedSources: [],
    brandsMentioned: [],
    ...overrides,
  };
}

describe("buildOpportunities — share of voice", () => {
  it("ranks competitors that out-mention the target by the mention gap", () => {
    const sov = buildOpportunities(result()).filter(
      (o) => o.kind === "share_of_voice",
    );
    expect(sov.map((o) => o.competitor)).toEqual(["rival-b.com", "rival-a.com"]);
    expect(sov[0].metric).toBe(80); // 200 − 120
    expect(sov[1].metric).toBe(60); // 180 − 120
  });

  it("omits competitors the target already leads or ties", () => {
    const opps = buildOpportunities(
      result({
        shareOfVoice: {
          platforms: ["chat_gpt"],
          entries: [
            { label: "acme.com", isTarget: true, mentions: 120, sharePct: 60 },
            { label: "small.com", isTarget: false, mentions: 90, sharePct: 40 },
          ],
        },
      }),
    );
    expect(opps.filter((o) => o.kind === "share_of_voice")).toHaveLength(0);
  });

  it("produces nothing when there is no share-of-voice data", () => {
    expect(buildOpportunities(result({ shareOfVoice: null }))).toEqual([]);
  });
});

describe("buildOpportunities — prompt absence", () => {
  it("flags prompts where others are cited but the target domain is not", () => {
    const opps = buildOpportunities(
      result({
        shareOfVoice: null,
        topQueries: [
          query({
            question: "top project tools",
            aiSearchVolume: 900,
            citedSources: [
              { url: "https://rival-a.com/x", domain: "rival-a.com", title: null },
            ],
          }),
        ],
      }),
    );
    const prompt = opps.filter((o) => o.kind === "prompt_absence");
    expect(prompt).toHaveLength(1);
    expect(prompt[0].question).toBe("top project tools");
    expect(prompt[0].metric).toBe(900);
  });

  it("counts a citation of the target's own subdomain as cited, not a gap", () => {
    const opps = buildOpportunities(
      result({
        shareOfVoice: null,
        topQueries: [
          query({
            citedSources: [
              { url: "https://docs.acme.com/x", domain: "docs.acme.com", title: null },
            ],
          }),
        ],
      }),
    );
    expect(opps.filter((o) => o.kind === "prompt_absence")).toHaveLength(0);
  });

  it("excludes prompts where the target domain is already cited", () => {
    const opps = buildOpportunities(
      result({
        shareOfVoice: null,
        topQueries: [
          query({
            citedSources: [
              { url: "https://www.acme.com/a", domain: "www.acme.com", title: null },
            ],
          }),
        ],
      }),
    );
    expect(opps.filter((o) => o.kind === "prompt_absence")).toHaveLength(0);
  });

  it("ignores prompts that cite no one (nothing to be absent from)", () => {
    const opps = buildOpportunities(
      result({
        shareOfVoice: null,
        topQueries: [query({ citedSources: [] })],
      }),
    );
    expect(opps.filter((o) => o.kind === "prompt_absence")).toHaveLength(0);
  });

  it("skips prompt gaps entirely when the target is a keyword, not a domain", () => {
    const opps = buildOpportunities(
      result({
        detectedTargetType: "keyword",
        resolvedTarget: "project management",
        shareOfVoice: null,
        topQueries: [
          query({
            citedSources: [
              { url: "https://rival-a.com/x", domain: "rival-a.com", title: null },
            ],
          }),
        ],
      }),
    );
    expect(opps).toEqual([]);
  });
});
