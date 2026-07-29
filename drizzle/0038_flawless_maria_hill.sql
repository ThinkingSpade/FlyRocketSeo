CREATE TABLE `keyword_fit_verdicts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`keyword` text NOT NULL,
	`verdict` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`source` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `keyword_fit_verdicts_project_keyword_idx` ON `keyword_fit_verdicts` (`project_id`,`keyword`);--> statement-breakpoint
CREATE TABLE `project_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`offer` text DEFAULT '' NOT NULL,
	`customer` text DEFAULT '' NOT NULL,
	`exclusions` text DEFAULT '' NOT NULL,
	`brand_terms` text DEFAULT '' NOT NULL,
	`service_area_kind` text DEFAULT 'national' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`drafted_at` text,
	`confirmed_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_profiles_project_idx` ON `project_profiles` (`project_id`);