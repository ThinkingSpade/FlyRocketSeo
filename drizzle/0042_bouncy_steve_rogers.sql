CREATE TABLE `harvest_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`dropped_on` text NOT NULL,
	`matched` integer DEFAULT 0 NOT NULL,
	`completed_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `harvest_runs_project_date_idx` ON `harvest_runs` (`project_id`,`dropped_on`);