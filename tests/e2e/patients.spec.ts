import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const draftIdStorageKey = "vishwas-clinic-demo-draft-id";

// The patient directory is shared by every test, so each test uses names that
// no other test (or earlier run) can match.
function uniqueSuffix() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

async function openIsolatedPrescription(page: Page, testName: string) {
  const draftId = `e2e-patients-${testName}-${uniqueSuffix()}`;
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: draftIdStorageKey, value: draftId },
  );
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("Saved", {
    timeout: 15_000,
  });
}

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

async function searchDirectory(page: Page, name: string) {
  const response = await page.request.get(
    `/api/patients?q=${encodeURIComponent(name)}`,
  );
  expect(response.ok()).toBe(true);
  const data = (await response.json()) as {
    patients: { name: string; age: string; sex: string; phone: string }[];
  };
  return data.patients;
}

test("pasted rows preview, import, and update existing patients instead of duplicating", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const first = `Import Asha ${suffix}`;
  const second = `Import Bhavin ${suffix}`;
  await openPatientsPage(page);

  const rows = page.getByLabel("Or paste patient rows");
  await rows.fill(
    [
      "patient name,age,gender,phone number",
      `"${first}",41,f,98765 43210`,
      ",30,Male,",
      `${second},29,m,`,
    ].join("\n"),
  );
  await expect(page.getByText("2 patient rows ready to import.")).toBeVisible();
  await expect(page.getByText("Name is missing, so the row was skipped.")).toBeVisible();
  await page.getByRole("button", { name: "Import 2 patients" }).click();
  await expect(
    page.getByText("2 new patient records saved."),
  ).toBeVisible();

  const directorySearch = page.getByRole("searchbox", {
    name: "Search saved patient records",
  });
  await directorySearch.fill(suffix);
  const directory = page.getByRole("article", {
    name: "Saved patient records",
  });
  await expect(directory.getByText(first)).toBeVisible();
  await expect(directory.getByText("Age 41 · Female · 98765 43210")).toBeVisible();
  await expect(directory.getByText(second)).toBeVisible();

  await rows.fill(`name,age\n${first.toUpperCase()},42`);
  await page.getByRole("button", { name: "Import 1 patient" }).click();
  await expect(
    page.getByText("0 new patient records saved · 1 existing record updated."),
  ).toBeVisible();

  const saved = await searchDirectory(page, first);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    name: first,
    age: "42",
    sex: "Female",
    phone: "98765 43210",
  });
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
        name: `Too Many ${index}`,
        age: "",
        sex: "Other",
        phone: "",
      })),
    },
  });
  expect(tooMany.status()).toBe(413);

  const suffix = uniqueSuffix();
  const mixed = await request.post("/api/patients/import", {
    data: {
      patients: [
        { name: `Api Valid ${suffix}`, age: "30", sex: "Male", phone: "" },
        { name: `Api Invalid ${suffix}`, age: "thirty", sex: "Male", phone: "" },
        { name: "", age: "", sex: "Other", phone: "" },
      ],
    },
  });
  expect(mixed.ok()).toBe(true);
  const { summary } = (await mixed.json()) as {
    summary: { imported: number; updated: number; skipped: number };
  };
  expect(summary).toMatchObject({ imported: 1, updated: 0, skipped: 2 });
});

test("typing a saved patient's name offers the record and syncs age and sex", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const name = `Search Meera ${suffix}`;
  const imported = await page.request.post("/api/patients/import", {
    data: { patients: [{ name, age: "57", sex: "Male", phone: "91234 56789" }] },
  });
  expect(imported.ok()).toBe(true);

  await openIsolatedPrescription(page, "search-sync");
  const patientName = page.getByRole("combobox", { name: "Patient name" });
  await patientName.fill(`search meera ${suffix}`.slice(0, -2));
  const options = page.getByRole("listbox", {
    name: "Matching patient records",
  });
  await expect(options.getByRole("option", { name: new RegExp(name) })).toBeVisible();
  await expect(patientName).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.press("Enter");
  await expect(options).toHaveCount(0);
  await expect(patientName).toHaveValue(name);
  await expect(page.getByLabel("Age")).toHaveValue("57");
  await expect(page.getByLabel("Sex")).toHaveValue("Male");
  await expect(page.getByText("Synced from saved patient details")).toBeVisible();

  await patientName.fill(`${name} edited`);
  await expect(page.getByText("Synced from saved patient details")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(options).toHaveCount(0);
});

