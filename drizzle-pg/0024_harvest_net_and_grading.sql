ALTER TABLE "harvest_runs" ADD COLUMN "skip_reason" text;--> statement-breakpoint
ALTER TABLE "harvested_domains" ADD COLUMN "domain_rating_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "harvested_domains" ADD COLUMN "domain_rating_claim_id" text;--> statement-breakpoint
ALTER TABLE "harvested_domains" ADD COLUMN "domain_rating_lease_expires_at" text;