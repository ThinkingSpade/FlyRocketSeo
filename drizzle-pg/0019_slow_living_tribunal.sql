ALTER TABLE "opportunities" ADD COLUMN "priority_band" text DEFAULT 'low' NOT NULL;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "last_evaluated_at" text DEFAULT '' NOT NULL;