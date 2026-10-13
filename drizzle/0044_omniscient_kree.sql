CREATE TABLE `opportunities` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`project_id` text NOT NULL,
	`target` text NOT NULL,
	`scope_key` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`detector_id` text NOT NULL,
	`detector_version` text NOT NULL,
	`kind` text NOT NULL,
	`generated_json` text NOT NULL,
	`evidence_snapshot_id` text NOT NULL,
	`baseline_snapshot_id` text,
	`status` text DEFAULT 'not_started' NOT NULL,
	`observation_state` text DEFAULT 'observed' NOT NULL,
	`assignee_user_id` text,
	`implemented_at` text,
	`result_json` text,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`mutation_id` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evidence_snapshot_id`) REFERENCES `opportunity_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`baseline_snapshot_id`) REFERENCES `opportunity_snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `opportunities_dedupe_idx` ON `opportunities` (`organization_id`,`project_id`,`target`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `opportunities_project_target_idx` ON `opportunities` (`organization_id`,`project_id`,`target`,`status`);--> statement-breakpoint
CREATE TABLE `opportunity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`project_id` text NOT NULL,
	`opportunity_id` text NOT NULL,
	`actor_user_id` text,
	`created_at` text NOT NULL,
	`kind` text NOT NULL,
	`note` text,
	`status` text NOT NULL,
	`evidence_snapshot_id` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evidence_snapshot_id`) REFERENCES `opportunity_snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `opportunity_events_task_idx` ON `opportunity_events` (`opportunity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `opportunity_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`project_id` text NOT NULL,
	`target` text NOT NULL,
	`scope_key` text NOT NULL,
	`detector_id` text NOT NULL,
	`detector_version` text NOT NULL,
	`fetched_at` text NOT NULL,
	`observed_from` text NOT NULL,
	`observed_to` text NOT NULL,
	`availability` text NOT NULL,
	`reasons_json` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `opportunity_runs_project_idx` ON `opportunity_runs` (`organization_id`,`project_id`,`target`,`fetched_at`);--> statement-breakpoint
CREATE TABLE `opportunity_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`project_id` text NOT NULL,
	`target` text NOT NULL,
	`schema_version` integer NOT NULL,
	`content_hash` text NOT NULL,
	`payload_json` text NOT NULL,
	`r2_key` text NOT NULL,
	`fetched_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `opportunity_snapshots_hash_idx` ON `opportunity_snapshots` (`organization_id`,`project_id`,`content_hash`);--> statement-breakpoint
CREATE INDEX `opportunity_snapshots_project_idx` ON `opportunity_snapshots` (`project_id`,`fetched_at`);