import { readFileSync, readdirSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/opportunity-test-schema";
import { evidence } from "./evidence.fixture";

import { eq } from "drizzle-orm";

type TestDb = ReturnType<typeof drizzle<typeof schema>>;
const state = vi.hoisted(() => ({
  database: null as TestDb | null,
  gsc: vi.fn(),
  page: vi.fn(),
  objects: new Map<string, string>(),
  failR2: false,
}));
vi.mock("cloudflare:workers", () => ({
  env: {
    R2: {
      put: async (key: string, value: string) => {
        if (state.failR2) throw new Error("R2 unavailable");
        if (!state.objects.has(key)) state.objects.set(key, value);
        return {};
      },
    },
  },
}));
vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: { getAnalyticsPerformance: state.gsc },
  toGscUnavailable: (error: unknown) => {
    throw error;
  },
}));
vi.mock("@/server/features/page-explorer/services/pagePerformance", () => ({
  getPagePerformance: state.page,
}));
vi.mock("@/db", () => ({
  get db() {
    return state.database;
  },
}));
vi.mock(
  "@/db/schema",
  async () => await import("@/db/opportunity-test-schema"),
);
vi.mock("@/db/runBatch", () => ({
  runBatch: async (build: (tx: TestDb) => Parameters<TestDb["batch"]>[0]) => {
    const statements = build(state.database!);
    if (statements.length) await state.database!.batch(statements);
  },
}));
import { retainEvidence } from "./opportunityEvidence";

let client: Client;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
  state.objects.clear();
  state.failR2 = false;
  state.gsc.mockReset();
  state.page.mockReset();
  client = createClient({ url: "file::memory:" });
  await client.executeMultiple(`PRAGMA foreign_keys=ON;
    CREATE TABLE organization(id TEXT PRIMARY KEY);
    CREATE TABLE projects(id TEXT PRIMARY KEY, organization_id TEXT, domain TEXT);
    CREATE TABLE user(id TEXT PRIMARY KEY, name TEXT, email TEXT);
    CREATE TABLE member(id TEXT PRIMARY KEY, organization_id TEXT, user_id TEXT);
    INSERT INTO organization VALUES('org-a'),('org-b');
    INSERT INTO projects VALUES('project-a','org-a','example.com'),('project-b','org-b','elsewhere.com');
    INSERT INTO user VALUES('user-a','Alice','alice@example.com'),('user-b','Bob','bob@example.com');
    INSERT INTO member VALUES('member-a','org-a','user-a'),('member-b','org-b','user-b');`);
  for (const file of readdirSync("drizzle")
    .filter((name) => /^\d+.*\.sql$/.test(name) && name >= "0044")
    .toSorted())
    await client.executeMultiple(readFileSync(`drizzle/${file}`, "utf8"));
  state.database = drizzle(client, { schema });
});

afterEach(() => {
  vi.useRealTimers();
  client.close();
  state.database = null;
});

describe("fenced evidence retention on real SQLite", () => {
  it("holds evidence ownership through the database attachment", async () => {
    let attached = false;
    const attach = async (hash: string) => {
      attached = true;
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      return "attached";
    };
    const result = await retainEvidence(evidence(), null, attach);
    expect(attached).toBe(true);
    expect(result).toBe("attached");
  });
  it("excludes another writer until attachment finishes", async () => {
    let unblock!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const attachment = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const first = retainEvidence(evidence(), null, async () => {
      entered();
      await attachment;
    });
    await started;
    expect(
      (
        await state.database!.select().from(schema.opportunityEvidenceObjects)
      )[0].state,
    ).toBe("writing");
    await expect(
      retainEvidence(evidence(), null, async () => "second"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    unblock();
    await first;
    expect(
      (
        await state.database!.select().from(schema.opportunityEvidenceObjects)
      )[0].state,
    ).toBe("ready");
    expect(await retainEvidence(evidence(), null, async () => "retry")).toBe(
      "retry",
    );
  });
  it("R2 failure stops attachment and releases only the owning writer", async () => {
    state.failR2 = true;
    const attach = vi.fn();
    await expect(retainEvidence(evidence(), null, attach)).rejects.toThrow(
      "R2 unavailable",
    );
    expect(attach).not.toHaveBeenCalled();
    expect(
      await state.database!.select().from(schema.opportunitySnapshots),
    ).toEqual([]);
    expect(
      (
        await state.database!.select().from(schema.opportunityEvidenceObjects)
      )[0],
    ).toMatchObject({ state: "ready", ownerToken: null });
  });
  it("an attachment failure leaves a recoverable orphan", async () => {
    await expect(
      retainEvidence(evidence(), null, async () => {
        throw new Error("attachment failed");
      }),
    ).rejects.toThrow("attachment failed");
    expect(state.objects.size).toBe(1);
    expect(
      (
        await state.database!.select().from(schema.opportunityEvidenceObjects)
      )[0].state,
    ).toBe("ready");
  });
  it("never recreates a retired key", async () => {
    await retainEvidence(evidence(), null, async () => undefined);
    const [row] = await state
      .database!.select()
      .from(schema.opportunityEvidenceObjects);
    await state
      .database!.update(schema.opportunityEvidenceObjects)
      .set({ state: "deleted" })
      .where(eq(schema.opportunityEvidenceObjects.key, row.key));
    state.objects.clear();
    await expect(
      retainEvidence(evidence(), null, async () => undefined),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(state.objects.size).toBe(0);
  });
});
