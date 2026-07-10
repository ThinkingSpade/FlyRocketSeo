import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { projects } from "./app.schema";

// ============================================================================
// Client Report tables (branding + public share links)
// ============================================================================

// Per-project white-label branding for the client report: agency/brand name,
// a "prepared by" line, and a small logo. The logo is stored as a data URI
// (validated ≤ ~128KB raster) so printing and public shares never depend on
// an external image host being up.
export const projectReportSettings = sqliteTable("project_report_settings", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  brandName: text("brand_name"),
  preparedBy: text("prepared_by"),
  logoDataUri: text("logo_data_uri"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

// Public, revocable share links for the client report. Each share freezes a
// validated snapshot of the report at creation time — the public page renders
// stored data only, so a link never triggers new data-provider spend and "the
// March report" keeps saying what it said in March.
export const reportShares = sqliteTable(
  "report_shares",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // 256-bit URL-safe secret; the only public lookup key.
    token: text("token").notNull(),
    rangeKey: text("range_key").notNull(),
    title: text("title").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    // Soft revocation: the public route treats a revoked share as missing.
    revokedAt: text("revoked_at"),
  },
  (table) => [
    uniqueIndex("report_shares_token_idx").on(table.token),
    index("report_shares_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);
