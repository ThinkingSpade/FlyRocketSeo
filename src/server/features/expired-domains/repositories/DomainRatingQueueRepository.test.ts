import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainRatingQueueRepository } from "./DomainRatingQueueRepository";

type Row = {
  id: string;
  projectId: string;
  domain: string;
  domainRating: number | null;
  domainRatingAttempts: number;
  domainRatingClaimId?: string | null;
  domainRatingLeaseExpiresAt?: string | null;
  createdAt: string;
};

type Condition =
  | { kind: "and"; conditions: Condition[] }
  | { kind: "or"; conditions: Condition[] }
  | { kind: "eq"; column: keyof Row; value: unknown }
  | { kind: "isNull"; column: keyof Row }
  | { kind: "inArray"; column: keyof Row; values: unknown[] }
  | { kind: "lt"; column: keyof Row; value: number }
  | { kind: "lte"; column: keyof Row; value: string };

type Order = { kind: "desc"; column: keyof Row };

function matches(condition: Condition, row: Row): boolean {
  if (condition.kind === "and") {
    return condition.conditions.every((item) => matches(item, row));
  }
  if (condition.kind === "or") {
    return condition.conditions.some((item) => matches(item, row));
  }
  if (condition.kind === "isNull") return row[condition.column] === null;
  if (condition.kind === "inArray") {
    return condition.values.includes(row[condition.column]);
  }
  if (condition.kind === "lt") {
    return Number(row[condition.column]) < condition.value;
  }
  if (condition.kind === "lte") {
    const value = row[condition.column];
    return typeof value === "string" && value <= condition.value;
  }
  return row[condition.column] === condition.value;
}

function fakeSelect(initialRows: Row[]) {
  return (selection?: { value?: { kind: "count" } }) => ({
    from: () => ({
      where: (condition: Condition) => {
        const selected = initialRows.filter((row) => matches(condition, row));
        if (selection?.value?.kind === "count") {
          return Promise.resolve([{ value: selected.length }]);
        }
        return {
          orderBy: (...orders: Array<Order | keyof Row>) => ({
            limit: (limit: number) => {
              const [order] = orders;
              if (typeof order === "object" && order.kind === "desc") {
                selected.sort((left, right) =>
                  String(right[order.column]).localeCompare(
                    String(left[order.column]),
                  ),
                );
              } else if (typeof order === "string") {
                selected.sort((left, right) =>
                  String(left[order]).localeCompare(String(right[order])),
                );
              }
              return Promise.resolve(selected.slice(0, limit));
            },
          }),
        };
      },
    }),
  });
}

function fakeUpdate(initialRows: Row[]) {
  let rows = initialRows.map((row) => ({ ...row }));
  return () => ({
    set: (patch: Partial<Row>) => ({
      where: (condition: Condition) => ({
        returning: () => {
          const claimed = rows.filter((row) => matches(condition, row));
          rows = rows.map((row) =>
            matches(condition, row) ? { ...row, ...patch } : row,
          );
          return Promise.resolve(claimed.map((row) => ({ ...row, ...patch })));
        },
      }),
    }),
  });
}

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { select: mocks.select, update: mocks.update },
}));

vi.mock("@/db/schema", () => ({
  harvestedDomains: {
    id: "id",
    projectId: "projectId",
    domain: "domain",
    domainRating: "domainRating",
    domainRatingAttempts: "domainRatingAttempts",
    domainRatingClaimId: "domainRatingClaimId",
    domainRatingLeaseExpiresAt: "domainRatingLeaseExpiresAt",
    createdAt: "createdAt",
  },
  harvestRuns: {},
}));

vi.mock("drizzle-orm", () => ({
  and: (...conditions: Array<Condition | undefined>) => ({
    kind: "and" as const,
    conditions: conditions.filter(
      (condition): condition is Condition => condition !== undefined,
    ),
  }),
  count: () => ({ kind: "count" as const }),
  desc: (column: keyof Row) => ({ kind: "desc" as const, column }),
  eq: (column: keyof Row, value: unknown) => ({
    kind: "eq" as const,
    column,
    value,
  }),
  gt: vi.fn(),
  isNotNull: vi.fn(),
  isNull: (column: keyof Row) => ({ kind: "isNull" as const, column }),
  inArray: (column: keyof Row, values: unknown[]) => ({
    kind: "inArray" as const,
    column,
    values,
  }),
  lt: (column: keyof Row, value: number) => ({
    kind: "lt" as const,
    column,
    value,
  }),
  lte: (column: keyof Row, value: string) => ({
    kind: "lte" as const,
    column,
    value,
  }),
  or: (...conditions: Condition[]) => ({
    kind: "or" as const,
    conditions,
  }),
  sql: vi.fn(),
}));

