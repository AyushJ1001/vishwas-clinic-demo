import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  openDraft,
  sampleConsultation,
  todayInIndia,
  uniqueSuffix,
} from "./fixtures";
import {
  emptyConsultationPatient,
  type Consultation,
  type PatientRecord,
} from "../../app/consultation-model";

test.describe.configure({ mode: "serial" });

async function openPatientsPage(page: Page) {
  await page.goto("/patients");
  // The directory only loads after hydration, so this also guarantees the
  // import controls are interactive before the test types or clicks.
  const directory = page.getByRole("article", {
    name: "Saved patient records",
  });
  await expect(directory.getByRole("searchbox")).toBeVisible();
  await expect(directory).not.toContainText("Loading patient records…", {
    timeout: 15_000,
  });
}

function patientOption(page: Page, name: string | RegExp) {
  return page
    .getByRole("listbox", { name: "Matching patient records" })
    .getByRole("option", { name });
}

async function findPatients(page: Page, query: string) {
  const response = await page.request.get(
    `/api/patients?q=${encodeURIComponent(query)}&limit=25`,
  );
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { patients: PatientRecord[] }).patients;
}

async function importPatients(page: Page, patients: object[]) {
  const response = await page.request.post("/api/patients/import", {
    data: {
      patients: patients.map((patient) => ({
        number: "",
        age: "",
        dateOfBirth: "",
        sex: "",
        phone: "",
        ...patient,
      })),
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

function readyConsultation(patient: Partial<Consultation["patient"]>): Consultation {
  return {
    ...sampleConsultation(),
    visitType: "new",
    consultationDate: todayInIndia(),
    patient: { ...emptyConsultationPatient(), sex: "Female", age: "38", ...patient },
    medicines: [
      {
        name: "Paracetamol 500 mg tablet",
        dose: "1–0–1",
        duration: "5 days",
        method: "After food",
      },
    ],
  };
}

async function completeOpenPrescription(page: Page) {
  await page.getByRole("button", { name: "Review prescription" }).click();
  await page
    .getByRole("dialog", { name: "Review prescription" })
    .getByRole("button", { name: "Complete prescription" })
    .click();
  await expect(
    page.getByRole("status", { name: "Prescription completed" }),
  ).toBeVisible();
}

test("imports keep old patient numbers, number everyone else, and never merge by name", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const numbered = `Import Asha ${suffix}`;
  const unnumbered = `Import Bhavin ${suffix}`;
  // Far above anything another test registers, and different every run.
  const oldNumber = 800_000_000 + Math.floor(Math.random() * 99_000_000);
  await openPatientsPage(page);

  const rows = page.getByLabel("Or paste patient rows");
  await rows.fill(
    [
      "patient no.,patient name,dob,gender,phone number",
      `${oldNumber},"${numbered}",14/03/1984,f,98765 43210`,
      ",,,Male,",
      `,${unnumbered},,m,`,
    ].join("\n"),
  );
  await expect(page.getByText("2 patient rows ready to import.")).toBeVisible();
  await expect(page.getByText("Name is missing, so the row was skipped.")).toBeVisible();
  await page.getByRole("button", { name: "Import 2 patients" }).click();
  await expect(page.getByText("2 new patient records saved.")).toBeVisible();

  const [asha] = await findPatients(page, numbered);
  expect(asha).toMatchObject({
    number: oldNumber,
    dateOfBirth: "1984-03-14",
    dateOfBirthEstimated: false,
    sex: "Female",
    phone: "98765 43210",
  });
  const [bhavin] = await findPatients(page, unnumbered);
  expect(bhavin.number).toBeGreaterThan(0);
  expect(bhavin.number).not.toBe(oldNumber);

  const directory = page.getByRole("article", { name: "Saved patient records" });
  await page
    .getByRole("searchbox", { name: "Search saved patient records" })
    .fill(suffix);
  await expect(directory.getByText(numbered)).toBeVisible();
  await expect(
    directory.getByRole("row", { name: new RegExp(numbered) }),
  ).toContainText(String(oldNumber));

  // The same number is the same patient: the row updates that record.
  await rows.fill(`number,name,phone\n${oldNumber},${numbered},99999 11111`);
  await page.getByRole("button", { name: "Import 1 patient" }).click();
  await expect(
    page.getByText("0 new patient records saved · 1 existing record updated by number."),
  ).toBeVisible();
  expect(await findPatients(page, numbered)).toEqual([
    expect.objectContaining({ number: oldNumber, phone: "99999 11111" }),
  ]);

  // The same name without a number is someone else unless every detail matches.
  await rows.fill(`name,sex\n${unnumbered},m\n${unnumbered},f`);
  await page.getByRole("button", { name: "Import 2 patients" }).click();
  await expect(
    page.getByText("1 new patient record saved. 1 row was already saved or invalid."),
  ).toBeVisible();
  const bhavins = await findPatients(page, unnumbered);
  expect(bhavins.map((patient) => patient.sex).sort()).toEqual(["Female", "Male"]);
  expect(new Set(bhavins.map((patient) => patient.number)).size).toBe(2);
});

test("the import API rejects empty, invalid, and oversized requests", async ({
  request,
}) => {
  const empty = await request.post("/api/patients/import", {
    data: { patients: [] },
  });
  expect(empty.status()).toBe(400);

  const tooMany = await request.post("/api/patients/import", {
    data: {
      patients: Array.from({ length: 501 }, (_, index) => ({
        number: "",
        name: `Too Many ${index}`,
        age: "",
        dateOfBirth: "",
        sex: "Other",
        phone: "",
      })),
    },
  });
  expect(tooMany.status()).toBe(413);

  const suffix = uniqueSuffix();
  const blank = { number: "", age: "", dateOfBirth: "", sex: "Male", phone: "" };
  const mixed = await request.post("/api/patients/import", {
    data: {
      patients: [
        { ...blank, name: `Api Valid ${suffix}`, age: "30" },
        { ...blank, name: `Api Invalid ${suffix}`, age: "thirty" },
        { ...blank, name: `Api Bad Date ${suffix}`, dateOfBirth: "31/02/1990" },
        { ...blank, name: "" },
      ],
    },
  });
  expect(mixed.ok()).toBe(true);
  const { summary } = (await mixed.json()) as {
    summary: { imported: number; updated: number; skipped: number };
  };
  expect(summary).toMatchObject({ imported: 1, updated: 0, skipped: 3 });
});

test("imports more than 500 patient rows in ordered batches", async ({ page }) => {
  test.setTimeout(180_000);
  const suffix = uniqueSuffix();
  const total = 1_201;
  const batchSizes: number[] = [];
  page.on("request", (request) => {
    if (!request.url().endsWith("/api/patients/import")) return;
    const body = request.postDataJSON() as { patients?: unknown[] };
    batchSizes.push(body.patients?.length ?? 0);
  });
  await openPatientsPage(page);

  const rows = Array.from(
    { length: total },
    (_, index) => `Large Import ${suffix} ${index + 1}\t${20 + (index % 70)}`,
  );
  await page
    .getByLabel("Or paste patient rows")
    .fill(["name\tage", ...rows].join("\n"));
  await expect(page.getByText(`${total.toLocaleString("en-IN")} patient rows ready to import.`)).toBeVisible();

  await page.getByRole("button", { name: `Import ${total.toLocaleString("en-IN")} patients` }).click();
  // The same button reports progress, so its name changes once it is pressed.
  const importButton = page.getByRole("button", {
    name: /^Saving patient records…/,
  });
  await expect(importButton).toContainText(
    new RegExp(
      `Saving patient records… (?:0|500|1,000) of ${total.toLocaleString("en-IN")}`,
    ),
  );
  await expect(
    page.getByText(`${total.toLocaleString("en-IN")} new patient records saved.`),
  ).toBeVisible({ timeout: 180_000 });
  expect(batchSizes).toEqual([500, 500, 201]);
  expect(await findPatients(page, `Large Import ${suffix} ${total}`)).toHaveLength(1);
});

test("reports a conflicting Patient number without overwriting its patient", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const patientNumber = 700_000_000 + Math.floor(Math.random() * 50_000_000);
  const existingName = `Conflict Existing ${suffix}`;
  const incomingName = `Conflict Incoming ${suffix}`;
  await importPatients(page, [
    {
      number: String(patientNumber),
      name: existingName,
      age: "52",
      sex: "Female",
      phone: "98765 11111",
    },
  ]);
  await openPatientsPage(page);

  await page
    .getByLabel("Or paste patient rows")
    .fill(
      `patient number\tpatient name\tage\tsex\tphone\n${patientNumber}\t${incomingName}\t31\tMale\t99999 22222`,
    );
  await page.getByRole("button", { name: "Import 1 patient" }).click();

  await expect(
    page.getByText("0 new patient records saved. 1 row was already saved or invalid."),
  ).toBeVisible();
  await expect(
    page.getByText(
      `Row 2: Patient number ${patientNumber} already belongs to "${existingName}", so "${incomingName}" was skipped.`,
    ),
  ).toBeVisible();
  expect(await findPatients(page, existingName)).toEqual([
    expect.objectContaining({
      number: patientNumber,
      name: existingName,
      age: "52",
      sex: "Female",
      phone: "98765 11111",
    }),
  ]);
  expect(await findPatients(page, incomingName)).toEqual([]);
});

test("imports numbered rows before earlier unnumbered rows", async ({ page }) => {
  const suffix = uniqueSuffix();
  const baselineNumber =
    970_000_000 + Math.floor(Math.random() * 10_000_000);
  const reservedNumber = baselineNumber + 1;
  const unnumberedName = `Wrong Order Unnumbered ${suffix}`;
  const numberedName = `Wrong Order Numbered ${suffix}`;
  await importPatients(page, [
    { number: String(baselineNumber), name: `Wrong Order Baseline ${suffix}` },
  ]);
  await openPatientsPage(page);
  const sentNames: string[] = [];
  page.on("request", (request) => {
    if (!request.url().endsWith("/api/patients/import")) return;
    const body = request.postDataJSON() as {
      patients?: Array<{ name?: string }>;
    };
    sentNames.push(...(body.patients ?? []).map((patient) => patient.name ?? ""));
  });

  await page
    .getByLabel("Or paste patient rows")
    .fill(
      [
        "name\tpatient number",
        `${unnumberedName}\t`,
        `${numberedName}\t${reservedNumber}`,
      ].join("\n"),
    );
  await page.getByRole("button", { name: "Import 2 patients" }).click();
  await expect(page.getByText("2 new patient records saved.")).toBeVisible();

  expect(sentNames).toEqual([numberedName, unnumberedName]);
  expect(await findPatients(page, numberedName)).toEqual([
    expect.objectContaining({ number: reservedNumber }),
  ]);
  const [unnumbered] = await findPatients(page, unnumberedName);
  expect(unnumbered.number).toBeGreaterThan(reservedNumber);
});

test("importing the same numbered and unnumbered rows twice creates no duplicates", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const patientNumber = 750_000_000 + Math.floor(Math.random() * 40_000_000);
  const numberedName = `Repeat Numbered ${suffix}`;
  const unnumberedName = `Repeat Unnumbered ${suffix}`;
  const pastedRows = [
    "patient number\tname\tage\tsex\tphone",
    `${patientNumber}\t${numberedName}\t46\tFemale\t98765 44444`,
    `\t${unnumberedName}\t39\tMale\t98765 55555`,
  ].join("\n");
  await openPatientsPage(page);
  const rows = page.getByLabel("Or paste patient rows");
  await rows.fill(pastedRows);

  await page.getByRole("button", { name: "Import 2 patients" }).click();
  await expect(page.getByText("2 new patient records saved.")).toBeVisible();
  await page.getByRole("button", { name: "Import 2 patients" }).click();
  await expect(
    page.getByText(
      "0 new patient records saved · 1 existing record updated by number. 1 row was already saved or invalid.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Row 3: An identical patient record is already saved, so this row was skipped.",
    ),
  ).toBeVisible();

  expect(await findPatients(page, numberedName)).toHaveLength(1);
  expect(await findPatients(page, unnumberedName)).toHaveLength(1);
});

test("imports a tab-separated block pasted from Excel", async ({ page }) => {
  const suffix = uniqueSuffix();
  const name = `Excel Paste ${suffix}`;
  await openPatientsPage(page);

  await page
    .getByLabel("Or paste patient rows")
    .fill(
      [
        "Patient Name\tDOB\tM/F\tMobile No.",
        `${name}\t31-Dec-1980\tF\t+91 98765 43210`,
      ].join("\n"),
    );
  await expect(page.getByText("1 patient row ready to import.")).toBeVisible();
  await page.getByRole("button", { name: "Import 1 patient" }).click();
  await expect(page.getByText("1 new patient record saved.")).toBeVisible();

  expect(await findPatients(page, name)).toEqual([
    expect.objectContaining({
      dateOfBirth: "1980-12-31",
      dateOfBirthEstimated: false,
      sex: "Female",
      phone: "+91 98765 43210",
    }),
  ]);
});

test("choosing a saved patient fills their number and details; a new name starts a new patient", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const name = `Search Meera ${suffix}`;
  await importPatients(page, [
    { name, dateOfBirth: "1969-01-05", sex: "Male", phone: "91234 56789" },
  ]);
  const [meera] = await findPatients(page, name);

  await openDraft(page, "search-fills", readyConsultation({ name: "" }));
  const patientName = page.getByRole("combobox", { name: "Patient name" });
  await patientName.fill(String(meera.number));
  await expect(patientOption(page, new RegExp(name))).toBeVisible();
  await expect(patientName).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.press("Enter");
  await expect(patientName).toHaveValue(name);
  await expect(page.getByText(`Patient no. ${meera.number}`, { exact: true })).toBeVisible();
  await expect(page.getByLabel("Date of birth")).toHaveValue("1969-01-05");
  await expect(page.getByLabel("Age")).toHaveValue(meera.age);
  await expect(page.getByLabel("Gender")).toHaveValue("Male");
  await expect(page.getByLabel("Phone")).toHaveValue("91234 56789");

  await patientName.fill(`${name} Junior`);
  await page.keyboard.press("Escape");
  await expect(page.getByText("New patient: numbered on completion")).toBeVisible();
});

