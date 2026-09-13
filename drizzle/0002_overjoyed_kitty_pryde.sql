ALTER TABLE `consultation_drafts` ADD `lifecycle_status` text DEFAULT 'editing' NOT NULL;--> statement-breakpoint
ALTER TABLE `consultation_drafts` ADD `completed_snapshot_json` text;