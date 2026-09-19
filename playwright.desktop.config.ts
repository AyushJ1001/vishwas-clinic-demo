import { defineConfig } from "@playwright/test";

// Drives the built Electron app (`npm run desktop:build` first).
export default defineConfig({
  testDir: "./tests/desktop",
  forbidOnly: Boolean(process.env.CI),
  reporter: "line",
  workers: 1,
  timeout: 60_000,
});
