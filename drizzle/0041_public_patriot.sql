CREATE TABLE `harvested_domains` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`domain` text NOT NULL,
	`matched_term` text NOT NULL,
	`dropped_on` text NOT NULL,
	`domain_rating` integer,
	`is_available` integer,
	`availability_checked_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `harvested_domains_project_id_idx` ON `harvested_domains` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `harvested_domains_project_domain_idx` ON `harvested_domains` (`project_id`,`domain`);