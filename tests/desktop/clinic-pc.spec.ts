import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
} from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDirectory = fileURLToPath(new URL("../../desktop", import.meta.url));
const electronBinary = path.join(
  desktopDirectory,
  "node_modules/electron/dist",
  process.platform === "win32" ? "electron.exe" : "electron",
);

let dataDirectory: string;

test.beforeEach(() => {
  dataDirectory = mkdtempSync(path.join(tmpdir(), "clinic-pc-"));
});

test.afterEach(() => {
  rmSync(dataDirectory, { recursive: true, force: true });
});

function launchClinicPc() {
  return electron.launch({
    executablePath: electronBinary,
    args: [desktopDirectory],
    env: { ...process.env, CLINIC_DATA_DIR: dataDirectory },
  });
}

async function openPage(app: ElectronApplication, pathname: string) {
  const window = await app.firstWindow();
  await window.goto(`clinic://app${pathname}`);
  return window;
}

test("runs on Chromium 108 and never reaches the network", async () => {
  const app = await launchClinicPc();
  const window = await app.firstWindow();
  const networkRequests: string[] = [];
  window.on("request", (request) => {
    if (/^(https?|wss?):/.test(request.url())) networkRequests.push(request.url());
  });

  expect(await app.evaluate(() => process.versions.chrome)).toMatch(/^108\./);
  await expect(window.getByRole("status")).toContainText("Saved", {
    timeout: 15_000,
  });
  const remote = await window.evaluate(async () => {
    try {
      await fetch("https://example.com/");
      return "reached";
    } catch {
      return "blocked";
    }
  });
  expect(remote).toBe("blocked");
  expect(networkRequests.filter((url) => url !== "https://example.com/")).toEqual([]);
  await app.close();
});

test("keeps Clinic records in the local database across restarts", async () => {
  const name = `Desktop Asha ${Date.now().toString(36)}`;
  let app = await launchClinicPc();
  let window = await openPage(app, "/patients");
  await window
    .getByLabel("Or paste patient rows")
    .fill(["patient name,age,gender,phone number", `${name},41,f,98765 43210`].join("\n"));
  await window.getByRole("button", { name: "Import 1 patient" }).click();
  await expect(window.getByText("1 new patient record saved.")).toBeVisible();
  await app.close();

  app = await launchClinicPc();
  window = await openPage(app, "/patients");
  await window
    .getByRole("searchbox", { name: "Search saved patient records" })
    .fill(name);
  await expect(
    window.getByRole("article", { name: "Saved patient records" }),
  ).toContainText(name);
  await app.close();
});

test("completes a prescription and prepares its A5 PDF offline", async () => {
  const app = await launchClinicPc();
  const window = await app.firstWindow();
  await expect(window.getByRole("status")).toContainText("Saved", {
    timeout: 15_000,
  });
  await window.getByRole("radio", { name: "New prescription" }).check();
  for (const medicine of [
    "Paracetamol 500 mg tablet",
    "Levocetirizine 5 mg tablet",
  ]) {
    await window.getByLabel(`${medicine} dose`).selectOption("1–0–1");
    await window.getByLabel(`${medicine} duration`).selectOption("5 days");
    await window.getByLabel(`${medicine} method`).selectOption("After food");
  }
  await window.getByLabel("Patient name").fill("Demo Patient माधुरी देशमुख");
  await window.getByRole("button", { name: "Review prescription" }).click();
  await window
    .getByRole("dialog", { name: "Review prescription" })
    .getByRole("button", { name: "Complete prescription" })
    .click();
  await expect(
    window.getByRole("status", { name: "Prescription completed" }),
  ).toBeVisible();
  await expect(
    window.getByRole("button", { name: "Download PDF" }),
  ).toBeEnabled({ timeout: 15_000 });

  await window.reload();
  await expect(
    window.getByRole("status", { name: "Prescription completed" }),
  ).toBeVisible({ timeout: 15_000 });
  await app.close();
});
