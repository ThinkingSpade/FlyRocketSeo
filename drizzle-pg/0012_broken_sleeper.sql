CREATE TABLE "gbp_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"location_name" text NOT NULL,
	"connected_by_user_id" text NOT NULL,
	"connected_account_email" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gbp_scheduled_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"content" text NOT NULL,
	"media_url" text,
	"call_to_action_type" text,
	"call_to_action_url" text,
	"scheduled_at" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_post_id" text,
	"error_message" text,
	"created_by_user_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gbp_connections" ADD CONSTRAINT "gbp_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gbp_connections" ADD CONSTRAINT "gbp_connections_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gbp_scheduled_posts" ADD CONSTRAINT "gbp_scheduled_posts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gbp_connections_project_idx" ON "gbp_connections" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "gbp_connections_organization_idx" ON "gbp_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "gbp_scheduled_posts_project_idx" ON "gbp_scheduled_posts" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "gbp_scheduled_posts_status_scheduled_idx" ON "gbp_scheduled_posts" USING btree ("status","scheduled_at");