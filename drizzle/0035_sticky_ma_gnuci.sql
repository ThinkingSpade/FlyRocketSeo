CREATE TABLE `gbp_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`location_name` text NOT NULL,
	`connected_by_user_id` text NOT NULL,
	`connected_account_email` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gbp_connections_project_idx` ON `gbp_connections` (`project_id`);--> statement-breakpoint
CREATE INDEX `gbp_connections_organization_idx` ON `gbp_connections` (`organization_id`);--> statement-breakpoint
CREATE TABLE `gbp_scheduled_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`content` text NOT NULL,
	`media_url` text,
	`call_to_action_type` text,
	`call_to_action_url` text,
	`scheduled_at` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_post_id` text,
	`error_message` text,
	`created_by_user_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gbp_scheduled_posts_project_idx` ON `gbp_scheduled_posts` (`project_id`);--> statement-breakpoint
CREATE INDEX `gbp_scheduled_posts_status_scheduled_idx` ON `gbp_scheduled_posts` (`status`,`scheduled_at`);