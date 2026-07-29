import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { organization, user } from "./better-auth-schema";

export const userOnboardingAnswers = sqliteTable(
  "user_onboarding_answers",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    interestedFeatures: text("interested_features").notNull().default("[]"),
    workFor: text("work_for"),
    clientWebsiteCount: text("client_website_count"),
    foundVia: text("found_via"),
    mcpSetupIntent: text("mcp_setup_intent"),
    completedAt: text("completed_at"),
    // Set when the user resolves the Search Console ask, either in current
    // onboarding or via the one-time re-engagement nudge for legacy users.
    // Null = not yet shown/resolved.
    gscNudgeDismissedAt: text("gsc_nudge_dismissed_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("user_onboarding_answers_organization_idx").on(table.organizationId),
  ],
);

// Projects for keyword research
export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    domain: text("domain"),
    // Default DataForSEO location/language for the project, set during
    // onboarding and reused by every project-scoped data call.
    locationCode: integer("location_code").notNull().default(2840),
    languageCode: text("language_code").notNull().default("en"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    // Soft delete: archived projects are hidden everywhere but their data
    // (keywords, rank tracking, audits) is preserved.
    archivedAt: text("archived_at"),
  },
  (table) => [
    // Only the auto-created Default/null-domain project is a singleton. This
    // guards the get-or-create race that can happen when several requests enter
    // a new organization at once, without forbidding users from manually
    // creating multiple projects with the same name or domain later.
    uniqueIndex("projects_one_default_per_organization_idx")
      .on(table.organizationId)
      .where(
        sql`${table.name} = 'Default' AND ${table.domain} IS NULL AND ${table.archivedAt} IS NULL`,
      ),
    // Every project listing filters by organization; the partial-unique index
    // above only covers the Default-project row, so without this the org-scoped
    // list queries seq-scan. Per-org row counts are small, so the archived/
    // created_at ordering sorts cheaply on top of this single-column lookup.
    index("projects_organization_id_idx").on(table.organizationId),
  ],
);

