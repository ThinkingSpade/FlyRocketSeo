CREATE TABLE `project_report_settings` (
	`project_id` text PRIMARY KEY NOT NULL,
	`brand_name` text,
	`prepared_by` text,
	`logo_data_uri` text,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `report_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`token` text NOT NULL,
	`range_key` text NOT NULL,
	`title` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_shares_token_idx` ON `report_shares` (`token`);--> statement-breakpoint
CREATE INDEX `report_shares_project_created_idx` ON `report_shares` (`project_id`,`created_at`);