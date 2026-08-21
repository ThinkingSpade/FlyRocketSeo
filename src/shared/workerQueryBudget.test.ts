import { describe, expect, it } from "vitest";
import {
  MAX_DOMAIN_RATING_LOOKUPS,
  MAX_GRADING_SUBREQUESTS,
  MAX_MATCHES_PER_DAY,
  MAX_SCHEDULED_HARVEST_SUBREQUESTS,
  WORKER_QUERY_BUDGET,
} from "@/shared/workerQueryBudget";

describe("expired-domain Worker query budget", () => {
  it("fits the required harvest and grading units inside one Free-plan invocation", () => {
    expect(MAX_MATCHES_PER_DAY).toBe(248);
    expect(MAX_DOMAIN_RATING_LOOKUPS).toBe(8);
    // A lost completion can consume both the completion write and a fenced
    // release, so the true worst-case harvest is one above the happy path.
    expect(MAX_SCHEDULED_HARVEST_SUBREQUESTS).toBe(28);
    expect(MAX_SCHEDULED_HARVEST_SUBREQUESTS).toBeLessThanOrEqual(
      WORKER_QUERY_BUDGET,
    );
    expect(MAX_GRADING_SUBREQUESTS).toBeLessThanOrEqual(WORKER_QUERY_BUDGET);
  });

  // The reason the cap is what it is. A row with no Domain Rating is a name the
  // user cannot judge, so harvesting faster than grading resolves would grow a
  // permanently ungraded tail rather than a bigger shortlist. Asserting the
  // relationship, not just the number, keeps that trade-off from drifting when
  // someone retunes a batch size.
  it("never harvests more in a day than grading can resolve in a day", () => {
    const CRON_TICKS_PER_DAY = 96;
    const PROJECTS = 3;
    // One feed date exists per day and a tick harvests one project, so
    // harvesting costs one tick per project and the rest are free for grading.
    const gradedPerDay =
      (CRON_TICKS_PER_DAY - PROJECTS) * MAX_DOMAIN_RATING_LOOKUPS;
    const harvestedPerDay = PROJECTS * MAX_MATCHES_PER_DAY;

    expect(harvestedPerDay).toBeLessThanOrEqual(gradedPerDay);
  });
});
