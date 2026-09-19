// Bundles the Electron main and preload scripts for Electron 22 (Node 16).
import { build } from "esbuild";

const shared = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node16",
  external: ["electron", "better-sqlite3"],
  logLevel: "info",
};

await Promise.all([
  build({ ...shared, entryPoints: ["src/main.ts"], outfile: "build/main.cjs" }),
  build({ ...shared, entryPoints: ["src/preload.ts"], outfile: "build/preload.cjs" }),
]);
