import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { launchClinicPc, openPage } from "./clinic-pc";

let root: string;
let usbDrive: string;

test.beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "clinic-backups-"));
  usbDrive = path.join(root, "CLINIC-USB");
  mkdirSync(usbDrive);
});

test.afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function clinicPc(dataName: string) {
  return launchClinicPc(path.join(root, dataName), {
    CLINIC_REMOVABLE_DRIVES: usbDrive,
  });
}

async function importPatient(window: Page, name: string) {
  await window.goto("clinic://app/patients");
  await window
    .getByLabel("Or paste patient rows")
    .fill(["patient name,age,gender,phone number", `${name},41,f,`].join("\n"));
  await window.getByRole("button", { name: "Import 1 patient" }).click();
  await expect(window.getByText("1 new patient record saved.")).toBeVisible();
}

async function expectPatient(window: Page, name: string, present: boolean) {
  await window.goto("clinic://app/patients");
  await window.getByRole("searchbox", { name: "Search saved patient records" }).fill(name);
  const directory = window.getByRole("article", { name: "Saved patient records" });
  if (present) await expect(directory).toContainText(name);
  else await expect(directory).not.toContainText(name);
}

async function setPassphrase(window: Page, passphrase: string) {
  await window.getByLabel("New passphrase").fill(passphrase);
  await window.getByLabel("Type it again").fill(passphrase);
  await window.getByRole("button", { name: "Save passphrase" }).click();
  await expect(window.getByText("Passphrase is set on this computer.")).toBeVisible();
}

test("takes a daily backup at start and another when the app closes", async () => {
  const app = await clinicPc("pc");
  const window = await openPage(app, "/backups");
  const local = window.getByRole("list", { name: "Backups on this computer" });
  await expect(local.getByRole("listitem")).toHaveCount(1);
  await expect(local).toContainText("Daily");
  await app.close();

  const names = readdirSync(path.join(root, "pc", "backups"));
  expect(names.some((name) => name.endsWith("-daily.sqlite"))).toBe(true);
  expect(names.some((name) => name.endsWith("-on-close.sqlite"))).toBe(true);
});

test("a locked USB backup restores the records it was taken with", async () => {
  const kept = `Backup Kept ${Date.now().toString(36)}`;
  const later = `Backup Later ${Date.now().toString(36)}`;
  const app = await clinicPc("pc");
  const window = await app.firstWindow();
  window.on("dialog", (dialog) => void dialog.accept());
  await importPatient(window, kept);

  await window.goto("clinic://app/backups");
  await expect(
    window.getByRole("button", { name: "Back up to CLINIC-USB" }),
  ).toBeDisabled();
  await setPassphrase(window, "clinic paper passphrase");
  await window.getByRole("button", { name: "Back up to CLINIC-USB" }).click();
  await expect(window.getByText(/Backup saved and checked on CLINIC-USB/)).toBeVisible();

  const [archive] = readdirSync(path.join(usbDrive, "Vishwas Clinic Backups"));
  const bytes = readFileSync(path.join(usbDrive, "Vishwas Clinic Backups", archive));
  expect(bytes.includes(Buffer.from(kept))).toBe(false);
  expect(bytes.includes(Buffer.from("SQLite format 3"))).toBe(false);

  await importPatient(window, later);
  await window.goto("clinic://app/backups");
  await window
    .getByRole("list", { name: "Backups on CLINIC-USB" })
    .getByRole("button", { name: "Restore this backup" })
    .click();
  await expect(window.getByText("Backup restored.")).toBeVisible();
  await expect(
    window.getByRole("list", { name: "Backups on this computer" }),
  ).toContainText("Before a restore");

  await expectPatient(window, kept, true);
  await expectPatient(window, later, false);
  await app.close();
});

test("a new computer needs the written-down passphrase to restore", async () => {
  const name = `Backup Moved ${Date.now().toString(36)}`;
  let app = await clinicPc("old-pc");
  let window = await app.firstWindow();
  await importPatient(window, name);
  await window.goto("clinic://app/backups");
  await setPassphrase(window, "clinic paper passphrase");
  await window.getByRole("button", { name: "Back up to CLINIC-USB" }).click();
  await expect(window.getByText(/Backup saved and checked/)).toBeVisible();
  await app.close();

  app = await clinicPc("new-pc");
  window = await app.firstWindow();
  window.on("dialog", (dialog) => void dialog.accept());
  await window.goto("clinic://app/backups");
  await window
    .getByRole("list", { name: "Backups on CLINIC-USB" })
    .getByRole("button", { name: "Restore this backup" })
    .click();
  await expect(window.getByText(/Type the passphrase this backup was locked with/)).toBeVisible();
  await window.getByLabel("Passphrase for this backup").fill("not the passphrase");
  await window.getByRole("button", { name: "Unlock and restore" }).click();
  await expect(window.getByText("That passphrase does not unlock this backup.")).toBeVisible();
  await window.getByLabel("Passphrase for this backup").fill("clinic paper passphrase");
  await window.getByRole("button", { name: "Unlock and restore" }).click();
  await expect(window.getByText("Backup restored.")).toBeVisible();
  await expectPatient(window, name, true);
  await app.close();
});
