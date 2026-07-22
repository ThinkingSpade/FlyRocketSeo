CREATE TABLE `page_optimizations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`url` text NOT NULL,
	`element` text NOT NULL,
	`target` text DEFAULT '' NOT NULL,
	`current_value` text,
	`suggested_value` text NOT NULL,
	`reason` text NOT NULL,
	`source` text DEFAULT 'rules' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `page_optimizations_project_id_idx` ON `page_optimizations` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `page_optimizations_unique_element_idx` ON `page_optimizations` (`project_id`,`url`,`element`,`target`);