import { expect, test } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { launchClinicPc as launch, openPage } from "./clinic-pc";

let dataDirectory: string;

test.beforeEach(() => {
  dataDirectory = mkdtempSync(path.join(tmpdir(), "clinic-pc-"));
});

test.afterEach(() => {
  rmSync(dataDirectory, { recursive: true, force: true });
});

function launchClinicPc() {
  return launch(dataDirectory);
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

test("a fresh Clinic PC starts empty and numbers its first patient 1", async () => {
  const app = await launchClinicPc();
  const window = await app.firstWindow();
  await expect(window.getByRole("status")).toContainText("Saved", {
    timeout: 15_000,
  });
  await expect(window.getByLabel("Patient name")).toHaveValue("");
  await window.getByRole("radio", { name: "New prescription" }).check();
  await window.getByLabel("Patient name").fill("Test Patient माधुरी देशमुख");
  await window.keyboard.press("Escape");
  await window.getByLabel("Age").fill("41");
  for (const [field, item] of [
    ["Major complaints", "Dry cough"],
    ["Examination findings", "Throat congestion"],
    ["Provisional diagnosis", "Viral upper respiratory tract infection"],
    ["Medicines", "Paracetamol 500 mg tablet"],
  ]) {
    await window.getByRole("combobox", { name: field, exact: true }).click();
    await window.getByPlaceholder(`Search ${field.toLowerCase()}`).fill(item);
    await window.getByRole("option", { name: item, exact: true }).click();
    await window.keyboard.press("Escape");
  }
  await window.getByLabel("Paracetamol 500 mg tablet dose").selectOption("1–0–1");
  await window.getByLabel("Paracetamol 500 mg tablet duration").selectOption("5 days");
  await window.getByLabel("Paracetamol 500 mg tablet method").selectOption("After food");
  await window.getByRole("button", { name: "Review prescription" }).click();
  await window
    .getByRole("dialog", { name: "Review prescription" })
    .getByRole("button", { name: "Complete prescription" })
    .click();
  const completed = window.getByRole("article", { name: "Completed prescription" });
  await expect(completed).toContainText("Patient no. 1 · Age/Gender: 41/Female");
  await expect(
    window.getByRole("button", { name: "Download PDF" }),
  ).toBeEnabled({ timeout: 15_000 });

  await window.reload();
  await expect(
    window.getByRole("status", { name: "Prescription completed" }),
  ).toBeVisible({ timeout: 15_000 });
  await app.close();
});
