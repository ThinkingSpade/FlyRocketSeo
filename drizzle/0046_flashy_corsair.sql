ALTER TABLE `opportunity_events` ADD `result_json` text;--> statement-breakpoint
ALTER TABLE `opportunity_events` ADD `revision` integer DEFAULT 0 NOT NULL;