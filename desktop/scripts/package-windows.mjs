// Builds the Windows installers for the Clinic PC (ADR 0001). The PC's exact
// Windows 8.1 edition is not yet known, so both 64-bit and 32-bit installers
// are produced. Run `npm run desktop:build` from the repository root first.
import { Arch, build, Platform } from "electron-builder";
import { installSqliteBinary } from "./setup.mjs";

const architectures = ["x64", "ia32"];

try {
  for (const arch of architectures) {
    // better-sqlite3 is native: swap in its Windows build for this
    // architecture, because electron-builder cannot compile it for Windows.
    installSqliteBinary("win32", arch);
    await build({
      targets: Platform.WINDOWS.createTarget("nsis", Arch[arch]),
      publish: "never",
    });
  }
} finally {
  installSqliteBinary();
}
