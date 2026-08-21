import { describe, expect, it, vi } from "vitest";
import {
  resolveHarvestVocabulary as resolveHarvestVocabularyProduction,
  VOCABULARY_TTL_SECONDS,
} from "@/server/features/expired-domains/harvestVocabulary";

type VocabularyInput = Parameters<typeof resolveHarvestVocabularyProduction>[0];

function resolveHarvestVocabulary(
  input: Omit<VocabularyInput, "allowModelDerivation"> & {
    allowModelDerivation?: boolean;
  },
) {
  return resolveHarvestVocabularyProduction({
    allowModelDerivation: true,
    ...input,
  });
}

function fakeCache() {
  const store = new Map<string, string>();
  return {
    store,
    get: (key: string) => Promise.resolve(store.get(key) ?? null),
    put: (key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    },
  };
}

async function warmCacheKey(cache: ReturnType<typeof fakeCache>) {
  await resolveHarvestVocabulary({
    projectId: "p1",
    keywords: KEYWORDS,
    profileText: "",
    cache,
    deriveAdjacent: () => Promise.resolve(["school"]),
  });
  const [key] = cache.store.keys();
  if (!key) throw new Error("expected vocabulary cache write");
  return key;
}

const KEYWORDS = ["vending machines dallas", "breakroom services"];

