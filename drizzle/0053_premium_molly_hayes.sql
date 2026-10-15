CREATE TABLE `harvested_domain_links` (
	`harvested_domain_id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`backlinks` integer,
	`referring_domains` integer,
	`spam_score` integer,
	`checked_at` text NOT NULL,
	FOREIGN KEY (`harvested_domain_id`) REFERENCES `harvested_domains`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `harvested_domain_links_project_id_idx` ON `harvested_domain_links` (`project_id`);