CREATE TABLE "analysis_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"feature" text NOT NULL,
	"params_json" text NOT NULL,
	"cache_key" text NOT NULL,
	"label" text NOT NULL,
	"ran_by" text,
	"run_count" integer DEFAULT 1 NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"last_ran_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analysis_runs_project_feature_idx" ON "analysis_runs" USING btree ("project_id","feature","last_ran_at");--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_runs_unique_inputs_idx" ON "analysis_runs" USING btree ("project_id","feature","cache_key");