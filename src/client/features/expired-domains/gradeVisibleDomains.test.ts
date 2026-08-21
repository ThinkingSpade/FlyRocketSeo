import { describe, expect, it } from "vitest";
import {
  maxVisibleGradeRequests,
  runVisibleDomainGrading,
} from "@/client/features/expired-domains/gradeVisibleDomains";
import { MAX_DOMAIN_RATING_LOOKUPS } from "@/shared/workerQueryBudget";

function domains(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `domain-${index}.com`);
}

describe("runVisibleDomainGrading", () => {
  it("grades visible domains in strictly sequential budget-sized requests", async () => {
    let active = 0;
    let maxActive = 0;
    const batches: string[][] = [];
    const progress: number[] = [];

    const result = await runVisibleDomainGrading({
      domains: domains(17),
      signal: new AbortController().signal,
      gradeBatch: async ({ domains: batch }) => {
        batches.push(batch);
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        active -= 1;
        return {
          attempted: batch.length,
          graded: batch.length,
          failed: 0,
          remaining: 0,
        };
      },
      onProgress: (value) => {
        progress.push(value.requests);
      },
    });

    expect(MAX_DOMAIN_RATING_LOOKUPS).toBe(8);
    expect(batches.map((batch) => batch.length)).toEqual([8, 8, 1]);
    expect(maxActive).toBe(1);
    expect(progress).toEqual([1, 2, 3]);
    expect(result).toEqual({
      attempted: 17,
      graded: 17,
      failed: 0,
      remaining: 0,
      requests: 3,
      maxRequests: 9,
      stopReason: "complete",
    });
  });

  it("uses all three allowed attempts but cannot spin on persistent failures", async () => {
    let requests = 0;

    const result = await runVisibleDomainGrading({
      domains: ["always-unknown.com"],
      signal: new AbortController().signal,
      gradeBatch: () => {
        requests += 1;
        return Promise.resolve({
          attempted: 1,
          graded: 0,
          failed: 1,
          remaining: 1,
        });
      },
    });

    expect(requests).toBe(3);
    expect(result).toMatchObject({
      attempted: 3,
      graded: 0,
      failed: 3,
      remaining: 1,
      stopReason: "attempt-cap",
    });
  });

  it("stops after one no-progress response while work remains", async () => {
    let requests = 0;
    const result = await runVisibleDomainGrading({
      domains: ["leased.com"],
      signal: new AbortController().signal,
      gradeBatch: () => {
        requests += 1;
        return Promise.resolve({
          attempted: 0,
          graded: 0,
          failed: 0,
          remaining: 1,
        });
      },
    });

    expect(requests).toBe(1);
    expect(result.stopReason).toBe("stalled");
  });

  it("continues to later batches when the first batch cannot make progress", async () => {
    const requested: string[][] = [];
    const result = await runVisibleDomainGrading({
      domains: domains(9),
      signal: new AbortController().signal,
      gradeBatch: ({ domains: batch }) => {
        requested.push(batch);
        return Promise.resolve(
          batch.length === 8
            ? { attempted: 0, graded: 0, failed: 0, remaining: 8 }
            : { attempted: 1, graded: 1, failed: 0, remaining: 0 },
        );
      },
    });

    expect(requested.map((batch) => batch.length)).toEqual([8, 1]);
    expect(result).toMatchObject({
      graded: 1,
      remaining: 8,
      requests: 2,
      stopReason: "stalled",
    });
  });

  it("uses the server remainder when another invocation finished the row", async () => {
    const result = await runVisibleDomainGrading({
      domains: ["finished-elsewhere.com"],
      signal: new AbortController().signal,
      gradeBatch: () =>
        Promise.resolve({
          attempted: 0,
          graded: 0,
          failed: 0,
          remaining: 0,
        }),
    });

    expect(result).toMatchObject({
      graded: 0,
      remaining: 0,
      requests: 1,
      stopReason: "complete",
    });
  });

  it("aborts the active request and never starts another one", async () => {
    const controller = new AbortController();
    let requests = 0;
    const running = runVisibleDomainGrading({
      domains: domains(9),
      signal: controller.signal,
      gradeBatch: ({ signal }) => {
        requests += 1;
        return new Promise((resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      },
    });

    await new Promise<void>((resolve) => queueMicrotask(resolve));
    controller.abort();

    await expect(running).resolves.toMatchObject({
      requests: 0,
      stopReason: "cancelled",
    });
    expect(requests).toBe(1);
  });

  it("derives the absolute request cap from visible rows and the attempt cap", () => {
    expect(maxVisibleGradeRequests(200)).toBe(75);
  });
});
