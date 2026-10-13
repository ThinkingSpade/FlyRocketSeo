import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";
import { organization } from "./better-auth-schema";

// No cascade: ownership and retired-key fences must survive project deletion.
export const opportunityEvidenceObjects = sqliteTable(
  "opportunity_evidence_objects",
  {
    key: text("key").primaryKey(),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    contentHash: text("content_hash").notNull(),
    state: text("state", {
      enum: ["writing", "ready", "deleting", "deleted"],
    }).notNull(),
    ownerToken: text("owner_token"),
    createdAt: text("created_at").notNull(),
    touchedAt: text("touched_at").notNull(),
    lastActorUserId: text("last_actor_user_id"),
  },
  (table) => [
    index("opportunity_evidence_objects_scope_idx").on(
      table.organizationId,
      table.projectId,
      table.state,
    ),
  ],
);

export const opportunitySnapshots = sqliteTable(
  "opportunity_snapshots",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    target: text("target").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    contentHash: text("content_hash").notNull(),
    payloadJson: text("payload_json").notNull(),
    r2Key: text("r2_key").notNull(),
    fetchedAt: text("fetched_at").notNull(),
  },
  (table) => [
    uniqueIndex("opportunity_snapshots_hash_idx").on(
      table.organizationId,
      table.projectId,
      table.contentHash,
    ),
    index("opportunity_snapshots_project_idx").on(
      table.projectId,
      table.fetchedAt,
    ),
  ],
);

export const opportunities = sqliteTable(
  "opportunities",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    target: text("target").notNull(),
    scopeKey: text("scope_key").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    detectorId: text("detector_id").notNull(),
    detectorVersion: text("detector_version").notNull(),
    kind: text("kind", {
      enum: ["page_decline", "page_review", "internal_link"],
    }).notNull(),
    priorityBand: text("priority_band", { enum: ["high", "medium", "low"] })
      .notNull()
      .default("low"),
    generatedJson: text("generated_json").notNull(),
    evidenceSnapshotId: text("evidence_snapshot_id")
      .notNull()
      .references(() => opportunitySnapshots.id, { onDelete: "no action" }),
    baselineSnapshotId: text("baseline_snapshot_id").references(
      () => opportunitySnapshots.id,
      { onDelete: "no action" },
    ),
    status: text("status", {
      enum: [
        "not_started",
        "in_progress",
        "implemented",
        "results_pending",
        "measured",
        "dismissed",
      ],
    })
      .notNull()
      .default("not_started"),
    observationState: text("observation_state", {
      enum: ["observed", "no_longer_observed"],
    })
      .notNull()
      .default("observed"),
    assigneeUserId: text("assignee_user_id"),
    implementedAt: text("implemented_at"),
    resultJson: text("result_json"),
    firstSeenAt: text("first_seen_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    lastEvaluatedAt: text("last_evaluated_at").notNull().default(""),
    revision: integer("revision").notNull().default(1),
    mutationId: text("mutation_id").notNull(),
  },
  (table) => [
    uniqueIndex("opportunities_dedupe_idx").on(
      table.organizationId,
      table.projectId,
      table.target,
      table.dedupeKey,
    ),
    index("opportunities_project_target_idx").on(
      table.organizationId,
      table.projectId,
      table.target,
      table.status,
    ),
  ],
);

export const opportunityEvents = sqliteTable(
  "opportunity_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id"),
    createdAt: text("created_at").notNull(),
    kind: text("kind", {
      enum: [
        "created",
        "updated",
        "observed",
        "no_longer_observed",
        "measurement",
      ],
    }).notNull(),
    note: text("note"),
    resultJson: text("result_json"),
    revision: integer("revision").notNull().default(0),
    status: text("status", {
      enum: [
        "not_started",
        "in_progress",
        "implemented",
        "results_pending",
        "measured",
        "dismissed",
      ],
    }).notNull(),
    evidenceSnapshotId: text("evidence_snapshot_id")
      .notNull()
      .references(() => opportunitySnapshots.id, { onDelete: "no action" }),
  },
  (table) => [
    index("opportunity_events_task_idx").on(
      table.opportunityId,
      table.createdAt,
    ),
  ],
);

export const opportunityRuns = sqliteTable(
  "opportunity_runs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    target: text("target").notNull(),
    scopeKey: text("scope_key").notNull(),
    detectorId: text("detector_id").notNull(),
    detectorVersion: text("detector_version").notNull(),
    fetchedAt: text("fetched_at").notNull(),
    observedFrom: text("observed_from").notNull(),
    observedTo: text("observed_to").notNull(),
    availability: text("availability", {
      enum: ["ready", "unavailable", "insufficient"],
    }).notNull(),
    reasonsJson: text("reasons_json").notNull(),
  },
  (table) => [
    index("opportunity_runs_project_idx").on(
      table.organizationId,
      table.projectId,
      table.target,
      table.fetchedAt,
    ),
  ],
);
