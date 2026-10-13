ALTER TABLE `opportunities` ADD `priority_band` text DEFAULT 'low' NOT NULL;--> statement-breakpoint
ALTER TABLE `opportunities` ADD `last_evaluated_at` text DEFAULT '' NOT NULL;