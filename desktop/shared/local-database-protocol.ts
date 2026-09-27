// The message shapes the renderer and the main process exchange to reach the
// Clinic PC's local database.

export type LocalQueryMode = "all" | "raw";

export type LocalQuery = {
  sql: string;
  params: unknown[];
  mode: LocalQueryMode;
};

export type LocalQueryResult = {
  rows: Record<string, unknown>[] | unknown[][];
  columns?: string[];
  changes: number;
  lastRowId: number;
};

export type ClinicDesktopBridge = {
  query(query: LocalQuery): Promise<LocalQueryResult>;
  batch(queries: LocalQuery[]): Promise<LocalQueryResult[]>;
};

export const localDatabaseChannels = {
  query: "clinic-db:query",
  batch: "clinic-db:batch",
} as const;
