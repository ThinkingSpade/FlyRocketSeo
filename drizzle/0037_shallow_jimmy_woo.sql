CREATE TABLE `project_target_areas` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`location_code` integer NOT NULL,
	`label` text NOT NULL,
	`parent_country_code` integer NOT NULL,
	`source` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`confirmed_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_target_areas_project_idx` ON `project_target_areas` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_target_areas_one_primary_per_project_idx` ON `project_target_areas` (`project_id`) WHERE "project_target_areas"."is_primary" = 1;