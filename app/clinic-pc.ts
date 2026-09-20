// What the Clinic PC desktop app adds to the shared UI. None of this exists on
// the web: `getClinicPc()` returns null there.

import type {
  ClinicPrinter,
  PrintPaper,
  PrintResult,
  PrintSettings,
} from "../desktop/shared/local-database-protocol";

export type { ClinicPrinter, PrintPaper, PrintResult, PrintSettings };

export type LocalBackup = {
  id: string;
  createdAt: string;
  reason: "daily" | "on-close" | "manual" | "before-restore";
  bytes: number;
};

export type UsbDrive = {
  id: string;
  label: string;
  backups: UsbBackup[];
};

export type UsbBackup = {
  id: string;
  createdAt: string;
  bytes: number;
};

export type BackupOverview = {
  hasPassphrase: boolean;
  localBackups: LocalBackup[];
};

export type RestoreResult =
  | { status: "restored" }
  | { status: "passphrase-required" }
  | { status: "wrong-passphrase" }
  | { status: "failed"; message: string };

export type ClinicPcBackups = {
  overview(): Promise<BackupOverview>;
  backUpNow(): Promise<LocalBackup>;
  setPassphrase(passphrase: string): Promise<void>;
  listUsbDrives(): Promise<UsbDrive[]>;
  backUpToUsb(driveId: string): Promise<UsbBackup>;
  restoreLocal(backupId: string): Promise<RestoreResult>;
  restoreUsb(
    driveId: string,
    backupId: string,
    passphrase?: string,
  ): Promise<RestoreResult>;
};

export type ClinicPcPrinting = {
  listPrinters(): Promise<ClinicPrinter[]>;
  settings(): Promise<PrintSettings>;
  saveSettings(settings: PrintSettings): Promise<void>;
  print(): Promise<PrintResult>;
  printWithOptions(): Promise<PrintResult>;
};

export type ClinicPc = {
  backups: ClinicPcBackups;
  printing: ClinicPcPrinting;
};

export const minimumPassphraseLength = 8;

export function getClinicPc(): ClinicPc | null {
  if (typeof window === "undefined") return null;
  return (window as { clinicPc?: ClinicPc }).clinicPc ?? null;
}