test("completing for a new patient registers the next number, even when the name is taken", async ({
  page,
}) => {
  const name = `Completed Nisha ${uniqueSuffix()}`;
  await importPatients(page, [{ name, age: "60", sex: "Female" }]);
  const [existing] = await findPatients(page, name);

  await openDraft(
    page,
    "complete-registers",
    readyConsultation({ name, age: "38", phone: "90000 12345" }),
  );
  await completeOpenPrescription(page);

  const nishas = await findPatients(page, name);
  expect(nishas).toHaveLength(2);
  const registered = nishas.find((patient) => patient.id !== existing.id)!;
  expect(registered).toMatchObject({
    age: "38",
    dateOfBirthEstimated: true,
    phone: "90000 12345",
  });
  expect(registered.number).toBeGreaterThan(existing.number!);
  await expect(
    page.getByRole("article", { name: "Completed prescription" }),
  ).toContainText(`Patient no. ${registered.number} · Age/Gender: 38/Female`);
});

test("a follow-up continues one of the chosen patient's own earlier prescriptions", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const first = `Followup Kavya ${suffix}`;
  const other = `Followup Other ${suffix}`;
  await importPatients(page, [
    { name: first, age: "44", sex: "Female" },
    { name: other, age: "22", sex: "Female" },
  ]);
  const [kavya] = await findPatients(page, first);
  await openDraft(
    page,
    "followup-first-visit",
    readyConsultation({
      patientId: kavya.id,
      patientNumber: kavya.number,
      name: first,
      age: "44",
    }),
  );
  await completeOpenPrescription(page);

  await openDraft(page, "followup-second-visit", {
    ...readyConsultation({ name: "" }),
    visitType: "followup",
  });
  const priorVisit = page.getByRole("combobox", { name: /^Earlier prescription/ });
  await expect(priorVisit).toBeDisabled();
  await expect(page.getByText("Search for the patient by name or number")).toBeVisible();

  const patientName = page.getByRole("combobox", { name: "Patient name" });
  await patientName.fill(first);
  await patientOption(page, new RegExp(first)).click();
  await expect(priorVisit).toBeEnabled();
  await priorVisit.selectOption({ index: 1 });
  const linkedVisit = page.getByRole("region", { name: "Linked prior visit" });
  await expect(linkedVisit).toContainText(first);
  await expect(linkedVisit).toContainText("Viral upper respiratory tract infection");

  await patientName.fill(other);
  await patientOption(page, new RegExp(other)).click();
  await expect(linkedVisit).toHaveCount(0);
  await expect(priorVisit).toHaveValue("");
  await expect(priorVisit.locator("option").first()).toHaveText(
    "No earlier prescriptions for this patient",
  );
});

test("the patients page passes accessibility scans with a preview and directory", async ({
  page,
}) => {
  await openPatientsPage(page);
  await page
    .getByLabel("Or paste patient rows")
    .fill("number,name,age\n,Axe Scan One,40\n,Axe Scan Two,");
  await expect(page.getByText("2 patient rows ready to import.")).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