test("an unknown name explains that the record is created on completion", async ({
  page,
}) => {
  await openIsolatedPrescription(page, "search-unknown");
  const suffix = uniqueSuffix();
  await page
    .getByRole("combobox", { name: "Patient name" })
    .fill(`Nobody Saved ${suffix}`);
  await expect(
    page.getByRole("paragraph").filter({
      hasText: `No saved patient matches “Nobody Saved ${suffix}”. A record will be created when this prescription is completed.`,
    }),
  ).toBeVisible();
});

test("completing a prescription registers the patient in the directory", async ({
  page,
}) => {
  const name = `Completed Nisha ${uniqueSuffix()}`;
  await openIsolatedPrescription(page, "complete-registers");
  await page.getByRole("radio", { name: "New prescription" }).check();
  for (const medicine of [
    "Paracetamol 500 mg tablet",
    "Levocetirizine 5 mg tablet",
  ]) {
    await page.getByLabel(`${medicine} dose`).selectOption("1–0–1");
    await page.getByLabel(`${medicine} duration`).selectOption("5 days");
    await page.getByLabel(`${medicine} method`).selectOption("After food");
  }
  await page.getByRole("combobox", { name: "Patient name" }).fill(name);
  await page.keyboard.press("Escape");
  await page.getByLabel("Age").fill("38");
  await page.getByLabel("Sex").selectOption("Female");
  await page.getByRole("button", { name: "Review prescription" }).click();
  await page
    .getByRole("dialog", { name: "Review prescription" })
    .getByRole("button", { name: "Complete prescription" })
    .click();
  await expect(
    page.getByRole("status", { name: "Prescription completed" }),
  ).toBeVisible();

  await expect
    .poll(async () => (await searchDirectory(page, name)).length)
    .toBe(1);
  expect((await searchDirectory(page, name))[0]).toMatchObject({
    name,
    age: "38",
    sex: "Female",
  });
});

test("follow-up search links the patient's latest prior visit and never keeps another patient's visit", async ({
  page,
}) => {
  const unrelated = `Followup Unrelated ${uniqueSuffix()}`;
  const imported = await page.request.post("/api/patients/import", {
    data: {
      patients: [
        { name: "Demo Patient Rohan Shah", age: "36", sex: "Male", phone: "" },
        { name: unrelated, age: "22", sex: "Female", phone: "" },
      ],
    },
  });
  expect(imported.ok()).toBe(true);

  await openIsolatedPrescription(page, "followup-search");
  await page.getByRole("radio", { name: "Follow-up prescription" }).check();
  await page
    .getByLabel("Prior demo visit")
    .selectOption("demo-visit-kavya-mehta-2026-08-18");
  const linkedVisit = page.getByRole("region", { name: "Linked prior visit" });
  await expect(linkedVisit).toContainText("Demo Patient Kavya Mehta");
  const patientName = page.getByRole("combobox", { name: "Patient name" });
  await expect(patientName).toHaveValue("Demo Patient Kavya Mehta");

  await patientName.fill("Demo Patient Rohan");
  await patientOption(page, /Demo Patient Rohan Shah/).click();
  await expect(linkedVisit).toContainText("Demo Patient Rohan Shah");
  await expect(page.getByLabel("Prior demo visit")).not.toHaveValue("");

  await patientName.fill(unrelated);
  await patientOption(page, new RegExp(unrelated)).click();
  await expect(linkedVisit).toHaveCount(0);
  await expect(page.getByLabel("Prior demo visit")).toHaveValue("");
  await expect(
    page.getByText("Choose a prior demo visit to continue."),
  ).toBeVisible();
});

test("the patients page passes accessibility scans with a preview and directory", async ({
  page,
}) => {
  await openPatientsPage(page);
  await page.getByRole("button", { name: "Fill a sample list" }).click();
  await expect(page.getByText("5 patient rows ready to import.")).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
