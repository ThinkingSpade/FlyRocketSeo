CREATE TABLE `project_subdomains` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`host` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`organic_keywords` integer,
	`organic_traffic` integer,
	`clicks` integer,
	`impressions` integer,
	`last_seen_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_subdomains_project_host_idx` ON `project_subdomains` (`project_id`,`host`);