// User-saved keywords within a project. This is the canonical saved list.
export const savedKeywords = sqliteTable(
  "saved_keywords",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    locationCode: integer("location_code").notNull().default(2840),
    languageCode: text("language_code").notNull().default("en"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("saved_keywords_unique_project_keyword_location_language").on(
      table.projectId,
      table.keyword,
      table.locationCode,
      table.languageCode,
    ),
    index("saved_keywords_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);

export const savedKeywordTags = sqliteTable(
  "saved_keyword_tags",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    // Palette key (e.g. "blue", "rose"). Null = derive a stable color from the
    // tag id at render time. See src/shared/tag-colors.ts.
    color: text("color"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("saved_keyword_tags_project_normalized_name_idx").on(
      table.projectId,
      table.normalizedName,
    ),
    index("saved_keyword_tags_project_name_idx").on(
      table.projectId,
      table.name,
    ),
  ],
);

export const savedKeywordTagAssignments = sqliteTable(
  "saved_keyword_tag_assignments",
  {
    savedKeywordId: text("saved_keyword_id")
      .notNull()
      .references(() => savedKeywords.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => savedKeywordTags.id, { onDelete: "cascade" }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("saved_keyword_tag_assignments_unique_idx").on(
      table.savedKeywordId,
      table.tagId,
    ),
    // No standalone index on savedKeywordId — the unique index above has it as
    // its leftmost column, so it already serves savedKeywordId lookups.
    index("saved_keyword_tag_assignments_tag_idx").on(table.tagId),
  ],
);

// Latest cached metrics for a keyword within a project.
// This is joined onto savedKeywords when rendering the saved keyword list.
export const keywordMetrics = sqliteTable(
  "keyword_metrics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull().default("en"),
    searchVolume: integer("search_volume"),
    cpc: real("cpc"),
    competition: real("competition"),
    keywordDifficulty: integer("keyword_difficulty"),
    intent: text("intent"),
    monthlySearches: text("monthly_searches"),
    fetchedAt: text("fetched_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("keyword_metrics_unique_project_keyword_location_language").on(
      table.projectId,
      table.keyword,
      table.locationCode,
      table.languageCode,
    ),
    index("keyword_metrics_lookup_idx").on(
      table.projectId,
      table.keyword,
      table.locationCode,
      table.languageCode,
      table.fetchedAt,
    ),
  ],
);

// ============================================================================
// Rank Tracking tables
// ============================================================================

// One configuration per project+domain — defines what domain to track and how
export const rankTrackingConfigs = sqliteTable(
  "rank_tracking_configs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    locationCode: integer("location_code").notNull().default(2840),
    languageCode: text("language_code").notNull().default("en"),
    devices: text("devices", {
      enum: ["both", "desktop", "mobile"],
    })
      .notNull()
      .default("both"),
    serpDepth: integer("serp_depth").notNull(),
    scheduleInterval: text("schedule_interval", {
      enum: ["daily", "weekly", "monthly", "manual"],
    })
      .notNull()
      .default("weekly"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    lastCheckedAt: text("last_checked_at"),
    nextCheckAt: text("next_check_at"),
    lastSkipReason: text("last_skip_reason"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("rank_tracking_configs_project_domain_location_idx").on(
      table.projectId,
      table.domain,
      table.locationCode,
    ),
  ],
);

// Keywords tracked per domain config
export const rankTrackingKeywords = sqliteTable(
  "rank_tracking_keywords",
  {
    id: text("id").primaryKey(),
    configId: text("config_id")
      .notNull()
      .references(() => rankTrackingConfigs.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    searchVolume: integer("search_volume"),
    keywordDifficulty: integer("keyword_difficulty"),
    cpc: real("cpc"),
    metricsFetchedAt: text("metrics_fetched_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("rank_tracking_keywords_config_keyword_idx").on(
      table.configId,
      table.keyword,
    ),
  ],
);

// One row per check execution (manual or scheduled).
// A partial unique index on `config_id WHERE status IN ('pending','running')`
// enforces at most one in-flight run per config at the DB level, which is how
// duplicate-trigger protection is implemented — INSERT of a second pending run
// for the same config fails with a unique-constraint violation.
export const rankCheckRuns = sqliteTable(
  "rank_check_runs",
  {
    id: text("id").primaryKey(),
    configId: text("config_id")
      .notNull()
      .references(() => rankTrackingConfigs.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["pending", "running", "completed", "failed"],
    })
      .notNull()
      .default("pending"),
    keywordsTotal: integer("keywords_total").notNull().default(0),
    keywordsChecked: integer("keywords_checked").notNull().default(0),
    isSubsetRun: integer("is_subset_run", { mode: "boolean" })
      .notNull()
      .default(false),
    errorMessage: text("error_message"),
    startedAt: text("started_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("rank_check_runs_config_idx").on(table.configId, table.startedAt),
    index("rank_check_runs_project_idx").on(table.projectId, table.startedAt),
    uniqueIndex("rank_check_runs_one_active_per_config_idx")
      .on(table.configId)
      .where(sql`${table.status} IN ('pending', 'running')`),
  ],
);

// One row per keyword per device per check run
export const rankSnapshots = sqliteTable(
  "rank_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id")
      .notNull()
      .references(() => rankCheckRuns.id, { onDelete: "cascade" }),
    // No FK to rankTrackingKeywords — intentional. Historical snapshots are
    // preserved after a keyword is removed from tracking so users can still
    // see past position data for deleted keywords.
    trackingKeywordId: text("tracking_keyword_id").notNull(),
    keyword: text("keyword").notNull(),
    device: text("device", { enum: ["desktop", "mobile"] }).notNull(),
    // null = the target wasn't found within this config's configured search
    // depth, which is per-config (10-100, default 40 — see
    // rankTrackingConfigs.serpDepth), NOT a fixed "top 20".
    position: integer("position"),
    url: text("url"),
    serpFeatures: text("serp_features"), // JSON array of feature type strings
    checkedAt: text("checked_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // No standalone index on runId — the unique index below has it as its
    // leftmost column, so it already serves runId lookups.
    index("rank_snapshots_keyword_device_idx").on(
      table.trackingKeywordId,
      table.device,
      table.checkedAt,
    ),
    uniqueIndex("rank_snapshots_run_keyword_device_idx").on(
      table.runId,
      table.trackingKeywordId,
      table.device,
    ),
  ],
);

// ============================================================================
// Site Audit tables
// ============================================================================

// One row per audit run
export const audits = sqliteTable(
  "audits",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    startedByUserId: text("started_by_user_id").notNull(),
    startUrl: text("start_url").notNull(),
    status: text("status", {
      enum: ["running", "completed", "failed"],
    })
      .notNull()
      .default("running"),
    workflowInstanceId: text("workflow_instance_id"),
    // JSON config: { maxPages, lighthouseStrategy }
    config: text("config").notNull().default("{}"),
    // Progress & summary
    pagesCrawled: integer("pages_crawled").notNull().default(0),
    pagesTotal: integer("pages_total").notNull().default(0),
    lighthouseTotal: integer("lighthouse_total").notNull().default(0),
    lighthouseCompleted: integer("lighthouse_completed").notNull().default(0),
    lighthouseFailed: integer("lighthouse_failed").notNull().default(0),
    currentPhase: text("current_phase").default("discovery"),
    startedAt: text("started_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("audits_project_id_idx").on(table.projectId),
    index("audits_started_by_user_id_idx").on(table.startedByUserId),
  ],
);

// One row per crawled page
export const auditPages = sqliteTable(
  "audit_pages",
  {
    id: text("id").primaryKey(),
    auditId: text("audit_id")
      .notNull()
      .references(() => audits.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    statusCode: integer("status_code"),
    redirectUrl: text("redirect_url"),
    // Metadata
    title: text("title"),
    metaDescription: text("meta_description"),
    canonicalUrl: text("canonical_url"),
    robotsMeta: text("robots_meta"),
    // Open Graph
    ogTitle: text("og_title"),
    ogDescription: text("og_description"),
    ogImage: text("og_image"),
    // Headings
    h1Count: integer("h1_count").notNull().default(0),
    h2Count: integer("h2_count").notNull().default(0),
    h3Count: integer("h3_count").notNull().default(0),
    h4Count: integer("h4_count").notNull().default(0),
    h5Count: integer("h5_count").notNull().default(0),
    h6Count: integer("h6_count").notNull().default(0),
    headingOrderJson: text("heading_order_json"),
    // Content
    wordCount: integer("word_count").notNull().default(0),
    // Images
    imagesTotal: integer("images_total").notNull().default(0),
    imagesMissingAlt: integer("images_missing_alt").notNull().default(0),
    imagesJson: text("images_json"),
    // Links
    internalLinkCount: integer("internal_link_count").notNull().default(0),
    externalLinkCount: integer("external_link_count").notNull().default(0),
    // Structured data
    hasStructuredData: integer("has_structured_data", { mode: "boolean" })
      .notNull()
      .default(false),
    // Hreflang
    hreflangTagsJson: text("hreflang_tags_json"),
    // Indexability
    isIndexable: integer("is_indexable", { mode: "boolean" })
      .notNull()
      .default(true),
    // Performance
    responseTimeMs: integer("response_time_ms"),
  },
  (table) => [index("audit_pages_audit_id_idx").on(table.auditId)],
);

// One row per Lighthouse test (mobile + desktop per page).
export const auditLighthouseResults = sqliteTable(
  "audit_lighthouse_results",
  {
    id: text("id").primaryKey(),
    auditId: text("audit_id")
      .notNull()
      .references(() => audits.id, { onDelete: "cascade" }),
    pageId: text("page_id")
      .notNull()
      .references(() => auditPages.id, { onDelete: "cascade" }),
    strategy: text("strategy", { enum: ["mobile", "desktop"] }).notNull(),
    performanceScore: integer("performance_score"),
    accessibilityScore: integer("accessibility_score"),
    bestPracticesScore: integer("best_practices_score"),
    seoScore: integer("seo_score"),
    lcpMs: real("lcp_ms"),
    cls: real("cls"),
    inpMs: real("inp_ms"),
    ttfbMs: real("ttfb_ms"),
    errorMessage: text("error_message"),
    r2Key: text("r2_key"),
    payloadSizeBytes: integer("payload_size_bytes"),
  },
  (table) => [index("audit_lighthouse_results_audit_id_idx").on(table.auditId)],
);

/**
 * One suggested on-page fix: a rewritten title, meta description, H1, or image
 * alt for a specific URL. Rows are regenerated in place (see the unique index)
 * so re-running generation refreshes suggestions without losing the user's
 * approve/exclude decisions on elements that haven't changed.
 */
export const pageOptimizations = sqliteTable(
  "page_optimizations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    element: text("element", {
      enum: ["title", "meta", "h1", "alt"],
    }).notNull(),
    // Which image an "alt" suggestion is for; empty for page-level elements.
    // NOT NULL because both SQLite and Postgres treat NULLs as distinct in a
    // unique index, which would let duplicate page-level rows through.
    target: text("target").notNull().default(""),
    currentValue: text("current_value"),
    suggestedValue: text("suggested_value").notNull(),
    // Why we suggest it, shown to the user next to the diff.
    reason: text("reason").notNull(),
    // "rules" is the free keyword-informed generator; "ai" is the metered
    // OpenRouter rewrite.
    source: text("source", { enum: ["rules", "ai"] })
      .notNull()
      .default("rules"),
    status: text("status", { enum: ["pending", "approved", "excluded"] })
      .notNull()
      .default("pending"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("page_optimizations_project_id_idx").on(table.projectId),
    // One live suggestion per element per URL, so regeneration upserts.
    uniqueIndex("page_optimizations_unique_element_idx").on(
      table.projectId,
      table.url,
      table.element,
      table.target,
    ),
  ],
);

/**
 * A dated snapshot of a project's AI-search visibility for its own brand or
 * domain, captured each time the user runs the project analysis. Stateless
 * Brand Lookup can only show a single point in time; these rows are what make
 * the month-over-month trend and the Client Report's AI Visibility chapter
 * possible. One row per day per target (see the unique index) so re-running the
 * same day refreshes in place instead of piling up.
 */
export const brandVisibilitySnapshots = sqliteTable(
  "brand_visibility_snapshots",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The resolved brand/domain this snapshot is for (the project's own target).
    target: text("target").notNull(),
    // Capture date as YYYY-MM-DD, so one analysis per day upserts in place.
    capturedOn: text("captured_on").notNull(),
    totalMentions: integer("total_mentions"),
    chatgptMentions: integer("chatgpt_mentions"),
    googleMentions: integer("google_mentions"),
    // The target's share of voice among the compared competitors, 0..100.
    targetSharePct: real("target_share_pct"),
    // The full shaped BrandLookupResult, so the report and opportunities render
    // without re-charging a lookup.
    resultJson: text("result_json").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("brand_visibility_snapshots_project_id_idx").on(table.projectId),
    // One live snapshot per target per day, so a same-day re-run upserts.
    uniqueIndex("brand_visibility_snapshots_unique_day_idx").on(
      table.projectId,
      table.target,
      table.capturedOn,
    ),
  ],
);

/**
 * A durable, team-visible record of every analysis a project has run, so a tab
 * can show "you last ran this 2 hours ago" and restore that result instead of
 * starting a fresh (metered) run.
 *
 * Deliberately lightweight: the result payload is NOT stored here. `cacheKey`
 * points at the R2 object the run already wrote, which stays readable past its
 * soft TTL — so restoring costs nothing and no payload is duplicated (and rows
 * can't approach D1's per-row size limit).
 *
 * One row per distinct set of inputs (see the unique index): re-running the
 * same analysis bumps `runCount` and `lastRanAt` rather than appending, which
 * keeps the list a bounded "things you've analyzed, most recent first".
 */
export const analysisRuns = sqliteTable(
  "analysis_runs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Stable tab/feature slug, e.g. "domain_overview" or "backlinks".
    feature: text("feature").notNull(),
    // Canonicalized inputs, so a restored run can repopulate the tab's form.
    paramsJson: text("params_json").notNull(),
    // The R2 cache key holding this run's result.
    cacheKey: text("cache_key").notNull(),
    // Short human summary for the history list, e.g. the domain or keyword.
    label: text("label").notNull(),
    ranBy: text("ran_by"),
    runCount: integer("run_count").notNull().default(1),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    lastRanAt: text("last_ran_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Drives both "latest run for this tab" and the recent-runs list.
    index("analysis_runs_project_feature_idx").on(
      table.projectId,
      table.feature,
      table.lastRanAt,
    ),
    // One row per distinct input set, so a re-run updates instead of piling up.
    uniqueIndex("analysis_runs_unique_inputs_idx").on(
      table.projectId,
      table.feature,
      table.cacheKey,
    ),
  ],
);

// Google geotargets (countries, regions, metros/DMAs, cities). Lives in D1
// rather than a bundled table because the full list is large and `src/shared`
// is in the Worker's startup graph — the same graph whose size previously
// caused multi-second cold starts. Seeded by scripts/seed-geo-locations.ts.
export const geoLocations = sqliteTable(
  "geo_locations",
  {
    code: integer("code").primaryKey(),
    name: text("name").notNull(),
    /** DataForSEO location_type, e.g. "Country", "DMA Region", "City". */
    type: text("type").notNull(),
    /** Two-letter state/region code where applicable, e.g. "TX". */
    stateCode: text("state_code"),
    /** The metro this place rolls up into, when it has one. */
    parentMetroCode: integer("parent_metro_code"),
    countryCode: integer("country_code").notNull(),
    /** NEVER populated: DataForSEO's `google_ads/locations` endpoint — the
     * only source anything in `src/server/features/geo` seeds this table
     * from — has no such field on any row (see `geoLocationSeedMapping.ts`'s
     * own `GeoLocationRow` comment). Column kept rather than dropped so a
     * future enrichment step has somewhere to write one; nothing today reads
     * it (`GeoLocationRepository.search` orders by type-priority + name
     * instead — see `searchOrdering.ts` for why). */
    population: integer("population"),
  },
  (table) => [
    // The picker searches by name prefix within a country. Without this the
    // search is a full scan on every keystroke.
    index("geo_locations_country_name_idx").on(table.countryCode, table.name),
    index("geo_locations_type_idx").on(table.type),
  ],
);

// Confirmed (or proposed) target geography for a project -- the output of
// the detection cascade (Task 3 of the geo-activation plan) and the
// confirmation banner (Task 5), read by resolveGeo once a tab asks for
// area-scoped data (Task 6). Nothing in this task (Task 2) queries the table
// yet -- it only exists so later tasks have somewhere to write.
//
// `confirmedAt` is the load-bearing column: NULL means this row is a
// PROPOSAL surfaced by detection but never accepted by the user, and it MUST
// NOT change what any tab queries -- only an explicit confirm/manual-set call
// (Task 4) may write a value here. Treat a null confirmedAt exactly like
// "this row doesn't exist yet" everywhere except the confirmation banner
// itself, which is the one place a pending proposal needs to be visible.
export const projectTargetAreas = sqliteTable(
  "project_target_areas",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Mirrors TargetAreaKind (src/shared/geo/types.ts), spelled out locally
    // rather than imported -- matches how every other enum-like column in
    // this file (e.g. rankTrackingConfigs.devices below) is self-contained.
    kind: text("kind", {
      enum: ["metro", "city", "region", "country"],
    }).notNull(),
    locationCode: integer("location_code").notNull(),
    label: text("label").notNull(),
    parentCountryCode: integer("parent_country_code").notNull(),
    // Which free signal produced this row. "manual" is the picker override
    // and is confirmed immediately; "gbp"/"gsc" are the detection cascade's
    // two signals, highest-confidence first.
    source: text("source", {
      enum: ["gbp", "gsc", "manual"],
    }).notNull(),
    isPrimary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(false),
    // NULL = an unconfirmed proposal. See this table's own header comment.
    confirmedAt: text("confirmed_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Every read this table will ever serve (getTargetArea, the scope
    // control, the confirmation banner) starts from a projectId, and the
    // partial index below only covers the single primary row -- most queries
    // need every row for a project, not just that one.
    index("project_target_areas_project_idx").on(table.projectId),
    // At most one PRIMARY area per project. Partial rather than a plain
    // unique constraint on projectId, because a project can hold any number
    // of non-primary rows (a rejected proposal, a secondary confirmed area) --
    // only "the one primary" is exclusive. `= 1` is SQLite's own on-disk
    // representation for this boolean-mode column (contrast the Postgres
    // sibling's native `= true`) -- schema-parity.test.ts's
    // uniqueColumnTuples only asserts a WHERE clause is present on both
    // dialects, never its literal text, so the two are intentionally not
    // required to match verbatim.
    uniqueIndex("project_target_areas_one_primary_per_project_idx")
      .on(table.projectId)
      .where(sql`${table.isPrimary} = 1`),
  ],
);

// ============================================================================
// Google Business Profile write tables
// ============================================================================
// The read-only GBP Audit (gbpAudit.ts) sources its data from DataForSEO and
// needs none of this. These tables back the WRITE half of Local SEO: posts
// and listing-field updates via Google's own Business Profile API, gated on
// the business.manage OAuth scope (see src/shared/gbp.ts and
// src/server/features/gbp/selfHostedGbpOAuth.ts).

// Which Google Business Profile location a project publishes/patches to, and
// whose business.manage grant to use for it. Mirrors gscConnections' shape
// exactly, but is a wholly SEPARATE table/grant -- connecting, reconnecting or
// disconnecting GBP must never read or write a project's gscConnections row.
export const gbpConnections = sqliteTable(
  "gbp_connections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Bare Business Information API resource name, e.g. "locations/987654321"
    // -- that API's own locations.get/locations.patch require exactly this
    // shape (NOT prefixed with "accounts/*"). Never normalize -- Google's API
    // matches it verbatim.
    locationName: text("location_name").notNull(),
    // The account's OWN resource name, e.g. "accounts/123456789" -- kept
    // separate from locationName because the two Google APIs this feature
    // calls disagree on what a location's parent path looks like: Business
    // Information API's locations.get/patch take the bare locationName above,
    // while the legacy v4 accounts.locations.localPosts.create requires the
    // composed "accounts/*/locations/*" parent, which only exists by joining
    // this column with locationName. Nullable so pre-existing rows (from
    // before this column existed) don't need a backfill -- GbpWriteService
    // treats a null value as "needs reconnect" rather than composing a
    // broken parent. Not to be confused with Google's OWN "accountName"
    // field, which is a human-readable business name -- see
    // GbpConnectionService's GbpLocationOption.accountDisplayName for that.
    accountName: text("account_name"),
    // Whose google-business-profile grant getAccessToken should use.
    connectedByUserId: text("connected_by_user_id").notNull(),
    connectedAccountEmail: text("connected_account_email"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // One connected location per project in v1; reconnecting replaces the row.
    uniqueIndex("gbp_connections_project_idx").on(table.projectId),
    index("gbp_connections_organization_idx").on(table.organizationId),
  ],
);

/**
 * One row per composed Google Business Profile post, queued for scheduled
 * publish. `status` is the state machine gbpPostSchedule.ts's pure model
 * reasons over (draft -> scheduled -> publishing -> published, with a
 * terminal failed) -- see that module for the due-selection, ordering, and
 * double-publish-guard logic, and GbpWriteService for what actually flips
 * these transitions.
 */
export const gbpScheduledPosts = sqliteTable(
  "gbp_scheduled_posts",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    mediaUrl: text("media_url"),
    // Google's LocalPost.CallToAction.ActionType values, minus
    // ACTION_TYPE_UNSPECIFIED (a null column already means "no CTA").
    callToActionType: text("call_to_action_type", {
      enum: ["BOOK", "ORDER", "SHOP", "LEARN_MORE", "SIGN_UP", "CALL"],
    }),
    // Required for every actionType except CALL (Google rejects a url on a
    // CALL action) -- see gbpPostSchedule.ts's validateScheduledPost.
    callToActionUrl: text("call_to_action_url"),
    scheduledAt: text("scheduled_at").notNull(),
    status: text("status", {
      enum: ["draft", "scheduled", "publishing", "published", "failed"],
    })
      .notNull()
      .default("draft"),
    // Google's resource name for the created post, once published.
    publishedPostId: text("published_post_id"),
    errorMessage: text("error_message"),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("gbp_scheduled_posts_project_idx").on(table.projectId),
    // Drives "which posts are due" (gbpPostSchedule.ts's selectDuePosts) --
    // without it, finding due posts across all projects is a full table scan.
    index("gbp_scheduled_posts_status_scheduled_idx").on(
      table.status,
      table.scheduledAt,
    ),
  ],
);

// What the business behind a project actually sells, who buys it, and --
// load-bearing -- what it does NOT do.
//
// Keyword expansion is string similarity: a seed of "dfw vending" returns
// "vending machines for sale dfw" because the tokens overlap, with no way to
// know that a vending OPERATOR (who places and services machines in offices)
// and a machine RESELLER are different businesses chasing different buyers.
// Nothing else in the schema carries that distinction -- a project is a name,
// a domain and a market -- so every ranking, filter and suggestion downstream
// had to treat token overlap as relevance. This table is where the difference
// is written down once so they don't have to.
//
// Geography deliberately lives in `project_target_areas`, NOT here.
// `serviceAreaKind` records the SHAPE of the service area (does this client
// sell down the street or worldwide?), which is what decides whether generated
// seeds should carry geo modifiers at all; the coordinates themselves stay in
// the one table that already owns them, with its own propose/confirm
// lifecycle. Two stores for one fact would drift.
//
// `confirmedAt` mirrors that same lifecycle: an AI-drafted profile is a
// PROPOSAL until a human accepts it. Treat a null `confirmedAt` as "not yet
// true of this client" everywhere except the profile editor itself.
export const projectProfiles = sqliteTable(
  "project_profiles",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** What they sell, in their own words. */
    offer: text("offer").notNull().default(""),
    /** Who buys it -- the customer the good keywords belong to. */
    customer: text("customer").notNull().default(""),
    /**
     * What this business explicitly does NOT do, in plain language ("we
     * don't sell machines"). The single highest-value field here: it is the
     * only input that can demote a keyword the expansion API was RIGHT to
     * return and the client is still wrong to chase.
     */
    exclusions: text("exclusions").notNull().default(""),
    /** Brand names to treat as branded search. One per line. */
    brandTerms: text("brand_terms").notNull().default(""),
    // Drives whether generated seeds carry geo modifiers: a local operator
    // wants "office coffee service dallas", a global SaaS wants the same
    // phrase with the city stripped out as noise.
    serviceAreaKind: text("service_area_kind", {
      enum: ["local", "regional", "national", "global"],
    })
      .notNull()
      .default("national"),
    // Which path wrote this row. "ai" rows arrive unconfirmed by definition.
    source: text("source", { enum: ["ai", "manual"] })
      .notNull()
      .default("manual"),
    draftedAt: text("drafted_at"),
    // NULL = an unconfirmed AI draft. See this table's own header comment.
    confirmedAt: text("confirmed_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // One profile per project, and every read starts from a projectId -- the
    // unique index serves both.
    uniqueIndex("project_profiles_project_idx").on(table.projectId),
  ],
);

// One keyword's fit against the profile above, cached so re-opening a run
// never re-derives (and, once Phase 2 lands, never re-pays for) a verdict.
//
// `source` distinguishes the two producers: "rules" is the free
// exclusion-term matcher, which needs no API key and is what a deployment
// without OPENROUTER_API_KEY gets; "ai" is the batched semantic pass that
// supersedes it. A rules verdict is never upgraded in place -- the AI pass
// overwrites the row, so the newest write wins and `source` says which
// produced it.
export const keywordFitVerdicts = sqliteTable(
  "keyword_fit_verdicts",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    verdict: text("verdict", {
      enum: ["on-offer", "adjacent", "wrong-customer"],
    }).notNull(),
    /** Why, in words a user can read and disagree with. */
    reason: text("reason").notNull().default(""),
    source: text("source", { enum: ["rules", "ai"] }).notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // The only read shape: "every verdict this project already has", then
    // matched against the current result set in memory.
    uniqueIndex("keyword_fit_verdicts_project_keyword_idx").on(
      table.projectId,
      table.keyword,
    ),
  ],
);
