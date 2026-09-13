CREATE TABLE `consultation_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`consultation_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
