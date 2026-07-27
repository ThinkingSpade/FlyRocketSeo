CREATE TABLE `geo_locations` (
	`code` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`state_code` text,
	`parent_metro_code` integer,
	`country_code` integer NOT NULL,
	`population` integer
);
--> statement-breakpoint
CREATE INDEX `geo_locations_country_name_idx` ON `geo_locations` (`country_code`,`name`);--> statement-breakpoint
CREATE INDEX `geo_locations_type_idx` ON `geo_locations` (`type`);