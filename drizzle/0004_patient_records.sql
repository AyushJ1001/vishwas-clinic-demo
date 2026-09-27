CREATE TABLE IF NOT EXISTS `patient_records` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_number` integer,
	`name` text NOT NULL,
	`name_normalized` text NOT NULL,
	`date_of_birth` text DEFAULT '' NOT NULL,
	`date_of_birth_estimated` integer DEFAULT 0 NOT NULL,
	`sex` text DEFAULT 'Other' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`source_draft_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_patient_records_number` ON `patient_records` (`patient_number`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_patient_records_name` ON `patient_records` (`name_normalized`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_patient_records_source_draft` ON `patient_records` (`source_draft_id`);