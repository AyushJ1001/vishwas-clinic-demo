// Bundles the Electron main and preload scripts for Electron 22 (Node 16).
import { build } from "esbuild";

const shared = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node16",
  external: ["electron", "better-sqlite3", "electron-updater"],
  logLevel: "info",
  // Released installers carry the device key, so a new computer syncs without
  // anyone typing it. Builds made without it ask for the key in Settings.
  define: {
    __CLINIC_BUILT_IN_DEVICE_KEY__: JSON.stringify(
      process.env.CLINIC_BUILT_IN_DEVICE_KEY ?? "",
    ),
  },
};

await Promise.all([
  build({ ...shared, entryPoints: ["src/main.ts"], outfile: "build/main.cjs" }),
  build({ ...shared, entryPoints: ["src/preload.ts"], outfile: "build/preload.cjs" }),
]);
