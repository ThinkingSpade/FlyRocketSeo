CREATE TABLE "project_report_settings" (
	"project_id" text PRIMARY KEY NOT NULL,
	"brand_name" text,
	"prepared_by" text,
	"logo_data_uri" text,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"token" text NOT NULL,
	"range_key" text NOT NULL,
	"title" text NOT NULL,
	"snapshot_json" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"revoked_at" text
);
--> statement-breakpoint
ALTER TABLE "project_report_settings" ADD CONSTRAINT "project_report_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "report_shares_token_idx" ON "report_shares" USING btree ("token");--> statement-breakpoint
CREATE INDEX "report_shares_project_created_idx" ON "report_shares" USING btree ("project_id","created_at");