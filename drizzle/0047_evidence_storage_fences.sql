CREATE TABLE `opportunity_evidence_objects` (
	`key` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`project_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`state` text NOT NULL,
	`owner_token` text,
	`created_at` text NOT NULL,
	`touched_at` text NOT NULL,
	`last_actor_user_id` text
);
--> statement-breakpoint
CREATE INDEX `opportunity_evidence_objects_scope_idx` ON `opportunity_evidence_objects` (`organization_id`,`project_id`,`state`);