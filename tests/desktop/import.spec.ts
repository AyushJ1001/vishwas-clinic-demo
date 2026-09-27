import { expect, test } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { launchClinicPc, openPage } from "./clinic-pc";

let dataDirectory: string;

test.beforeEach(() => {
  dataDirectory = mkdtempSync(path.join(tmpdir(), "clinic-import-"));
});

test.afterEach(() => {
  rmSync(dataDirectory, { recursive: true, force: true });
});

// The first thing done on the Clinic PC is importing the old register, a few
// thousand rows copied out of Excel, so that is what this imports.
test("imports a register-sized paste from Excel into the Clinic PC", async () => {
  test.setTimeout(600_000);
  const total = 5_000;
  const rows = Array.from({ length: total }, (_, index) => {
    const number = index + 1;
    const sex = number % 2 ? "F" : "M";
    const phone = `98${String(10_000_000 + number).padStart(8, "0")}`;
    return `${number}\tRegister Patient ${number}\t${20 + (number % 60)}\t${sex}\t${phone}`;
  });
  const app = await launchClinicPc(dataDirectory);
  const window = await openPage(app, "/patients");

  // Pasted through the clipboard as the doctor will: Chromium 108 takes
  // minutes to type thousands of lines in one by one, but pastes them at once.
  await window.getByLabel("Or paste patient rows").focus();
  await app.evaluate(({ clipboard, BrowserWindow }, text) => {
    clipboard.writeText(text);
    BrowserWindow.getAllWindows()[0].webContents.paste();
  }, ["Reg. No.\tPatient Name\tAge\tM/F\tMobile No.", ...rows].join("\n"));
  await expect(
    window.getByText(`${total.toLocaleString("en-IN")} patient rows ready to import.`),
  ).toBeVisible();

  const started = Date.now();
  await window
    .getByRole("button", { name: /^Import [\d,]+ patients$/ })
    .click();
  await expect(
    window.getByText(`${total.toLocaleString("en-IN")} new patient records saved.`),
  ).toBeVisible({ timeout: 540_000 });
  test.info().annotations.push({
    type: "import time",
    description: `${total} rows in ${Math.round((Date.now() - started) / 1000)}s`,
  });
  console.log(`IMPORT ${total} rows in ${Math.round((Date.now() - started) / 1000)}s`);

  // The old numbers are kept, and the next new patient continues after them.
  const found = await window.evaluate(async () => {
    const response = await fetch("/api/patients?q=Register%20Patient%205000&limit=5");
    return (await response.json()) as { patients: Array<{ number: number }> };
  });
  expect(found.patients.map((patient) => patient.number)).toContain(5000);

  await app.close();
});
