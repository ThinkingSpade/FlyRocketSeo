CREATE TABLE "project_events" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"event_date" text NOT NULL,
	"title" text NOT NULL,
	"note" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_events" ADD CONSTRAINT "project_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_events_project_date_idx" ON "project_events" USING btree ("project_id","event_date");