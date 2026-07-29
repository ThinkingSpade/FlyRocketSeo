CREATE TABLE "project_target_areas" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"kind" text NOT NULL,
	"location_code" integer NOT NULL,
	"label" text NOT NULL,
	"parent_country_code" integer NOT NULL,
	"source" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"confirmed_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gbp_connections" ADD COLUMN "account_name" text;--> statement-breakpoint
ALTER TABLE "project_target_areas" ADD CONSTRAINT "project_target_areas_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_target_areas_project_idx" ON "project_target_areas" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_target_areas_one_primary_per_project_idx" ON "project_target_areas" USING btree ("project_id") WHERE "project_target_areas"."is_primary" = true;