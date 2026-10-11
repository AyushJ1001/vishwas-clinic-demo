CREATE TABLE `patient_document_chunks` (
	`document_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`bytes` blob NOT NULL,
	PRIMARY KEY(`document_id`, `chunk_index`)
);
--> statement-breakpoint
CREATE TABLE `patient_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`name` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`added_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_patient_documents_patient` ON `patient_documents` (`patient_id`,`added_at`);