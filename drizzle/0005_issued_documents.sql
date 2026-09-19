CREATE TABLE IF NOT EXISTS `medical_certificates` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`doctor_name` text NOT NULL,
	`issued_on` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_medical_certificates_issued_on` ON `medical_certificates` (`issued_on`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_number` integer NOT NULL,
	`patient_id` text NOT NULL,
	`doctor_name` text NOT NULL,
	`issued_on` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_receipts_number` ON `receipts` (`receipt_number`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_receipts_issued_on` ON `receipts` (`issued_on`);
