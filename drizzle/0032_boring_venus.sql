CREATE TABLE `analysis_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`feature` text NOT NULL,
	`params_json` text NOT NULL,
	`cache_key` text NOT NULL,
	`label` text NOT NULL,
	`ran_by` text,
	`run_count` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`last_ran_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `analysis_runs_project_feature_idx` ON `analysis_runs` (`project_id`,`feature`,`last_ran_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_runs_unique_inputs_idx` ON `analysis_runs` (`project_id`,`feature`,`cache_key`);