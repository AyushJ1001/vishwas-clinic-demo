CREATE TABLE `clinic_sync_records` (
	`entity_kind` text NOT NULL,
	`record_id` text NOT NULL,
	`record_json` text NOT NULL,
	`recorded_at` text NOT NULL,
	`applied_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_clinic_sync_records_identity` ON `clinic_sync_records` (`entity_kind`,`record_id`);--> statement-breakpoint
ALTER TABLE `catalog_entries` ADD `record_id` text;--> statement-breakpoint
UPDATE `catalog_entries`
SET `record_id` = lower(hex(randomblob(16)))
WHERE `record_id` IS NULL OR `record_id` = '';--> statement-breakpoint
CREATE UNIQUE INDEX `idx_catalog_entries_record_id` ON `catalog_entries` (`record_id`);
