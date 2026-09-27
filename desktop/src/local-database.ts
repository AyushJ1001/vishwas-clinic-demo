import Database from "better-sqlite3";
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
  private readonly db: Database.Database;

  constructor(filePath: string) {
    this.db = new Database(filePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = FULL");
    this.db.pragma("foreign_keys = ON");
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