describe("DomainRatingQueueRepository", () => {
  beforeEach(() => {
    mocks.select.mockReset();
    mocks.update.mockReset();
  });

  it("lists only retryable unknown ratings, newest first", async () => {
    mocks.select.mockImplementation(
      fakeSelect([
        {
          id: "old",
          projectId: "project-1",
          domain: "old.com",
          domainRating: null,
          domainRatingAttempts: 0,
          domainRatingClaimId: null,
          domainRatingLeaseExpiresAt: null,
          createdAt: "2026-08-19T00:00:00.000Z",
        },
        {
          id: "new",
          projectId: "project-1",
          domain: "new.com",
          domainRating: null,
          domainRatingAttempts: 2,
          domainRatingClaimId: null,
          domainRatingLeaseExpiresAt: null,
          createdAt: "2026-08-21T00:00:00.000Z",
        },
        {
          id: "exhausted",
          projectId: "project-1",
          domain: "exhausted.com",
          domainRating: null,
          domainRatingAttempts: 3,
          domainRatingClaimId: null,
          domainRatingLeaseExpiresAt: null,
          createdAt: "2026-08-22T00:00:00.000Z",
        },
        {
          id: "zero",
          projectId: "project-1",
          domain: "zero.com",
          domainRating: 0,
          domainRatingAttempts: 0,
          domainRatingClaimId: null,
          domainRatingLeaseExpiresAt: null,
          createdAt: "2026-08-23T00:00:00.000Z",
        },
      ]).bind(null),
    );

    const rows = await DomainRatingQueueRepository.listCandidates(
      "project-1",
      40,
      3,
    );

    expect(rows.map((row) => row.id)).toEqual(["new", "old"]);
  });

  it("does not re-list a row while another invocation holds its lease", async () => {
    mocks.select.mockImplementation(
      fakeSelect([
        {
          id: "claimed",
          projectId: "project-1",
          domain: "claimed.com",
          domainRating: null,
          domainRatingAttempts: 1,
          domainRatingClaimId: "claim-a",
          domainRatingLeaseExpiresAt: "2026-08-21T12:02:00.000Z",
          createdAt: "2026-08-21T12:00:00.000Z",
        },
      ]).bind(null),
    );

    const rows = await DomainRatingQueueRepository.listCandidates(
      "project-1",
      40,
      3,
      "2026-08-21T12:01:00.000Z",
    );

    expect(rows).toEqual([]);
  });

  it("counts every scoped row that remains ungraded after a batch", async () => {
    const base: Omit<Row, "id" | "domain" | "domainRatingAttempts"> = {
      projectId: "project-1",
      domainRating: null,
      domainRatingClaimId: null,
      domainRatingLeaseExpiresAt: null,
      createdAt: "2026-08-21T00:00:00.000Z",
    };
    mocks.select.mockImplementation(
      fakeSelect([
        {
          ...base,
          id: "eligible",
          domain: "eligible.com",
          domainRatingAttempts: 0,
        },
        {
          ...base,
          id: "expired-lease",
          domain: "expired.com",
          domainRatingAttempts: 2,
          domainRatingClaimId: "old-claim",
          domainRatingLeaseExpiresAt: "2026-08-21T11:59:00.000Z",
        },
        {
          ...base,
          id: "exhausted",
          domain: "exhausted.com",
          domainRatingAttempts: 3,
        },
        {
          ...base,
          id: "active",
          domain: "active.com",
          domainRatingAttempts: 1,
          domainRatingClaimId: "active-claim",
          domainRatingLeaseExpiresAt: "2026-08-21T12:02:00.000Z",
        },
        {
          ...base,
          id: "graded-zero",
          domain: "zero.com",
          domainRating: 0,
          domainRatingAttempts: 0,
        },
        {
          ...base,
          id: "other-project",
          projectId: "project-2",
          domain: "eligible.com",
          domainRatingAttempts: 0,
        },
      ]).bind(null),
    );

    await expect(
      DomainRatingQueueRepository.countUngraded("project-1", [
        "eligible.com",
        "expired.com",
        "exhausted.com",
        "active.com",
        "zero.com",
      ]),
    ).resolves.toBe(4);
  });

  it("atomically claims one expected attempt and never exceeds three", async () => {
    const row = {
      id: "row-1",
      projectId: "project-1",
      domain: "example.com",
      domainRating: null,
      domainRatingAttempts: 2,
      domainRatingClaimId: null,
      domainRatingLeaseExpiresAt: null,
      createdAt: "2026-08-21T00:00:00.000Z",
    };
    mocks.update.mockImplementation(fakeUpdate([row]).bind(null));

    const candidate = {
      id: row.id,
      domain: row.domain,
      domainRatingAttempts: row.domainRatingAttempts,
    };
    const first = await DomainRatingQueueRepository.claimAttempt(
      candidate,
      3,
      "2026-08-21T12:00:00.000Z",
      "claim-1",
    );
    const staleSecond = await DomainRatingQueueRepository.claimAttempt(
      candidate,
      3,
      "2026-08-21T12:00:01.000Z",
      "claim-2",
    );
    const exhausted = await DomainRatingQueueRepository.claimAttempt(
      { ...candidate, domainRatingAttempts: 3 },
      3,
      "2026-08-21T12:00:02.000Z",
      "claim-3",
    );

    expect(first).toBe("claim-1");
    expect(staleSecond).toBeNull();
    expect(exhausted).toBeNull();
  });

  it("fences completion and release by the winning claim token", async () => {
    const claimedRow = {
      id: "row-1",
      projectId: "project-1",
      domain: "example.com",
      domainRating: null,
      domainRatingAttempts: 1,
      domainRatingClaimId: "claim-1",
      domainRatingLeaseExpiresAt: "2026-08-21T12:02:00.000Z",
      createdAt: "2026-08-21T12:00:00.000Z",
    };
    mocks.update.mockImplementation(fakeUpdate([claimedRow]).bind(null));

    await expect(
      DomainRatingQueueRepository.completeAttempt({
        id: claimedRow.id,
        claimId: "stale-claim",
        rating: 42,
      }),
    ).resolves.toBe(false);
    await expect(
      DomainRatingQueueRepository.releaseAttempt({
        id: claimedRow.id,
        claimId: "stale-claim",
      }),
    ).resolves.toBe(false);
    await expect(
      DomainRatingQueueRepository.completeAttempt({
        id: claimedRow.id,
        claimId: claimedRow.domainRatingClaimId,
        rating: 42,
      }),
    ).resolves.toBe(true);
    await expect(
      DomainRatingQueueRepository.releaseAttempt({
        id: claimedRow.id,
        claimId: claimedRow.domainRatingClaimId,
      }),
    ).resolves.toBe(false);
  });
});
