import { app } from "electron";
import { writeFileSync } from "node:fs";
import path from "node:path";

import type { ClinicUpdateState } from "../../app/clinic-pc";
import type { Backups } from "./backups";

type UpdateInfo = { version: string };

type UpdateCheckResult = {
  updateInfo: UpdateInfo;
  downloadPromise?: Promise<unknown> | null;
};

type UpdateClient = {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  autoRunAppAfterInstall: boolean;
  disableDifferentialDownload: boolean;
  forceDevUpdateConfig: boolean;
  logger: null;
  updateConfigPath: string;
  _testOnlyOptions?: { platform: "win32" };
  setFeedURL(url: string): void;
  checkForUpdates(): Promise<UpdateCheckResult | null>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(event: "checking-for-update", listener: () => void): void;
  on(
    event: "update-available" | "update-not-available" | "update-downloaded",
    listener: (info: UpdateInfo) => void,
  ): void;
  on(event: "download-progress", listener: () => void): void;
  on(event: "error", listener: () => void): void;
};

type UpdaterPackage = {
  autoUpdater: UpdateClient;
  NsisUpdater: new () => UpdateClient;
};

const firstCheckDelayMs = 3 * 60 * 1000;
const checkIntervalMs = 6 * 60 * 60 * 1000;

function updaterPackage(): UpdaterPackage {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("electron-updater") as UpdaterPackage;
}

function testUpdateConfig(dataDirectory: string, feedUrl: string) {
  const file = path.join(dataDirectory, "test-app-update.yml");
  writeFileSync(
    file,
    [
      "provider: generic",
      `url: ${JSON.stringify(feedUrl)}`,
      "updaterCacheDirName: vishwas-clinic-updater-test",
      "",
    ].join("\n"),
  );
  return file;
}

/** Keeps update traffic and installation outside the consultation workflow. */
export class Updates {
  private current: ClinicUpdateState;
  private updater: UpdateClient | null = null;
  private checkInProgress: Promise<ClinicUpdateState> | null = null;
  private installBackup: Promise<boolean> | null = null;
  private lastCheckAttemptAt = 0;

  constructor(
    private readonly backups: Backups,
    dataDirectory: string,
  ) {
    this.current = { appVersion: app.getVersion(), state: "idle" };
    const testFeed = process.env.CLINIC_UPDATE_FEED;
    if (!app.isPackaged && !testFeed) return;

    try {
      const available = updaterPackage();
      const updater = testFeed
        ? new available.NsisUpdater()
        : available.autoUpdater;
      updater.autoDownload = true;
      updater.autoInstallOnAppQuit = true;
      updater.autoRunAppAfterInstall = false;
      updater.logger = null;

      if (testFeed) {
        // The desktop tests run outside NSIS, but still use the real Windows
        // downloader and generic feed path.
        updater.forceDevUpdateConfig = true;
        updater.disableDifferentialDownload = true;
        updater._testOnlyOptions = { platform: "win32" };
        updater.updateConfigPath = testUpdateConfig(dataDirectory, testFeed);
        updater.setFeedURL(testFeed);
      }

      this.updater = updater;
      this.connectEvents(updater);
    } catch {
      this.current = { ...this.current, state: "offline" };
    }
  }

  state(): ClinicUpdateState {
    return { ...this.current };
  }

  start(): void {
    if (!this.updater) return;
    const first = setTimeout(() => {
      this.runAutomaticCheck();
    }, firstCheckDelayMs);
    first.unref();
  }

  check(): Promise<ClinicUpdateState> {
    if (!this.updater) return Promise.resolve(this.state());
    if (this.checkInProgress) return this.checkInProgress;

    this.lastCheckAttemptAt = Date.now();
    this.current = { ...this.current, state: "checking" };
    const updater = this.updater;
    let requested: Promise<UpdateCheckResult | null>;
    try {
      requested = updater.checkForUpdates();
    } catch {
      this.markOffline();
      return Promise.resolve(this.state());
    }
    this.checkInProgress = requested
      .then((result) => {
        if (result?.downloadPromise) {
          void result.downloadPromise.catch(() => this.markOffline());
        }
        return this.state();
      })
      .catch(() => {
        this.markOffline();
        return this.state();
      })
      .finally(() => {
        this.checkInProgress = null;
      });
    return this.checkInProgress;
  }

  /**
   * electron-updater installs from Electron's `quit` handler, which cannot
   * wait for anything, so the backup has to be finished before the app is let
   * go. An update that cannot be backed up is not installed at all.
   */
  async prepareForAppQuit(): Promise<void> {
    if (!this.updater || this.current.state !== "ready") return;
    if (!(await this.backUpBeforeInstall())) {
      this.updater.autoInstallOnAppQuit = false;
    }
  }

  async quitAndInstall(): Promise<void> {
    if (!this.updater || this.current.state !== "ready") return;
    if (!(await this.backUpBeforeInstall())) {
      this.updater.autoInstallOnAppQuit = false;
      return;
    }
    this.updater.quitAndInstall(true, false);
  }

  // Electron tests cannot run NSIS, so they call the same backup gate without
  // starting the installer.
  testBackUpBeforeInstall(): Promise<boolean> {
    return this.backUpBeforeInstall();
  }

  private connectEvents(updater: UpdateClient) {
    updater.on("checking-for-update", () => {
      this.current = { ...this.current, state: "checking" };
    });
    updater.on("update-available", (info) => {
      this.current = {
        ...this.current,
        state: "downloading",
        readyVersion: info.version,
        lastCheckedAt: new Date().toISOString(),
      };
    });
    updater.on("download-progress", () => {
      this.current = { ...this.current, state: "downloading" };
    });
    updater.on("update-downloaded", (info) => {
      this.current = {
        ...this.current,
        state: "ready",
        readyVersion: info.version,
      };
      this.installBackup = null;
    });
    updater.on("update-not-available", () => {
      this.current = {
        appVersion: this.current.appVersion,
        state: "idle",
        lastCheckedAt: new Date().toISOString(),
      };
    });
    updater.on("error", () => this.markOffline());
  }

  private markOffline() {
    this.current = {
      appVersion: this.current.appVersion,
      state: "offline",
      ...(this.current.lastCheckedAt
        ? { lastCheckedAt: this.current.lastCheckedAt }
        : {}),
    };
  }

  private runAutomaticCheck() {
    if (!this.updater) return;
    const elapsed = Date.now() - this.lastCheckAttemptAt;
    if (this.lastCheckAttemptAt && elapsed < checkIntervalMs) {
      this.scheduleAutomaticCheck(checkIntervalMs - elapsed);
      return;
    }
    void this.check().finally(() =>
      this.scheduleAutomaticCheck(checkIntervalMs),
    );
  }

  private scheduleAutomaticCheck(delay: number) {
    const next = setTimeout(() => {
      this.runAutomaticCheck();
    }, delay);
    next.unref();
  }

  private backUpBeforeInstall(): Promise<boolean> {
    if (this.installBackup) return this.installBackup;
    this.installBackup = this.backups
      .backUpLocally("before-update")
      .then(() => true)
      .catch(() => false);
    return this.installBackup;
  }
}
