import { describe, expect, it } from "vitest";
import { shapeResult, type ShapeArgs } from "./brandLookupShaping";
import { computeShareOfVoice, roundOrNull, sumNullable } from "./shareOfVoice";

function args(mentions: number | null = 0): ShapeArgs {
  return {
    query: "acme",
    detected: { type: "keyword", value: "acme" },
    platformBundles: [
      {
        platform: "google",
        status: "success",
        bundle: {
          complete: true,
          aggregated: {
            platform: [{ key: "google", mentions, ai_search_volume: 0 }],
          },
          mentions: [],
          topPages: [],
        },
      },
    ],
    crossOutcomes: [],
    competitorKeys: [],
    userLocationCode: 2826,
    userLanguageCode: "en",
  };
}
it("does not round invalid count observations into supported measurements", () => {
  for (const value of [-1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])
    expect(roundOrNull(value)).toBeNull();
  expect(roundOrNull(0)).toBe(0);
  expect(sumNullable([Number.MAX_SAFE_INTEGER, 1])).toBeNull();
});
it("keeps genuine observed zero available, and marks absent counts incomplete", () => {
  expect(shapeResult(args())).toMatchObject({
    hasData: true,
    totalMentions: 0,
    totalAiSearchVolume: 0,
  });
  expect(shapeResult(args(null))).toMatchObject({
    totalMentions: null,
    partialPlatforms: ["google"],
  });
});
it("does not publish a total across missing platform observations", () => {
  const input = args(3);
  input.userLocationCode = 2840;
  input.platformBundles.push({
    platform: "chat_gpt",
    status: "error",
    bundle: null,
  });
  expect(shapeResult(input).totalMentions).toBeNull();
});
describe("sampled AI month observations", () => {
  it("preserves explicit null gaps and excludes invalid calendar months", () => {
    const input = args();
    input.platformBundles[0].bundle!.mentions = [
      {
        question: "sample",
        monthly_searches: [
          { year: 2026, month: 10, search_volume: null },
          { year: 2026, month: 9, search_volume: 0 },
          { year: 2026, month: 13, search_volume: 100 },
        ],
      },
    ];
    expect(shapeResult(input).monthlyVolume).toEqual([
      { year: 2026, month: 9, volume: 0 },
      { year: 2026, month: 10, volume: null },
    ]);
  });
});
it("does not fabricate complete shares when a requested group is missing", () => {
  const result = computeShareOfVoice(
    [
      {
        platform: "google",
        status: "success",
        items: [{ key: "acme", platform: [{ key: "google", mentions: 10 }] }],
      },
    ],
    "acme",
    ["missing"],
  );
  expect(result!.entries).toEqual([
    { label: "acme", isTarget: true, mentions: 10, sharePct: null },
    { label: "missing", isTarget: false, mentions: null, sharePct: null },
  ]);
});
it("requires one observation for every requested group on every observed platform", () => {
  const result = computeShareOfVoice(
    [
      {
        platform: "google",
        status: "success",
        items: [
          { key: "acme", platform: [{ key: "google", mentions: 10 }] },
          { key: "rival", platform: [{ key: "google", mentions: 0 }] },
        ],
      },
      {
        platform: "chat_gpt",
        status: "success",
        items: [{ key: "acme", platform: [{ key: "chat_gpt", mentions: 10 }] }],
      },
    ],
    "acme",
    ["rival"],
  );
  expect(result!.entries).toEqual([
    { label: "acme", isTarget: true, mentions: 20, sharePct: null },
    { label: "rival", isTarget: false, mentions: null, sharePct: null },
  ]);
});
it("does not count duplicate groups or a different platform as requested coverage", () => {
  const result = computeShareOfVoice(
    [
      {
        platform: "google",
        status: "success",
        items: [
          { key: "acme", platform: [{ key: "chat_gpt", mentions: 10 }] },
          { key: "rival", platform: [{ key: "google", mentions: 1 }] },
          { key: "rival", platform: [{ key: "google", mentions: 1 }] },
        ],
      },
    ],
    "acme",
    ["rival"],
  );
  expect(
    result!.entries.every(
      (row) => row.mentions === null && row.sharePct === null,
    ),
  ).toBe(true);
});
it("keeps sampled month totals unknown if any returned prompt is missing that month", () => {
  const input = args();
  input.platformBundles[0].bundle!.mentions = [
    {
      question: "a",
      monthly_searches: [{ year: 2026, month: 10, search_volume: 3 }],
    },
    { question: "b" },
  ];
  expect(shapeResult(input).monthlyVolume).toEqual([
    { year: 2026, month: 10, volume: null },
  ]);
});
