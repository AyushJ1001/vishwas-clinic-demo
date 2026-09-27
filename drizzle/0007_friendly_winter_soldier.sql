CREATE TABLE `phone_issued_records` (
	`entity_kind` text NOT NULL,
	`record_id` text NOT NULL,
	`record_json` text NOT NULL,
	`issued_at` text NOT NULL,
	`collected_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_phone_issued_records_identity` ON `phone_issued_records` (`entity_kind`,`record_id`);--> statement-breakpoint
CREATE INDEX `idx_phone_issued_records_waiting` ON `phone_issued_records` (`collected_at`,`issued_at`);--> statement-breakpoint
ALTER TABLE `patient_records` ADD `phone_issued` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `patient_records` ADD `possible_duplicate` integer DEFAULT 0 NOT NULL;