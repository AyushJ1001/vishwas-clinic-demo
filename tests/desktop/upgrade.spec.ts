import { expect, test } from "@playwright/test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { launchClinicPc, openPage } from "./clinic-pc";

// A clinic.sqlite written by the 0.1.0 build (e8104f0) on a real Windows PC,
// before Clinic records had sync ids. The doctor's PC will be upgraded from
// a database like this one, not started fresh.
const earlierDatabase = path.join(
  import.meta.dirname,
  "fixtures/clinic-before-sync.sqlite",
);

let dataDirectory: string;

test.beforeEach(() => {
  dataDirectory = mkdtempSync(path.join(tmpdir(), "clinic-upgrade-"));
  copyFileSync(earlierDatabase, path.join(dataDirectory, "clinic.sqlite"));
});

test.afterEach(() => {
  rmSync(dataDirectory, { recursive: true, force: true });
});

test("a database from an earlier version opens without a failed query", async () => {
  const app = await launchClinicPc(dataDirectory);
  const output: string[] = [];
  app.process().stdout?.on("data", (chunk) => output.push(String(chunk)));
  app.process().stderr?.on("data", (chunk) => output.push(String(chunk)));

  // Every page asks for its records at once, which is what the upgrade has
  // to survive: several first queries arriving before any has finished.
  for (const page of ["/", "/patients", "/receipts", "/certificates", "/settings"]) {
    const window = await openPage(app, page);
    await expect(window.getByRole("main")).toBeVisible({ timeout: 15_000 });
  }
  const window = await openPage(app, "/");
  await expect(window.getByRole("status")).toContainText("Saved", {
    timeout: 15_000,
  });

  await app.close();
  expect(output.join("").match(/SqliteError[^\n]*/g) ?? []).toEqual([]);
});
