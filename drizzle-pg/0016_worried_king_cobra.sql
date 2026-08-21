CREATE TABLE "harvest_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"dropped_on" text NOT NULL,
	"matched" integer DEFAULT 0 NOT NULL,
	"completed_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "harvested_domains" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"domain" text NOT NULL,
	"matched_term" text NOT NULL,
	"dropped_on" text NOT NULL,
	"domain_rating" integer,
	"is_available" boolean,
	"availability_checked_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN "domain_expiration_json" text;--> statement-breakpoint
ALTER TABLE "harvest_runs" ADD CONSTRAINT "harvest_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvested_domains" ADD CONSTRAINT "harvested_domains_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "harvest_runs_project_date_idx" ON "harvest_runs" USING btree ("project_id","dropped_on");--> statement-breakpoint
CREATE INDEX "harvested_domains_project_id_idx" ON "harvested_domains" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "harvested_domains_project_domain_idx" ON "harvested_domains" USING btree ("project_id","domain");