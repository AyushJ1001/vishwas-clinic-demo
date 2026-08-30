import { env } from "cloudflare:workers";

export type SavedCatalogEntry = {
  id: number;
  catalog: string;
  group_name: string;
  item_name: string;
};

async function ensureCatalogTable() {
  const db = env.DB;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS catalog_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      catalog TEXT NOT NULL,
      group_name TEXT NOT NULL,
      item_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_entries_unique ON catalog_entries (catalog, group_name, item_name)",
    ),
  ]);
}

export async function listCatalogEntries(catalog: string) {
  await ensureCatalogTable();
  const result = await env.DB.prepare(
    "SELECT id, catalog, group_name, item_name FROM catalog_entries WHERE catalog = ? ORDER BY group_name, item_name",
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
    "INSERT OR IGNORE INTO catalog_entries (catalog, group_name, item_name) VALUES (?, ?, ?)",
  )
    .bind(catalog, groupName, itemName)
    .run();
  return env.DB.prepare(
    "SELECT id, catalog, group_name, item_name FROM catalog_entries WHERE catalog = ? AND group_name = ? AND item_name = ?",
  )
    .bind(catalog, groupName, itemName)
    .first<SavedCatalogEntry>();
}
