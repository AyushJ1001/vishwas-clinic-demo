import { env } from "cloudflare:workers";

import { addMissingColumns } from "./add-column";

export type SavedCatalogEntry = {
  id: number;
  record_id: string;
  catalog: string;
  group_name: string;
  item_name: string;
};

// Catalog entries made before Sync existed have no record id yet.
export const catalogUpgradeColumns = [
  {
    name: "record_id",
    sql: "ALTER TABLE catalog_entries ADD COLUMN record_id TEXT",
  },
] as const;

async function ensureCatalogTable() {
  const db = env.DB;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS catalog_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id TEXT NOT NULL,
      catalog TEXT NOT NULL,
      group_name TEXT NOT NULL,
      item_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_entries_unique ON catalog_entries (catalog, group_name, item_name)",
    ),
  ]);
  await addMissingColumns(db, "catalog_entries", catalogUpgradeColumns);
  await db.batch([
    db.prepare(
      "UPDATE catalog_entries SET record_id = lower(hex(randomblob(16))) WHERE record_id IS NULL OR record_id = ''",
    ),
    db.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_entries_record_id ON catalog_entries (record_id)",
    ),
  ]);
}

export async function listCatalogEntries(catalog: string) {
  await ensureCatalogTable();
  const result = await env.DB.prepare(
    "SELECT id, record_id, catalog, group_name, item_name FROM catalog_entries WHERE catalog = ? ORDER BY group_name, item_name",
  )
    .bind(catalog)
    .all<SavedCatalogEntry>();
  return result.results;
}

export async function addCatalogEntry(
  catalog: string,
  groupName: string,
  itemName: string,
) {
  await ensureCatalogTable();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO catalog_entries (record_id, catalog, group_name, item_name) VALUES (?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), catalog, groupName, itemName)
    .run();
  return env.DB.prepare(
    "SELECT id, record_id, catalog, group_name, item_name FROM catalog_entries WHERE catalog = ? AND group_name = ? AND item_name = ?",
  )
    .bind(catalog, groupName, itemName)
    .first<SavedCatalogEntry>();
}
