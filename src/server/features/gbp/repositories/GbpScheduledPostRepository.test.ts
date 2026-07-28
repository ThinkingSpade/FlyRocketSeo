import { beforeEach, describe, expect, it, vi } from "vitest";

// The REAL double-publish guard lives in claimForPublishing's WHERE clause
// (id AND status='scheduled'), not in the pure canStartPublishing predicate
// gbpPostSchedule.test.ts exercises -- see that file's own cross-reference
// comment. A test that only calls canStartPublishing would still pass if the
// `status = 'scheduled'` condition were deleted from claimForPublishing, so
// this file drives the repository function itself against a tiny in-memory
// stand-in for the table that actually APPLIES the WHERE condition drizzle
// builds (rather than just recording what it was called with). That makes
// the assertions below behaviorally real: if the status predicate is ever
// removed from claimForPublishing, "refuses a second claim" below fails for
// real, because the fake table would then happily match by id alone.
// (Verified by hand: temporarily deleting that predicate turns the second-
// claim and it.each tests red; restoring it turns them green again.)

type Row = Record<string, unknown> & { id: string; status: string };

type Condition =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "and"; conditions: Condition[] };

function matches(condition: Condition, row: Row): boolean {
  if (condition.kind === "and") {
    return condition.conditions.every((c) => matches(c, row));
  }
  return row[condition.column] === condition.value;
}

/** A minimal, generic stand-in for `db.update(table).set(patch).where(cond)
 *  .returning()` that mutates a closed-over row list according to `cond`,
 *  exactly like a real conditional UPDATE would -- so calling the SAME
 *  claim twice against the SAME seed data genuinely exercises "does the
 *  second call see the first call's write." */
function makeFakeTable(initialRows: Row[]) {
  let rows = initialRows.map((row) => ({ ...row }));
  return {
    update: () => ({
      set: (patch: Partial<Row>) => ({
        where: (condition: Condition) => ({
          returning: () => {
            const claimed = rows.filter((row) => matches(condition, row));
            rows = rows.map((row) =>
              matches(condition, row) ? { ...row, ...patch } : row,
            );
            return Promise.resolve(
              claimed.map((row) => ({ ...row, ...patch })),
            );
          },
        }),
      }),
    }),
  };
}

const mocks = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock("@/db", () => ({ db: { update: mocks.update } }));

// Plain string stand-ins for column identity (mirrors InviteRepository.test.ts's
// convention) -- their VALUES are what the fake table's row lookups key on, so
// they must match the row property names above ("id", "status").
vi.mock("@/db/schema", () => ({
  gbpScheduledPosts: { id: "id", status: "status" },
}));

vi.mock("drizzle-orm", () => ({
  and: (...conditions: Condition[]) => ({ kind: "and" as const, conditions }),
  eq: (column: string, value: unknown) => ({
    kind: "eq" as const,
    column,
    value,
  }),
  desc: vi.fn(),
}));

describe("GbpScheduledPostRepository.claimForPublishing (the real CAS guard)", () => {
  beforeEach(() => {
    mocks.update.mockReset();
  });

  it("claims a scheduled post, flipping it to publishing", async () => {
    mocks.update.mockImplementation(
      makeFakeTable([{ id: "post-1", status: "scheduled" }]).update,
    );
    const { GbpScheduledPostRepository } =
      await import("./GbpScheduledPostRepository");

    const claimed =
      await GbpScheduledPostRepository.claimForPublishing("post-1");

    expect(claimed).toMatchObject({ id: "post-1", status: "publishing" });
  });

  it("refuses a second claim on the same post once the first has claimed it", async () => {
    mocks.update.mockImplementation(
      makeFakeTable([{ id: "post-1", status: "scheduled" }]).update,
    );
    const { GbpScheduledPostRepository } =
      await import("./GbpScheduledPostRepository");

    const first = await GbpScheduledPostRepository.claimForPublishing("post-1");
    const second =
      await GbpScheduledPostRepository.claimForPublishing("post-1");

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it.each(["draft", "publishing", "published", "failed"])(
    "refuses to claim a %s post",
    async (status) => {
      mocks.update.mockImplementation(
        makeFakeTable([{ id: "post-1", status }]).update,
      );
      const { GbpScheduledPostRepository } =
        await import("./GbpScheduledPostRepository");

      await expect(
        GbpScheduledPostRepository.claimForPublishing("post-1"),
      ).resolves.toBeNull();
    },
  );

  it("returns null for an id that doesn't exist", async () => {
    mocks.update.mockImplementation(
      makeFakeTable([{ id: "post-1", status: "scheduled" }]).update,
    );
    const { GbpScheduledPostRepository } =
      await import("./GbpScheduledPostRepository");

    await expect(
      GbpScheduledPostRepository.claimForPublishing("no-such-post"),
    ).resolves.toBeNull();
  });
});
