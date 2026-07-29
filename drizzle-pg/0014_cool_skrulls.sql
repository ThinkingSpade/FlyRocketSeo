CREATE TABLE "keyword_fit_verdicts" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"keyword" text NOT NULL,
	"verdict" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"offer" text DEFAULT '' NOT NULL,
	"customer" text DEFAULT '' NOT NULL,
	"exclusions" text DEFAULT '' NOT NULL,
	"brand_terms" text DEFAULT '' NOT NULL,
	"service_area_kind" text DEFAULT 'national' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"drafted_at" text,
	"confirmed_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "keyword_fit_verdicts" ADD CONSTRAINT "keyword_fit_verdicts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_profiles" ADD CONSTRAINT "project_profiles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "keyword_fit_verdicts_project_keyword_idx" ON "keyword_fit_verdicts" USING btree ("project_id","keyword");--> statement-breakpoint
CREATE UNIQUE INDEX "project_profiles_project_idx" ON "project_profiles" USING btree ("project_id");