import { seedEvidenceStorage } from "./seed-evidence-storage";
import { seedProviderRuns } from "./seed-provider-runs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getPlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import { hashPassword } from "better-auth/crypto";
import * as auth from "../../src/db/better-auth-schema";
import * as app from "../../src/db/app.schema";
import * as gsc from "../../src/db/gsc.schema";
import * as work from "../../src/db/opportunities.schema";
import type {
  EvidenceSnapshot,
  OpportunityFinding,
} from "../../src/shared/opportunities";
import {
  ACCEPTANCE_PASSWORD,
  ORG_A,
  ORG_B,
  PAGE_URL,
  PROJECT_A,
  PROJECT_A2,
  PROJECT_B,
  PROJECT_PAGING,
  CLEANUP_BASELINE_KEY,
} from "./data";

const statePath = process.env.FLYROCKET_ACCEPTANCE_STATE;
if (!statePath || process.env.FLYROCKET_ACCEPTANCE !== "1")
  throw new Error("Use scripts/acceptance-server.mjs");
const { env, dispose } = await getPlatformProxy<{
  DB: D1Database;
  R2: R2Bucket;
}>({
  configPath: "e2e/acceptance/wrangler.jsonc",
  persist: { path: path.join(statePath, "v3") },
  remoteBindings: false,
});
const db = drizzle(env.DB);
try {
  for (const file of (await readdir("drizzle"))
    .filter((name) => name.endsWith(".sql"))
    .toSorted()) {
    const sql = await readFile(`drizzle/${file}`, "utf8");
    for (const statement of sql
      .split("--> statement-breakpoint")
      .filter((text) => text.trim()))
      await env.DB.prepare(statement.trim()).run();
  }
  const password = await hashPassword(ACCEPTANCE_PASSWORD);
  await db.insert(auth.organization).values([
    {
      id: ORG_A,
      name: "Acceptance Alpha",
      slug: "team-workspace",
      createdAt: new Date(),
    },
    {
      id: ORG_B,
      name: "Acceptance Beta",
      slug: "acceptance-beta",
      createdAt: new Date(),
    },
  ]);
  for (const suffix of ["a", "b"]) {
    const userId = `acceptance-user-${suffix}`;
    await db.insert(auth.user).values({
      id: userId,
      name: `Acceptance ${suffix}`,
      email: `acceptance-${suffix}@example.com`,
      emailVerified: true,
    });
    await db.insert(auth.account).values({
      id: `credential-${suffix}`,
      providerId: "credential",
      accountId: userId,
      userId,
      password,
    });
    await db.insert(auth.member).values({
      id: `member-${suffix}`,
      organizationId: suffix === "a" ? ORG_A : ORG_B,
      userId,
      role: "owner",
      createdAt: new Date(),
    });
    await db.insert(app.userOnboardingAnswers).values({
      userId,
      organizationId: suffix === "a" ? ORG_A : ORG_B,
      completedAt: new Date().toISOString(),
      gscNudgeDismissedAt: new Date().toISOString(),
    });
    await db.insert(auth.account).values({
      id: `fixture-gsc-${suffix}`,
      providerId: "google-search-console",
      accountId: `fixture-google-${suffix}`,
      userId,
    });
  }
  await db.insert(app.projects).values([
    {
      id: PROJECT_A,
      organizationId: ORG_A,
      name: "Primary acceptance",
      domain: "primary.example",
    },
    {
      id: PROJECT_A2,
      organizationId: ORG_A,
      name: "Secondary acceptance",
      domain: "secondary.example",
    },
    {
      id: PROJECT_PAGING,
      organizationId: ORG_A,
      name: "Paging acceptance",
      domain: "paging.example",
      locationCode: 2826,
    },
    {
      id: PROJECT_B,
      organizationId: ORG_B,
      name: "Private beta acceptance",
      domain: "private.example",
    },
  ]);
  await db.insert(gsc.gscConnections).values({
    id: "fixture-gsc-a",
    projectId: PROJECT_A,
    organizationId: ORG_A,
    siteUrl: "sc-domain:primary.example",
    connectedByUserId: "acceptance-user-a",
    connectedAccountEmail: "acceptance-a@example.com",
  });
  await db.insert(app.audits).values({
    id: "acceptance-audit",
    projectId: PROJECT_A,
    startedByUserId: "acceptance-user-a",
    startUrl: "https://primary.example",
    status: "completed",
    pagesCrawled: 2,
    pagesTotal: 2,
    completedAt: new Date().toISOString(),
  });
  await db.insert(app.auditPages).values([
    {
      id: "acceptance-page",
      auditId: "acceptance-audit",
      url: PAGE_URL,
      statusCode: 200,
      title: "",
      metaDescription: "",
      h1Count: 1,
      wordCount: 650,
    },
    {
      id: "acceptance-page-healthy",
      auditId: "acceptance-audit",
      url: "https://primary.example/healthy",
      statusCode: 200,
      title: "Healthy page",
      metaDescription: "Healthy metadata",
      h1Count: 1,
      wordCount: 700,
    },
  ]);
  const historyId = "00000000-0000-4000-8000-000000000301";
  const historyEvidence: EvidenceSnapshot = {
    schemaVersion: 1,
    source: "Google Search Console",
    fetchedAt: "2026-08-31T12:00:00.000Z",
    scope: {
      organizationId: ORG_A,
      projectId: PROJECT_A,
      target: "primary.example",
      siteUrl: "sc-domain:primary.example",
      connectedBy: "acceptance-a@example.com",
      country: null,
      device: null,
      searchType: "web",
    },
    url: "https://primary.example/history",
    window: { startDate: "2026-08-03", endDate: "2026-08-30" },
    previousWindow: { startDate: "2026-07-06", endDate: "2026-08-02" },
    current: { clicks: 24, impressions: 1000, position: 8 },
    previous: { clicks: 24, impressions: 1000, position: 8 },
    coverage: {
      finalData: true,
      currentRows: 1,
      previousRows: 1,
      truncated: false,
      complete: true,
    },
    limitations: ["Controlled local acceptance evidence."],
  };
  const historyFinding: OpportunityFinding = {
    kind: "page_review",
    title: "History acceptance fixture",
    finding: "Review the persisted history of this isolated test action.",
    url: historyEvidence.url,
    assetRefs: [historyEvidence.url],
    priorityBand: "low",
    confidenceBand: "medium",
    limitations: historyEvidence.limitations,
    nextSteps: ["Review work history."],
    evidence: historyEvidence,
  };
  await env.R2.put(CLEANUP_BASELINE_KEY, JSON.stringify(historyEvidence));
  await db.insert(work.opportunitySnapshots).values({
    id: "acceptance-history-snapshot",
    organizationId: ORG_A,
    projectId: PROJECT_A,
    target: "primary.example",
    schemaVersion: 1,
    contentHash: "acceptance-history-content-hash",
    payloadJson: JSON.stringify(historyEvidence),
    r2Key: CLEANUP_BASELINE_KEY,
    fetchedAt: historyEvidence.fetchedAt,
  });
  await db.insert(work.opportunities).values({
    id: historyId,
    organizationId: ORG_A,
    projectId: PROJECT_A,
    target: "primary.example",
    scopeKey: "acceptance-history-scope",
    dedupeKey: "acceptance-history-dedupe",
    detectorId: "page_review",
    detectorVersion: "1",
    kind: "page_review",
    priorityBand: "low",
    generatedJson: JSON.stringify(historyFinding),
    evidenceSnapshotId: "acceptance-history-snapshot",
    status: "in_progress",
    firstSeenAt: historyEvidence.fetchedAt,
    lastSeenAt: historyEvidence.fetchedAt,
    lastEvaluatedAt: historyEvidence.fetchedAt,
    revision: 61,
    mutationId: "acceptance-history-mutation",
  });
  const historyEvents = Array.from({ length: 61 }, (_, index) => ({
    id: `acceptance-history-event-${index + 1}`,
    organizationId: ORG_A,
    projectId: PROJECT_A,
    opportunityId: historyId,
    actorUserId: "acceptance-user-a",
    createdAt: new Date(
      Date.parse(historyEvidence.fetchedAt) + index * 1000,
    ).toISOString(),
    kind: "updated" as const,
    note:
      index === 0
        ? "Acceptance history oldest entry"
        : `Acceptance history event ${index + 1}`,
    status: "in_progress" as const,
    evidenceSnapshotId: "acceptance-history-snapshot",
    revision: index + 1,
  }));
  // D1 limits each statement to 100 bound parameters.
  for (let offset = 0; offset < historyEvents.length; offset += 8) {
    await db
      .insert(work.opportunityEvents)
      .values(historyEvents.slice(offset, offset + 8));
  }
  await seedEvidenceStorage(db, env.R2, historyFinding, env.DB);
  await seedProviderRuns(db, env.R2);
  const pagingEvidence: EvidenceSnapshot = {
    ...historyEvidence,
    scope: {
      ...historyEvidence.scope,
      projectId: PROJECT_PAGING,
      target: "paging.example",
      siteUrl: "sc-domain:paging.example",
    },
    url: "https://paging.example/guide",
  };
  await env.R2.put(
    "acceptance/paging-evidence.json",
    JSON.stringify(pagingEvidence),
  );
  await db.insert(work.opportunitySnapshots).values({
    id: "acceptance-paging-snapshot",
    organizationId: ORG_A,
    projectId: PROJECT_PAGING,
    target: "paging.example",
    schemaVersion: 1,
    contentHash: "acceptance-paging-content-hash",
    payloadJson: JSON.stringify(pagingEvidence),
    r2Key: "acceptance/paging-evidence.json",
    fetchedAt: pagingEvidence.fetchedAt,
  });
  const pagingItems = Array.from({ length: 121 }, (_, index) => {
    const suffix = `${index + 1}`.padStart(3, "0");
    const finding: OpportunityFinding = {
      ...historyFinding,
      title: `Paging acceptance fixture ${suffix}`,
      url: pagingEvidence.url,
      assetRefs: [pagingEvidence.url],
      evidence: pagingEvidence,
    };
    return {
      id: `00000000-0000-4000-8100-${`${index + 1}`.padStart(12, "0")}`,
      organizationId: ORG_A,
      projectId: PROJECT_PAGING,
      target: "paging.example",
      scopeKey: "acceptance-paging-scope",
      dedupeKey: `acceptance-paging-dedupe-${suffix}`,
      detectorId: "page_review",
      detectorVersion: "1",
      kind: "page_review" as const,
      priorityBand: "low" as const,
      generatedJson: JSON.stringify(finding),
      evidenceSnapshotId: "acceptance-paging-snapshot",
      status: index === 120 ? ("dismissed" as const) : ("in_progress" as const),
      firstSeenAt: pagingEvidence.fetchedAt,
      lastSeenAt: new Date(
        Date.parse(pagingEvidence.fetchedAt) - index * 1000,
      ).toISOString(),
      lastEvaluatedAt: pagingEvidence.fetchedAt,
      revision: 1,
      mutationId: `acceptance-paging-mutation-${suffix}`,
    };
  });
  for (let offset = 0; offset < pagingItems.length; offset += 5) {
    await db
      .insert(work.opportunities)
      .values(pagingItems.slice(offset, offset + 5));
  }
  console.log(
    "Seeded isolated acceptance D1: two credential users, two organizations, four projects, fixture GSC grant, audit and bounded work lists.",
  );
} finally {
  await dispose();
}
