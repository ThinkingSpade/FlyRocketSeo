ALTER TABLE "opportunity_events" ADD COLUMN "result_json" text;--> statement-breakpoint
ALTER TABLE "opportunity_events" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;