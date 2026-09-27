type Database = Pick<D1Database, "prepare">;

const upgrades = new WeakMap<Database, Map<string, Promise<void>>>();

/**
 * Brings a table made by an earlier version up to date. The first requests
 * after an upgrade arrive together, so they share one check instead of each
 * finding the column missing and adding it again.
 */
export function addMissingColumns(
  db: Database,
  table: string,
  columns: readonly { name: string; sql: string }[],
) {
  const started = upgrades.get(db) ?? new Map<string, Promise<void>>();
  upgrades.set(db, started);
  const key = `${table}:${columns.map((column) => column.name).join(",")}`;
  let upgrade = started.get(key);
  if (!upgrade) {
    upgrade = addColumns(db, table, columns);
    started.set(key, upgrade);
    upgrade.catch(() => started.delete(key));
  }
  return upgrade;
}

async function addColumns(
  db: Database,
  table: string,
  columns: readonly { name: string; sql: string }[],
) {
  const existing = await db.prepare(`PRAGMA table_info(${table})`).all<{
    name: string;
  }>();
  const names = new Set(existing.results.map((column) => column.name));
  for (const column of columns) {
    if (names.has(column.name)) continue;
    try {
      await db.prepare(column.sql).run();
    } catch (error) {
      // Another copy of the app, or another route module, got there first.
      if (!/duplicate column name/i.test(String(error))) throw error;
    }
  }
}
