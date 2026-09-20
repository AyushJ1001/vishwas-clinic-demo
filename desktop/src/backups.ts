import Database from "better-sqlite3";
import { safeStorage } from "electron";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type {
  BackupOverview,
  LocalBackup,
  RestoreResult,
  UsbBackup,
  UsbDrive,
} from "../../app/clinic-pc";
import { minimumPassphraseLength } from "../../app/clinic-pc";
import {
  NotABackupError,
  openBackup,
  readBackupDate,
  sealBackup,
  WrongPassphraseError,
} from "./backup-archive";
import type { LocalDatabase } from "./local-database";
import { listRemovableDrives } from "./removable-drives";

const localBackupsKept = 30;
const usbFolderName = "Vishwas Clinic Backups";
const usbExtension = ".vcbackup";
const localBackupPattern =
  /^clinic-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-(daily|on-close|manual|before-restore|before-update)\.sqlite$/;

function fileStamp(date: Date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function stampToIso(stamp: string) {
  return stamp.replace(
    /^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
    "$1:$2:$3.$4Z",
  );
}

function localDay(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * ADR 0004: Local backups every day and on close (last 30 kept), USB backups
 * whenever a doctor asks, encrypted with the Backup passphrase, and restore
 * from either after checking the backup is sound.
 */
export class Backups {
  private readonly localDirectory: string;
  private readonly passphraseFile: string;
  private readonly workDirectory: string;

  constructor(
    private readonly database: LocalDatabase,
    dataDirectory: string,
  ) {
    this.localDirectory = path.join(dataDirectory, "backups");
    this.passphraseFile = path.join(dataDirectory, "backup-passphrase.bin");
    this.workDirectory = path.join(dataDirectory, "work");
    mkdirSync(this.localDirectory, { recursive: true });
    mkdirSync(this.workDirectory, { recursive: true });
  }

  overview(): BackupOverview {
    return {
      hasPassphrase: existsSync(this.passphraseFile),
      localBackups: this.listLocal(),
    };
  }

  listLocal(): LocalBackup[] {
    return readdirSync(this.localDirectory)
      .map((name) => ({ name, match: localBackupPattern.exec(name) }))
      .filter((entry) => entry.match)
      .map(({ name, match }) => ({
        id: name,
        createdAt: stampToIso(match![1]),
        reason: match![2] as LocalBackup["reason"],
        bytes: statSync(path.join(this.localDirectory, name)).size,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async backUpLocally(reason: LocalBackup["reason"]): Promise<LocalBackup> {
    const createdAt = new Date();
    const name = `clinic-${fileStamp(createdAt)}-${reason}.sqlite`;
    const partial = path.join(this.workDirectory, `${name}.partial`);
    await this.database.backupTo(partial);
    renameSync(partial, path.join(this.localDirectory, name));
    this.pruneLocal();
    return this.listLocal().find((backup) => backup.id === name)!;
  }

  /** Takes the day's backup unless one was already taken today. */
  async backUpDailyIfDue(now = new Date()) {
    const latest = this.listLocal()[0];
    if (latest && localDay(new Date(latest.createdAt)) === localDay(now)) return;
    await this.backUpLocally("daily");
  }

  private pruneLocal() {
    for (const backup of this.listLocal().slice(localBackupsKept)) {
      rmSync(path.join(this.localDirectory, backup.id), { force: true });
    }
  }

  setPassphrase(passphrase: string) {
    if (passphrase.length < minimumPassphraseLength) {
      throw new Error(
        `The backup passphrase needs at least ${minimumPassphraseLength} characters.`,
      );
    }
    // Kept on this PC (protected by Windows for this user where available)
    // so USB backups need no typing; the paper copy is what restores them
    // on a new PC.
    const stored = safeStorage.isEncryptionAvailable()
      ? Buffer.concat([Buffer.from("E"), safeStorage.encryptString(passphrase)])
      : Buffer.concat([Buffer.from("P"), Buffer.from(passphrase)]);
    writeFileSync(this.passphraseFile, stored);
  }

  private storedPassphrase() {
    if (!existsSync(this.passphraseFile)) return null;
    const stored = readFileSync(this.passphraseFile);
    const body = stored.subarray(1);
    return stored[0] === "E".charCodeAt(0)
      ? safeStorage.decryptString(body)
      : body.toString();
  }

  async listUsbDrives(): Promise<UsbDrive[]> {
    const drives = await listRemovableDrives();
    return drives.map((drive) => ({
      id: drive.root,
      label: drive.label,
      backups: this.listUsbBackups(drive.root),
    }));
  }

  private listUsbBackups(root: string): UsbBackup[] {
    const folder = path.join(root, usbFolderName);
    if (!existsSync(folder)) return [];
    return readdirSync(folder)
      .filter((name) => name.endsWith(usbExtension))
      .flatMap((name) => {
        const file = path.join(folder, name);
        try {
          return [
            {
              id: name,
              createdAt: readBackupDate(readFileSync(file)),
              bytes: statSync(file).size,
            },
          ];
        } catch {
          return [];
        }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private async findDrive(driveId: string) {
    const drive = (await listRemovableDrives()).find((d) => d.root === driveId);
    if (!drive) throw new Error("That USB drive is no longer connected.");
    return drive;
  }

  async backUpToUsb(driveId: string): Promise<UsbBackup> {
    const passphrase = this.storedPassphrase();
    if (!passphrase) throw new Error("Set the backup passphrase first.");
    const drive = await this.findDrive(driveId);
    const createdAt = new Date();
    const snapshot = path.join(this.workDirectory, `usb-${fileStamp(createdAt)}.sqlite`);
    try {
      await this.database.backupTo(snapshot);
      const archive = sealBackup(readFileSync(snapshot), passphrase, createdAt);
      const folder = path.join(drive.root, usbFolderName);
      mkdirSync(folder, { recursive: true });
      const name = `vishwas-clinic-${fileStamp(createdAt)}${usbExtension}`;
      const partial = path.join(folder, `${name}.partial`);
      writeFileSync(partial, archive);
      // Read the copy back from the drive so a bad drive fails here, not on
      // the day the backup is needed.
      openBackup(readFileSync(partial), passphrase);
      renameSync(partial, path.join(folder, name));
      return { id: name, createdAt: createdAt.toISOString(), bytes: archive.length };
    } finally {
      rmSync(snapshot, { force: true });
    }
  }

  async restoreLocal(backupId: string): Promise<RestoreResult> {
    const backup = this.listLocal().find((b) => b.id === backupId);
    if (!backup) return { status: "failed", message: "That backup no longer exists." };
    const candidate = path.join(this.workDirectory, "restore-candidate.sqlite");
    writeFileSync(candidate, readFileSync(path.join(this.localDirectory, backup.id)));
    return this.restoreFrom(candidate);
  }

  async restoreUsb(
    driveId: string,
    backupId: string,
    typedPassphrase?: string,
  ): Promise<RestoreResult> {
    const drive = await this.findDrive(driveId);
    if (!this.listUsbBackups(drive.root).some((b) => b.id === backupId)) {
      return { status: "failed", message: "That backup is not on the USB drive." };
    }
    const passphrase = typedPassphrase ?? this.storedPassphrase();
    if (!passphrase) return { status: "passphrase-required" };
    let database: Buffer;
    try {
      database = openBackup(
        readFileSync(path.join(drive.root, usbFolderName, backupId)),
        passphrase,
      );
    } catch (error) {
      if (error instanceof WrongPassphraseError) {
        return typedPassphrase === undefined
          ? { status: "passphrase-required" }
          : { status: "wrong-passphrase" };
      }
      if (error instanceof NotABackupError) {
        return { status: "failed", message: error.message };
      }
      throw error;
    }
    const candidate = path.join(this.workDirectory, "restore-candidate.sqlite");
    writeFileSync(candidate, database);
    return this.restoreFrom(candidate);
  }

  private async restoreFrom(candidate: string): Promise<RestoreResult> {
    try {
      const check = new Database(candidate, { readonly: true, fileMustExist: true });
      const result = check.pragma("integrity_check", { simple: true });
      check.close();
      if (result !== "ok") {
        return { status: "failed", message: "The backup is damaged and was not restored." };
      }
    } catch {
      rmSync(candidate, { force: true });
      return { status: "failed", message: "The backup could not be opened." };
    }
    // A safety copy of the current records comes first, so a restore can
    // itself be undone.
    await this.backUpLocally("before-restore");
    this.database.replaceWith(candidate);
    return { status: "restored" };
  }
}
