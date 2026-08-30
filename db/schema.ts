import { sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const catalogEntries = sqliteTable(
  "catalog_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    catalog: text("catalog").notNull(),
    groupName: text("group_name").notNull(),
    itemName: text("item_name").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_catalog_entries_unique").on(
      table.catalog,
      table.groupName,
      table.itemName,
    ),
  ],
);
