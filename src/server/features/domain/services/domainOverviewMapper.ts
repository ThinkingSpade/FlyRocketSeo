import type { PositionBuckets } from "@/types/schemas/domain";

function readCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

export function readTrafficEstimate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function readKeywordCount(value: unknown): number | null {
  return readCount(value);
}

function sumComplete(organic: Record<string, unknown>, keys: string[]) {
  const values = keys.map((key) => readCount(organic[key]));
  if (values.some((value) => value === null)) return null;
  const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return Number.isSafeInteger(total) ? total : null;
}

export function mapPositionBuckets(value: unknown): PositionBuckets | null {
  if (typeof value !== "object" || value === null) return null;
  const organic = Object.fromEntries(Object.entries(value));
  const buckets = {
    top3: sumComplete(organic, ["pos_1", "pos_2_3"]),
    pos4to10: sumComplete(organic, ["pos_4_10"]),
    pos11to20: sumComplete(organic, ["pos_11_20"]),
    pos21to50: sumComplete(organic, ["pos_21_30", "pos_31_40", "pos_41_50"]),
    pos51plus: sumComplete(organic, [
      "pos_51_60",
      "pos_61_70",
      "pos_71_80",
      "pos_81_90",
      "pos_91_100",
    ]),
  };
  return Object.values(buckets).some((count) => count !== null)
    ? buckets
    : null;
}
