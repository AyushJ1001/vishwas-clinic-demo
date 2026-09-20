import { expect, test } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { launchClinicPc, openPage } from "./clinic-pc";

let dataDirectory: string;

test.beforeEach(() => {
  dataDirectory = mkdtempSync(path.join(tmpdir(), "clinic-printing-"));
});

test.afterEach(() => {
  rmSync(dataDirectory, { recursive: true, force: true });
});

test("keeps the paper choice after the app is reloaded", async () => {
  const app = await launchClinicPc(dataDirectory);
  const window = await openPage(app, "/settings");

  await window.getByRole("radio", { name: "A5 on A4 (top half)" }).check();
  await expect(window.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await window.reload();
  await expect(
    window.getByRole("radio", { name: "A5 on A4 (top half)" }),
  ).toBeChecked();

  await app.close();
});

test("reports no printer and clears the selected print layout", async () => {
  const app = await launchClinicPc(dataDirectory);
  const window = await openPage(app, "/settings");
  // Most machines that run these tests do have a printer, so the clinic's
  // empty-printer case is made here rather than waited for.
  await app.evaluate(({ BrowserWindow }) => {
    for (const open of BrowserWindow.getAllWindows()) {
      open.webContents.getPrintersAsync = async () => [];
    }
  });
  await window.getByRole("radio", { name: "A5 on A4 (top half)" }).check();
  await expect(window.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

  await openPage(app, "/receipts");
  await expect(window.getByText("Next: 1 (provisional)")).toBeVisible();
  await window.getByRole("combobox", { name: "Patient" }).fill("Print Test Patient");
  await window.keyboard.press("Escape");
  await window.getByLabel("Amount in rupees").fill("500");
  await window.getByRole("button", { name: "Issue receipt" }).click();
  await expect(window.getByRole("status", { name: "Receipt issued" })).toBeVisible();

  await window.evaluate(() => {
    const observed: string[] = [];
    Object.defineProperty(window, "__observedPrintPapers", { value: observed });
    new MutationObserver(() => {
      const paper = document.documentElement.dataset.printPaper;
      if (paper) observed.push(paper);
    }).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-print-paper"],
    });
  });

  await window.getByRole("button", { name: "Print receipt" }).click();
  await expect(window.getByRole("alert")).toHaveText(
    "No printer was found. Connect or install a printer, then try again.",
  );
  expect(
    await window.evaluate(
      () =>
        (window as unknown as { __observedPrintPapers: string[] })
          .__observedPrintPapers,
    ),
  ).toContain("a5-on-a4-top");
  await expect(window.locator("html")).not.toHaveAttribute("data-print-paper", /.+/);

  await app.close();
});

test("shows Settings in the Clinic PC navigation", async () => {
  const app = await launchClinicPc(dataDirectory);
  const window = await app.firstWindow();

  await expect(
    window.getByRole("navigation", { name: "Main" }).getByRole("link", {
      name: "Settings",
    }),
  ).toBeVisible();

  await app.close();
});
