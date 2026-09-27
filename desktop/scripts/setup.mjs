// Prepares desktop/ for development: installs the Electron 22 binary and the
// better-sqlite3 build for Electron 22 on this machine. Run after
// `npm ci --ignore-scripts` (better-sqlite3's own install script would try to
// compile against the host Node.js instead of Electron).
import { downloadArtifact } from "@electron/get";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktop = fileURLToPath(new URL("..", import.meta.url));
const electronVersion = JSON.parse(
  readFileSync(path.join(desktop, "node_modules/electron/package.json"), "utf8"),
).version;
const electronPackage = path.join(desktop, "node_modules/electron");
const executable = {
  win32: "electron.exe",
  darwin: "Electron.app/Contents/MacOS/Electron",
  linux: "electron",
}[process.platform];

// Electron's own installer hangs on recent Node.js versions while unzipping,
// so the archive is unpacked with the operating system's tools instead.
async function installElectron() {
  const dist = path.join(electronPackage, "dist");
  if (existsSync(path.join(dist, executable))) return;
  const zip = await downloadArtifact({
    version: electronVersion,
    artifactName: "electron",
    platform: process.platform,
    arch: process.arch,
  });
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  if (process.platform === "win32") {
    execFileSync("tar", ["-xf", zip, "-C", dist], { stdio: "inherit" });
  } else {
    execFileSync("unzip", ["-q", zip, "-d", dist], { stdio: "inherit" });
  }
  writeFileSync(path.join(electronPackage, "path.txt"), executable);
}

export function installSqliteBinary(platform = process.platform, arch = process.arch) {
  execFileSync(
    process.execPath,
    [
      path.join(desktop, "node_modules/prebuild-install/bin.js"),
      "--runtime", "electron",
      "--target", electronVersion,
      "--platform", platform,
      "--arch", arch,
    ],
    { cwd: path.join(desktop, "node_modules/better-sqlite3"), stdio: "inherit" },
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await installElectron();
  installSqliteBinary();
  console.log(`Electron ${electronVersion} and better-sqlite3 are ready.`);
}
