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

export const backupChannels = {
  overview: "clinic-backups:overview",
  backUpNow: "clinic-backups:back-up-now",
  setPassphrase: "clinic-backups:set-passphrase",
  listUsbDrives: "clinic-backups:list-usb-drives",
  backUpToUsb: "clinic-backups:back-up-to-usb",
  restoreLocal: "clinic-backups:restore-local",
  restoreUsb: "clinic-backups:restore-usb",
} as const;

export type PrintPaper = "a5" | "a5-on-a4-top";

export type PrintSettings = {
  printerName: string | null;
  paper: PrintPaper;
  askEveryTime: boolean;
};

export type ClinicPrinter = {
  name: string;
  displayName: string;
  isDefault: boolean;
};

export type PrintResult =
  | { status: "printed" }
  | { status: "cancelled" }
  | { status: "no-printer" }
  | { status: "failed"; message: string };

export const printingChannels = {
  listPrinters: "clinic-print:list-printers",
  settings: "clinic-print:settings",
  saveSettings: "clinic-print:save-settings",
  print: "clinic-print:print",
  printWithOptions: "clinic-print:print-with-options",
} as const;

export const updateChannels = {
  state: "clinic-update:state",
  check: "clinic-update:check",
} as const;
