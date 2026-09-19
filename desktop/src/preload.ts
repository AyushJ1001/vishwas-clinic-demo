import { contextBridge, ipcRenderer } from "electron";
import {
  localDatabaseChannels,
  type ClinicDesktopBridge,
} from "../shared/local-database-protocol";

const bridge: ClinicDesktopBridge = {
  query: (query) => ipcRenderer.invoke(localDatabaseChannels.query, query),
  batch: (queries) => ipcRenderer.invoke(localDatabaseChannels.batch, queries),
};

contextBridge.exposeInMainWorld("clinicDesktop", bridge);
