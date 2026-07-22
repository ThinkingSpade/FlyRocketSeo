CREATE TABLE "brand_visibility_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"target" text NOT NULL,
	"captured_on" text NOT NULL,
	"total_mentions" integer,
	"chatgpt_mentions" integer,
	"google_mentions" integer,
	"target_share_pct" real,
	"result_json" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_visibility_snapshots" ADD CONSTRAINT "brand_visibility_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_visibility_snapshots_project_id_idx" ON "brand_visibility_snapshots" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_visibility_snapshots_unique_day_idx" ON "brand_visibility_snapshots" USING btree ("project_id","target","captured_on");