CREATE TABLE `catalog_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`catalog` text NOT NULL,
	`group_name` text NOT NULL,
	`item_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_catalog_entries_unique` ON `catalog_entries` (`catalog`,`group_name`,`item_name`);
