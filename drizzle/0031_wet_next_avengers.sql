CREATE TABLE `brand_visibility_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`target` text NOT NULL,
	`captured_on` text NOT NULL,
	`total_mentions` integer,
	`chatgpt_mentions` integer,
	`google_mentions` integer,
	`target_share_pct` real,
	`result_json` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `brand_visibility_snapshots_project_id_idx` ON `brand_visibility_snapshots` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `brand_visibility_snapshots_unique_day_idx` ON `brand_visibility_snapshots` (`project_id`,`target`,`captured_on`);