describe("resolveHarvestVocabulary", () => {
  // The point of the whole step: a harvest limited to the client's own trade
  // returns more of the same vertical.
  it("combines the client's own terms with adjacent industries", async () => {
    const result = await resolveHarvestVocabulary({
      projectId: "p1",
      keywords: KEYWORDS,
      profileText: "",
      cache: fakeCache(),
      deriveAdjacent: () => Promise.resolve(["school", "hospital", "gym"]),
    });

    expect(result.seed).toContain("vending");
    expect(result.adjacent).toContain("school");
    expect(result.all).toEqual(
      expect.arrayContaining(["vending", "breakroom", "school", "hospital"]),
    );
    expect(result.categoryByTerm).toMatchObject({
      vending: "uncategorised",
      school: "uncategorised",
      hospital: "uncategorised",
    });
  });

  it("dedupes a term the model repeats back from the seed", async () => {
    const result = await resolveHarvestVocabulary({
      projectId: "p1",
      keywords: KEYWORDS,
      profileText: "",
      cache: fakeCache(),
      deriveAdjacent: () => Promise.resolve(["vending", "school"]),
    });

    expect(result.all.filter((term) => term === "vending")).toHaveLength(1);
  });

  it("caches the adjacent terms so a model call is not repeated", async () => {
    const cache = fakeCache();
    const derive = vi.fn().mockResolvedValue(["school"]);

    await resolveHarvestVocabulary({
      projectId: "p1",
      keywords: KEYWORDS,
      profileText: "",
      cache,
      deriveAdjacent: derive,
    });
    await resolveHarvestVocabulary({
      projectId: "p1",
      keywords: KEYWORDS,
      profileText: "",
      cache,
      deriveAdjacent: derive,
    });

    expect(derive).toHaveBeenCalledTimes(1);
    expect([...cache.store.keys()]).toEqual([
      expect.stringMatching(/^harvest-vocab:v2:p1:[a-f0-9]{64}$/),
    ]);
  });

  it("writes adjacent terms in the v2 structured cache shape", async () => {
    const cache = fakeCache();

    await resolveHarvestVocabulary({
      projectId: "p1",
      keywords: KEYWORDS,
      profileText: "",
      cache,
      deriveAdjacent: () => Promise.resolve(["school", "hospital"]),
    });

    expect(JSON.parse([...cache.store.values()][0] ?? "null")).toEqual({
      terms: ["school", "hospital"],
      categoryByTerm: {
        school: "uncategorised",
        hospital: "uncategorised",
      },
    });
  });

  it("reads a deployed v1 array and defaults its categories", async () => {
    const cache = fakeCache();
    const currentKey = await warmCacheKey(cache);
    const legacyKey = currentKey.replace(
      /^harvest-vocab:v2:/,
      "harvest-vocab:v1:",
    );
    cache.store.clear();
    cache.store.set(legacyKey, JSON.stringify(["school", "hospital"]));
    const derive = vi.fn().mockResolvedValue(["should-not-run"]);

    const result = await resolveHarvestVocabulary({
      projectId: "p1",
      keywords: KEYWORDS,
      profileText: "",
      cache,
      deriveAdjacent: derive,
    });

    expect(result.adjacent).toEqual(["school", "hospital"]);
    expect(result.categoryByTerm).toMatchObject({
      school: "uncategorised",
      hospital: "uncategorised",
    });
    expect(derive).not.toHaveBeenCalled();
  });

  it("defaults null and missing v2 categories without losing known ones", async () => {
    const cache = fakeCache();
    const currentKey = await warmCacheKey(cache);
    cache.store.set(
      currentKey,
      JSON.stringify({
        terms: ["school", "hospital", "gym"],
        categoryByTerm: { school: "education", hospital: null },
      }),
    );
    const derive = vi.fn().mockResolvedValue(["should-not-run"]);

    const result = await resolveHarvestVocabulary({
      projectId: "p1",
      keywords: KEYWORDS,
      profileText: "",
      cache,
      deriveAdjacent: derive,
    });

    expect(result.categoryByTerm).toMatchObject({
      school: "education",
      hospital: "uncategorised",
      gym: "uncategorised",
      vending: "uncategorised",
    });
    expect(derive).not.toHaveBeenCalled();
  });

  it("misses the cache when the normalized keyword vocabulary changes", async () => {
    const cache = fakeCache();
    const derive = vi.fn().mockResolvedValue(["school"]);

    await resolveHarvestVocabulary({
      projectId: "p1",
      keywords: KEYWORDS,
      profileText: "",
      cache,
      deriveAdjacent: derive,
    });
    await resolveHarvestVocabulary({
      projectId: "p1",
      keywords: [...KEYWORDS, "micro markets"],
      profileText: "",
      cache,
      deriveAdjacent: derive,
    });

    expect(derive).toHaveBeenCalledTimes(2);
    expect(cache.store.size).toBe(2);
  });

  it("reuses the cache when profile text derives the same seed terms", async () => {
    const cache = fakeCache();
    const derive = vi.fn().mockResolvedValue(["school"]);

    await resolveHarvestVocabulary({
      projectId: "p1",
      keywords: KEYWORDS,
      profileText: "services for vending",
      cache,
      deriveAdjacent: derive,
    });
    await resolveHarvestVocabulary({
      projectId: "p1",
      keywords: KEYWORDS,
      profileText: "vending services",
      cache,
      deriveAdjacent: derive,
    });

    expect(derive).toHaveBeenCalledTimes(1);
    expect(cache.store.size).toBe(1);
  });

  it("normalizes seed ordering, casing, and whitespace for a stable key", async () => {
    const cache = fakeCache();
    const derive = vi.fn().mockResolvedValue(["school"]);

    await resolveHarvestVocabulary({
      projectId: "p1",
      keywords: ["vending dallas", "breakroom"],
      profileText: "Office operator",
      cache,
      deriveAdjacent: derive,
    });
    await resolveHarvestVocabulary({
      projectId: "p1",
      keywords: ["  BREAKROOM  ", "VENDING   DALLAS"],
      profileText: "  office   OPERATOR ",
      cache,
      deriveAdjacent: derive,
    });

    expect(derive).toHaveBeenCalledTimes(1);
    expect(cache.store.size).toBe(1);
  });

  it("writes with the long TTL", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    await resolveHarvestVocabulary({
      projectId: "p1",
      keywords: KEYWORDS,
      profileText: "",
      cache: { get: () => Promise.resolve(null), put },
      deriveAdjacent: () => Promise.resolve(["school"]),
    });

    expect(put).toHaveBeenCalledWith(expect.any(String), expect.any(String), {
      expirationTtl: VOCABULARY_TTL_SECONDS,
    });
  });

  it("returns a paid answer when the cache write fails", async () => {
    const adjacent = ["school", "hospital"];

    const result = await resolveHarvestVocabulary({
      projectId: "p1",
      keywords: KEYWORDS,
      profileText: "",
      cache: {
        get: () => Promise.resolve(null),
        put: () => Promise.reject(new Error("KV unavailable")),
      },
      deriveAdjacent: () => Promise.resolve(adjacent),
    });

    expect(result.adjacent).toEqual(adjacent);
    expect(result.all).toEqual(expect.arrayContaining(adjacent));
  });

  // Caching an empty answer would lock the harvest into the narrow vocabulary
  // for a month over one transient model failure.
  it("does not cache an empty result", async () => {
    const cache = fakeCache();
    await resolveHarvestVocabulary({
      projectId: "p1",
      keywords: KEYWORDS,
      profileText: "",
      cache,
      deriveAdjacent: () => Promise.resolve([]),
    });

    expect(cache.store.size).toBe(0);
  });

  it("does not start paid adjacent derivation outside an explicit action", async () => {
    const cache = fakeCache();
    const derive = vi.fn().mockResolvedValue(["school"]);

    const result = await resolveHarvestVocabulary({
      projectId: "p1",
      keywords: KEYWORDS,
      profileText: "",
      cache,
      allowModelDerivation: false,
      deriveAdjacent: derive,
    });

    expect(result.adjacent).toEqual([]);
    expect(result.all).toEqual(result.seed);
    expect(derive).not.toHaveBeenCalled();
    expect(cache.store.size).toBe(0);
  });

  it("still returns the seed when the model call fails", async () => {
    const result = await resolveHarvestVocabulary({
      projectId: "p1",
      keywords: KEYWORDS,
      profileText: "",
      cache: fakeCache(),
      deriveAdjacent: () => Promise.reject(new Error("no model")),
    });

    expect(result.seed).toContain("vending");
    expect(result.adjacent).toEqual([]);
    expect(result.all).toContain("vending");
  });

  it("does nothing when the project has no vocabulary at all", async () => {
    const derive = vi.fn();
    const result = await resolveHarvestVocabulary({
      projectId: "p1",
      keywords: [],
      profileText: "",
      cache: fakeCache(),
      deriveAdjacent: derive,
    });

    expect(result.all).toEqual([]);
    expect(derive).not.toHaveBeenCalled();
  });
});
