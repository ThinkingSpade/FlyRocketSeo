CREATE TABLE "opportunities" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"target" text NOT NULL,
	"scope_key" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"detector_id" text NOT NULL,
	"detector_version" text NOT NULL,
	"kind" text NOT NULL,
	"generated_json" text NOT NULL,
	"evidence_snapshot_id" text NOT NULL,
	"baseline_snapshot_id" text,
	"status" text DEFAULT 'not_started' NOT NULL,
	"observation_state" text DEFAULT 'observed' NOT NULL,
	"assignee_user_id" text,
	"implemented_at" text,
	"result_json" text,
	"first_seen_at" text NOT NULL,
	"last_seen_at" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"mutation_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"opportunity_id" text NOT NULL,
	"actor_user_id" text,
	"created_at" text NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"status" text NOT NULL,
	"evidence_snapshot_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"target" text NOT NULL,
	"scope_key" text NOT NULL,
	"detector_id" text NOT NULL,
	"detector_version" text NOT NULL,
	"fetched_at" text NOT NULL,
	"observed_from" text NOT NULL,
	"observed_to" text NOT NULL,
	"availability" text NOT NULL,
	"reasons_json" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"target" text NOT NULL,
	"schema_version" integer NOT NULL,
	"content_hash" text NOT NULL,
	"payload_json" text NOT NULL,
	"r2_key" text NOT NULL,
	"fetched_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_evidence_snapshot_id_opportunity_snapshots_id_fk" FOREIGN KEY ("evidence_snapshot_id") REFERENCES "public"."opportunity_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_baseline_snapshot_id_opportunity_snapshots_id_fk" FOREIGN KEY ("baseline_snapshot_id") REFERENCES "public"."opportunity_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_events" ADD CONSTRAINT "opportunity_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_events" ADD CONSTRAINT "opportunity_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_events" ADD CONSTRAINT "opportunity_events_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_events" ADD CONSTRAINT "opportunity_events_evidence_snapshot_id_opportunity_snapshots_id_fk" FOREIGN KEY ("evidence_snapshot_id") REFERENCES "public"."opportunity_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_runs" ADD CONSTRAINT "opportunity_runs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_runs" ADD CONSTRAINT "opportunity_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_snapshots" ADD CONSTRAINT "opportunity_snapshots_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_snapshots" ADD CONSTRAINT "opportunity_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "opportunities_dedupe_idx" ON "opportunities" USING btree ("organization_id","project_id","target","dedupe_key");--> statement-breakpoint
CREATE INDEX "opportunities_project_target_idx" ON "opportunities" USING btree ("organization_id","project_id","target","status");--> statement-breakpoint
CREATE INDEX "opportunity_events_task_idx" ON "opportunity_events" USING btree ("opportunity_id","created_at");--> statement-breakpoint
CREATE INDEX "opportunity_runs_project_idx" ON "opportunity_runs" USING btree ("organization_id","project_id","target","fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_snapshots_hash_idx" ON "opportunity_snapshots" USING btree ("organization_id","project_id","content_hash");--> statement-breakpoint
CREATE INDEX "opportunity_snapshots_project_idx" ON "opportunity_snapshots" USING btree ("project_id","fetched_at");