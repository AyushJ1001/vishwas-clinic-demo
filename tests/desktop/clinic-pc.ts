import { _electron as electron, type ElectronApplication } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDirectory = fileURLToPath(new URL("../../desktop", import.meta.url));
const electronBinary = path.join(
  desktopDirectory,
  "node_modules/electron/dist",
  process.platform === "win32" ? "electron.exe" : "electron",
);

// Set CLINIC_PC_EXECUTABLE to an installed "Vishwas Clinic.exe" to run these
// tests against what the installer put on the PC instead of the dev build.
const installedApp = process.env.CLINIC_PC_EXECUTABLE;

export function launchClinicPc(
  dataDirectory: string,
  env: Record<string, string> = {},
) {
  return electron.launch({
    executablePath: installedApp ?? electronBinary,
    args: installedApp ? [] : [desktopDirectory],
    env: { ...process.env, CLINIC_DATA_DIR: dataDirectory, ...env },
  });
}

export async function openPage(app: ElectronApplication, pathname: string) {
  const window = await app.firstWindow();
  await window.goto(`clinic://app${pathname}`);
  return window;
}
