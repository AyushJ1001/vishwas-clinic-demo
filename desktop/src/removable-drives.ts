import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export type RemovableDrive = { root: string; label: string };

function listWindowsDrives(): Promise<RemovableDrive[]> {
  // DriveType 2 is a removable disk. Get-CimInstance ships with the
  // PowerShell 4 that Windows 8.1 has.
  const script =
    "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=2' | " +
    "Select-Object DeviceID,VolumeName | ConvertTo-Json -Compress";
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: 15_000 },
      (error, stdout) => {
        if (error || !stdout.trim()) return resolve([]);
        const parsed = JSON.parse(stdout) as
          | { DeviceID: string; VolumeName: string | null }
          | { DeviceID: string; VolumeName: string | null }[];
        const disks = Array.isArray(parsed) ? parsed : [parsed];
        resolve(
          disks.map((disk) => ({
            root: `${disk.DeviceID}\\`,
            label: disk.VolumeName
              ? `${disk.VolumeName} (${disk.DeviceID})`
              : `USB drive (${disk.DeviceID})`,
          })),
        );
      },
    );
  });
}

function listMountedDrives(parents: string[]): RemovableDrive[] {
  return parents.flatMap((parent) =>
    existsSync(parent)
      ? readdirSync(parent, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => ({ root: path.join(parent, entry.name), label: entry.name }))
      : [],
  );
}

/** The removable drives currently plugged into this computer. */
export async function listRemovableDrives(): Promise<RemovableDrive[]> {
  const override = process.env.CLINIC_REMOVABLE_DRIVES;
  if (override !== undefined) {
    return override
      .split(path.delimiter)
      .filter(Boolean)
      .map((root) => ({ root, label: path.basename(root) }));
  }
  if (process.platform === "win32") return listWindowsDrives();
  const user = os.userInfo().username;
  if (process.platform === "darwin") return listMountedDrives(["/Volumes"]);
  return listMountedDrives([`/run/media/${user}`, `/media/${user}`]);
}
