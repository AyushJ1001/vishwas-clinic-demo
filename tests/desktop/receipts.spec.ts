import { expect, test } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { launchClinicPc, openPage } from "./clinic-pc";

let dataDirectory: string;

test.beforeEach(() => {
  dataDirectory = mkdtempSync(path.join(tmpdir(), "clinic-receipts-"));
});

test.afterEach(() => {
  rmSync(dataDirectory, { recursive: true, force: true });
});

test("a fresh Clinic PC numbers, freezes, reopens, and summarizes receipts", async () => {
  const app = await launchClinicPc(dataDirectory);
  const window = await openPage(app, "/receipts");
  await expect(window.getByText("Next: 1 (provisional)")).toBeVisible();

  const issueReceipt = async (name: string, amount: string) => {
    await window.getByRole("combobox", { name: "Patient" }).fill(name);
    await window.keyboard.press("Escape");
    await window.getByLabel("Amount in rupees").fill(amount);
    await window.getByRole("button", { name: "Issue receipt" }).click();
    await expect(window.getByRole("status", { name: "Receipt issued" })).toBeVisible();
  };

  await issueReceipt("Desktop receipt Asha", "1250");
  const issued = window.getByRole("article", { name: "Issued receipt" });
  await expect(issued).toContainText(/Receipt no\.\s*1/);
  await expect(issued).toContainText("₹1,250");
  await expect(issued).toContainText(
    "Rupees One Thousand Two Hundred Fifty only",
  );

  await window.getByRole("button", { name: "New receipt" }).click();
  await expect(window.getByText("Next: 2 (provisional)")).toBeVisible();
  await issueReceipt("Desktop receipt Bhavin", "600");
  await expect(issued).toContainText(/Receipt no\.\s*2/);

  await window.getByRole("button", { name: "New receipt" }).click();
  await window.getByRole("button", { name: "Open receipt 1" }).click();
  await expect(issued).toContainText("Desktop receipt Asha");
  await expect(issued).toContainText("₹1,250");

  await openPage(app, "/summaries");
  const receiptsRow = window.getByRole("row", { name: /Receipts issued/ });
  const amountRow = window.getByRole("row", { name: /Amount received/ });
  await expect(receiptsRow).toContainText("2");
  await expect(amountRow).toContainText("₹1,850");
  await app.close();
});
