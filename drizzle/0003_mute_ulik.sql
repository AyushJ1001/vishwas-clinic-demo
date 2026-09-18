CREATE TABLE `patients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`name_normalized` text NOT NULL,
	`age` text DEFAULT '' NOT NULL,
	`sex` text DEFAULT 'Other' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_patients_name_normalized` ON `patients` (`name_normalized`);