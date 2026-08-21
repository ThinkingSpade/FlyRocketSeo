import { describe, expect, it, vi } from "vitest";
import {
  resolveHarvestVocabulary,
  VOCABULARY_CACHE_PREFIX,
  VOCABULARY_TTL_SECONDS,
} from "@/server/features/expired-domains/harvestVocabulary";

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
      expect.stringMatching(
        new RegExp(`^${VOCABULARY_CACHE_PREFIX}p1:[a-f0-9]{64}$`),
      ),
    ]);
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

  it("includes profile text even when it derives the same seed terms", async () => {
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

    expect(derive).toHaveBeenCalledTimes(2);
    expect(cache.store.size).toBe(2);
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
