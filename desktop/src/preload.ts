import { contextBridge, ipcRenderer } from "electron";
import type { ClinicPc } from "../../app/clinic-pc";
import {
  backupChannels,
  localDatabaseChannels,
  printingChannels,
  type ClinicDesktopBridge,
} from "../shared/local-database-protocol";

const bridge: ClinicDesktopBridge = {
  query: (query) => ipcRenderer.invoke(localDatabaseChannels.query, query),
  batch: (queries) => ipcRenderer.invoke(localDatabaseChannels.batch, queries),
};

const clinicPc: ClinicPc = {
  backups: {
    overview: () => ipcRenderer.invoke(backupChannels.overview),
    backUpNow: () => ipcRenderer.invoke(backupChannels.backUpNow),
    setPassphrase: (passphrase) =>
      ipcRenderer.invoke(backupChannels.setPassphrase, passphrase),
    listUsbDrives: () => ipcRenderer.invoke(backupChannels.listUsbDrives),
    backUpToUsb: (driveId) =>
      ipcRenderer.invoke(backupChannels.backUpToUsb, driveId),
    restoreLocal: (backupId) =>
      ipcRenderer.invoke(backupChannels.restoreLocal, backupId),
    restoreUsb: (driveId, backupId, passphrase) =>
      ipcRenderer.invoke(backupChannels.restoreUsb, driveId, backupId, passphrase),
  },
  printing: {
    listPrinters: () => ipcRenderer.invoke(printingChannels.listPrinters),
    settings: () => ipcRenderer.invoke(printingChannels.settings),
    saveSettings: (settings) =>
      ipcRenderer.invoke(printingChannels.saveSettings, settings),
    print: () => ipcRenderer.invoke(printingChannels.print),
    printWithOptions: () =>
      ipcRenderer.invoke(printingChannels.printWithOptions),
  },
};

contextBridge.exposeInMainWorld("clinicDesktop", bridge);
contextBridge.exposeInMainWorld("clinicPc", clinicPc);
