import { getUsageCreditsRemaining } from "@/server/billing/subscription";
import { AppError } from "@/server/lib/errors";
import { estimateRankCheckCredits } from "@/shared/rank-tracking";

export async function assertRankCheckCreditsAvailable(input: {
  customerId: string;
  keywordCount: number;
  devices: "both" | "desktop" | "mobile";
  serpDepth: number;
  trigger: "manual" | "scheduled";
}): Promise<void> {
  const { costCredits } = estimateRankCheckCredits(
    input.keywordCount,
    input.devices,
    input.serpDepth,
    input.trigger === "scheduled" ? "queued" : "live",
  );
  const { monthlyRemaining, topupRemaining } = await getUsageCreditsRemaining(
    input.customerId,
  );

  if (monthlyRemaining + topupRemaining < costCredits) {
    throw new AppError(
      "INSUFFICIENT_CREDITS",
      "Insufficient credits for rank check",
    );
  }
}
