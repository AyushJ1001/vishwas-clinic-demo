import Database from "better-sqlite3";
import { renameSync, rmSync } from "node:fs";
import type {
  LocalQuery,
  LocalQueryMode,
  LocalQueryResult,
} from "../shared/local-database-protocol";

type SqliteValue = string | number | bigint | Buffer | null;

function toSqliteValue(value: unknown): SqliteValue {
  if (value === undefined) {
    throw new TypeError("D1 does not accept undefined bind parameters.");
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return value as SqliteValue;
}

/**
 * The Clinic PC's master copy of Clinic records: one SQLite file on disk,
 * answered in the same result shapes Cloudflare D1 uses so the shared
 * `db/*` modules run unchanged on both sides.
 */
export class LocalDatabase {
  private db: Database.Database;

  constructor(readonly filePath: string) {
    this.db = LocalDatabase.open(filePath);
  }

  private static open(filePath: string) {
    const db = new Database(filePath);
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = FULL");
    db.pragma("foreign_keys = ON");
    return db;
  }

  /** Writes a consistent copy of the live database to `destination`. */
  async backupTo(destination: string) {
    await this.db.backup(destination);
  }

  /**
   * Swaps the live database for `replacement`, a checked SQLite file.
   * The replacement file is moved, not copied.
   */
  replaceWith(replacement: string) {
    this.db.close();
    for (const suffix of ["-wal", "-shm"]) {
      rmSync(this.filePath + suffix, { force: true });
    }
    renameSync(replacement, this.filePath);
    this.db = LocalDatabase.open(this.filePath);
  }

  query({ sql, params, mode }: LocalQuery): LocalQueryResult {
    const statement = this.db.prepare(sql);
    const values = params.map(toSqliteValue);
    return statement.reader
      ? this.read(statement, values, mode)
      : this.write(statement, values);
  }

  batch(queries: LocalQuery[]): LocalQueryResult[] {
    return this.db.transaction(() =>
      queries.map((query) => this.query(query)),
    )();
  }

  close() {
    this.db.close();
  }

  private read(
    statement: Database.Statement,
    values: SqliteValue[],
    mode: LocalQueryMode,
  ): LocalQueryResult {
    if (mode === "raw") {
      return {
        columns: statement.columns().map((column) => column.name),
        rows: statement.raw(true).all(...values) as unknown[][],
        changes: 0,
        lastRowId: 0,
      };
    }
    return {
      rows: statement.all(...values) as Record<string, unknown>[],
      changes: 0,
      lastRowId: 0,
    };
  }

  private write(
    statement: Database.Statement,
    values: SqliteValue[],
  ): LocalQueryResult {
    const info = statement.run(...values);
    return {
      rows: [],
      changes: info.changes,
      lastRowId: Number(info.lastInsertRowid),
    };
  }
}
