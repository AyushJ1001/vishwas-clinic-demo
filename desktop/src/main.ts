import { app, BrowserWindow, ipcMain, protocol, session } from "electron";
import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  backupChannels,
  localDatabaseChannels,
  type LocalQuery,
} from "../shared/local-database-protocol";
import { Backups } from "./backups";
import { LocalDatabase } from "./local-database";

// The app is served from its own scheme so it never depends on a network,
// and so pages get a stable origin for storage and `fetch("/api/...")`.
const appScheme = "clinic";
const appOrigin = `${appScheme}://app`;
const rendererRoot = path.join(__dirname, "renderer");
const dailyBackupCheckMs = 60 * 60 * 1000;

app.setName("Vishwas Clinic");

protocol.registerSchemesAsPrivileged([
  {
    scheme: appScheme,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function dataDirectory() {
  const directory =
    process.env.CLINIC_DATA_DIR ?? path.join(app.getPath("userData"), "data");
  mkdirSync(directory, { recursive: true });
  return directory;
}

function resolveRendererFile(url: string) {
  const { pathname } = new URL(url);
  const requested = path.normalize(
    path.join(rendererRoot, decodeURIComponent(pathname)),
  );
  const insideRoot =
    requested === rendererRoot ||
    requested.startsWith(rendererRoot + path.sep);
  if (insideRoot && existsSync(requested) && statSync(requested).isFile()) {
    return requested;
  }
  // Every page route renders the same app shell, which picks the page
  // from the path.
  return path.join(rendererRoot, "index.html");
}

function serveRenderer() {
  protocol.registerFileProtocol(appScheme, (request, respond) => {
    respond({ path: resolveRendererFile(request.url) });
  });
}

// ADR 0001: Chromium 108 receives no security fixes, so the window may only
// ever show the app's own bundled code.
function blockRemoteContent() {
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
    (_details, respond) => respond({ cancel: true }),
  );
  app.on("web-contents-created", (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (event, url) => {
      if (!url.startsWith(`${appOrigin}/`)) event.preventDefault();
    });
    contents.on("will-attach-webview", (event) => event.preventDefault());
  });
}

function connectLocalDatabase(database: LocalDatabase) {
  ipcMain.handle(localDatabaseChannels.query, (_event, query: LocalQuery) =>
    database.query(query),
  );
  ipcMain.handle(
    localDatabaseChannels.batch,
    (_event, queries: LocalQuery[]) => database.batch(queries),
  );
}

function connectBackups(backups: Backups) {
  ipcMain.handle(backupChannels.overview, () => backups.overview());
  ipcMain.handle(backupChannels.backUpNow, () => backups.backUpLocally("manual"));
  ipcMain.handle(backupChannels.setPassphrase, (_event, passphrase: string) =>
    backups.setPassphrase(passphrase),
  );
  ipcMain.handle(backupChannels.listUsbDrives, () => backups.listUsbDrives());
  ipcMain.handle(backupChannels.backUpToUsb, (_event, driveId: string) =>
    backups.backUpToUsb(driveId),
  );
  ipcMain.handle(backupChannels.restoreLocal, (_event, backupId: string) =>
    backups.restoreLocal(backupId),
  );
  ipcMain.handle(
    backupChannels.restoreUsb,
    (_event, driveId: string, backupId: string, passphrase?: string) =>
      backups.restoreUsb(driveId, backupId, passphrase),
  );
}

function keepDailyBackups(backups: Backups) {
  const backUpIfDue = () =>
    backups.backUpDailyIfDue().catch((error: unknown) =>
      console.error("Daily backup failed", error),
    );
  void backUpIfDue();
  // The app may stay open across midnight.
  setInterval(backUpIfDue, dailyBackupCheckMs);
}

// Takes the on-close backup before the app exits.
function backUpOnClose(backups: Backups) {
  let backedUp = false;
  app.on("before-quit", (event) => {
    if (backedUp) return;
    event.preventDefault();
    backedUp = true;
    backups
      .backUpLocally("on-close")
      .catch((error: unknown) => console.error("On-close backup failed", error))
      .finally(() => app.quit());
  });
}

function openMainWindow() {
  const window = new BrowserWindow({
    width: 1366,
    height: 768,
    show: false,
    title: "Vishwas Clinic",
    backgroundColor: "#f4f1e9",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  window.once("ready-to-show", () => {
    window.maximize();
    window.show();
  });
  void window.loadURL(`${appOrigin}/`);
  return window;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  const database = new LocalDatabase(
    path.join(dataDirectory(), "clinic.sqlite"),
  );
  const backups = new Backups(database, dataDirectory());
  let mainWindow: BrowserWindow | null = null;

  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  void app.whenReady().then(() => {
    serveRenderer();
    blockRemoteContent();
    connectLocalDatabase(database);
    connectBackups(backups);
    keepDailyBackups(backups);
    backUpOnClose(backups);
    mainWindow = openMainWindow();
    mainWindow.on("closed", () => {
      mainWindow = null;
    });
  });

  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => database.close());
}
