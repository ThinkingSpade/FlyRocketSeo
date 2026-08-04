CREATE TABLE "project_city_sites" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"host" text NOT NULL,
	"subdomain_label" text NOT NULL,
	"city_name" text,
	"state_code" text,
	"location_code" integer,
	"parent_metro_code" integer,
	"match_status" text NOT NULL,
	"match_source" text DEFAULT 'auto' NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_city_sites" ADD CONSTRAINT "project_city_sites_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_city_sites_project_host_idx" ON "project_city_sites" USING btree ("project_id","host");--> statement-breakpoint
CREATE INDEX "project_city_sites_project_status_idx" ON "project_city_sites" USING btree ("project_id","match_status");