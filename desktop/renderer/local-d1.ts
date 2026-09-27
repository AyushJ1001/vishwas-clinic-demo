import type {
  ClinicDesktopBridge,
  LocalQuery,
  LocalQueryResult,
} from "../shared/local-database-protocol";

declare global {
  interface Window {
    clinicDesktop?: ClinicDesktopBridge;
  }
}

function bridge() {
  if (!window.clinicDesktop) {
    throw new Error("The Clinic PC database bridge is unavailable.");
  }
  return window.clinicDesktop;
}

function toD1Result(result: LocalQueryResult) {
  return {
    success: true as const,
    results: result.rows,
    meta: {
      changes: result.changes,
      last_row_id: result.lastRowId,
      changed_db: result.changes > 0,
      rows_read: result.rows.length,
      rows_written: result.changes,
      duration: 0,
      size_after: 0,
    },
  };
}

class LocalPreparedStatement {
  constructor(
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new LocalPreparedStatement(this.sql, params);
  }

  toQuery(mode: LocalQuery["mode"] = "all"): LocalQuery {
    return { sql: this.sql, params: this.params, mode };
  }

  async all<T = Record<string, unknown>>() {
    const result = toD1Result(await bridge().query(this.toQuery()));
    return result as typeof result & { results: T[] };
  }

  async run<T = Record<string, unknown>>() {
    return this.all<T>();
  }

  async first<T = Record<string, unknown>>(column?: string) {
    const { results } = await this.all<Record<string, unknown>>();
    const row = results[0];
    if (!row) return null;
    return (column === undefined ? row : row[column]) as T | null;
  }

  async raw<T = unknown[]>(options?: { columnNames?: boolean }) {
    const result = await bridge().query(this.toQuery("raw"));
    const rows = result.rows as T[];
    return options?.columnNames
      ? ([result.columns ?? [], ...rows] as T[])
      : rows;
  }
}

/**
 * A Cloudflare D1-compatible handle over the Clinic PC's local SQLite file,
 * so the shared `db/*` modules work unchanged inside the desktop app.
 */
export function createLocalD1() {
  return {
    prepare(sql: string) {
      return new LocalPreparedStatement(sql);
    },
    async batch(statements: LocalPreparedStatement[]) {
      const results = await bridge().batch(
        statements.map((statement) => statement.toQuery()),
      );
      return results.map(toD1Result);
    },
  };
}
