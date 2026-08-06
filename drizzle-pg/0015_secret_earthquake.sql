CREATE TABLE "project_subdomains" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"host" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"organic_keywords" integer,
	"organic_traffic" integer,
	"clicks" integer,
	"impressions" integer,
	"last_seen_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_subdomains" ADD CONSTRAINT "project_subdomains_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_subdomains_project_host_idx" ON "project_subdomains" USING btree ("project_id","host");