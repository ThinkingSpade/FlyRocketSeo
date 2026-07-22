CREATE TABLE "page_optimizations" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"url" text NOT NULL,
	"element" text NOT NULL,
	"target" text DEFAULT '' NOT NULL,
	"current_value" text,
	"suggested_value" text NOT NULL,
	"reason" text NOT NULL,
	"source" text DEFAULT 'rules' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "page_optimizations" ADD CONSTRAINT "page_optimizations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_optimizations_project_id_idx" ON "page_optimizations" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "page_optimizations_unique_element_idx" ON "page_optimizations" USING btree ("project_id","url","element","target");