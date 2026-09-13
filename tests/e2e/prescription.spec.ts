import {
  expect,
  test,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";
import { createDemoConsultation } from "../../app/consultation-model";

async function openPrescription(page: Page, testName: string) {
  await setIsolatedDraft(page, testName);
  const catalogReady = page.waitForResponse(
    (response) => response.url().includes("/api/catalog?catalog=symptoms"),
  );
  await page.goto("/");
  await catalogReady;
  await expect(page.getByRole("status")).toContainText("Saved");
}

const draftIdStorageKey = "vishwas-clinic-demo-draft-id";

async function setIsolatedDraft(page: Page, testName: string) {
  const draftId = `e2e-${testName}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: draftIdStorageKey, value: draftId },
  );
}

async function chooseCatalogItem(
  page: Page,
  trigger: Locator,
  searchLabel: string,
  item: string,
) {
  await trigger.click();
  await trigger.page().getByPlaceholder(`Search ${searchLabel}`).fill(item);
  await trigger.page().getByRole("option", { name: item, exact: true }).click();
  await trigger.page().keyboard.press("Escape");
}

test("consultation values appear unchanged in the draft prescription", async ({
  page,
}) => {
  await openPrescription(page, "preview-values");

  const today = await page.evaluate(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    return new Date(now.getTime() - offset * 60_000)
      .toISOString()
      .slice(0, 10);
  });
  await expect(page.getByLabel("Consultation date")).toHaveValue(today);

  const seededMedicine = "Paracetamol 500 mg tablet";
  await expect(page.getByLabel(`${seededMedicine} dose`)).toHaveValue("");
  await expect(page.getByLabel(`${seededMedicine} duration`)).toHaveValue("");
  await expect(page.getByLabel(`${seededMedicine} method`)).toHaveValue("");
  await expect(
    page.getByRole("article", { name: "Draft prescription preview" }),
  ).toContainText("Dose not set · Method not set · Duration not set");

  await page.getByLabel("Patient name").fill("Demo Patient Rivera");
  await page.getByLabel("Age").fill("47");
  await page.getByLabel("Sex").selectOption("Other");
  await page.getByLabel("Consultation date").fill("2026-09-09");

  await chooseCatalogItem(
    page,
    page.getByRole("combobox", { name: "Major complaints", exact: true }),
    "major complaints",
    "Headache",
  );
  await chooseCatalogItem(
    page,
    page.getByRole("combobox", {
      name: "Examination findings",
      exact: true,
    }),
    "examination findings",
    "Alert and oriented",
  );
  await chooseCatalogItem(
    page,
    page.getByRole("combobox", {
      name: "Provisional diagnosis",
      exact: true,
    }),
    "provisional diagnosis",
    "Migraine",
  );
  await chooseCatalogItem(
    page,
    page.getByRole("combobox", { name: "Advice", exact: true }),
    "advice",
    "Rest as advised",
  );
  await chooseCatalogItem(
    page,
    page.getByRole("combobox", { name: "Investigations", exact: true }),
    "investigations",
    "Complete blood count",
  );

  await page.getByLabel(`${seededMedicine} dose`).selectOption("0–0–1");
  await page.getByLabel(`${seededMedicine} duration`).selectOption("7 days");
  await page.getByLabel(`${seededMedicine} method`).selectOption("With water");

  const preview = page.getByRole("article", {
    name: "Draft prescription preview",
  });
  await expect(preview).toContainText("Demo Patient Rivera");
  await expect(preview).toContainText("47/Other");
  await expect(preview).toContainText("09/09/2026");
  await expect(preview).toContainText("Headache");
  await expect(preview).toContainText("Alert and oriented");
  await expect(preview).toContainText("Migraine");
  await expect(preview).toContainText("Rest as advised");
  await expect(preview).toContainText("Complete blood count");
  await expect(preview).toContainText("0–0–1 · With water · 7 days");
  await expect(page.getByText("Draft prescription", { exact: true })).toBeVisible();
});

test("follow-up prescribing requires a linked prior demo visit", async ({
  page,
}) => {
  await setIsolatedDraft(page, "follow-up-link");
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("Saved");

  const visitType = page.getByRole("radiogroup", {
    name: "Prescription type",
  });
  await expect(visitType.getByRole("radio")).toHaveCount(2);
  await visitType.getByRole("radio", { name: "Follow-up prescription" }).check();

  await expect(page.getByLabel("Patient name")).toBeDisabled();
  await expect(
    page.getByText("Choose a prior demo visit to continue."),
  ).toBeVisible();

  await page
    .getByLabel("Prior demo visit")
    .selectOption("demo-visit-kavya-mehta-2026-08-18");

  const linkedVisit = page.getByRole("region", { name: "Linked prior visit" });
  await expect(linkedVisit).toContainText("Demo Patient Kavya Mehta");
  await expect(linkedVisit).toContainText("18 August 2026");
  await expect(linkedVisit).toContainText("Dr. Gauri Makarand Apte");
  await expect(linkedVisit).toContainText(
    "Thyroid review; fatigue improving and observations stable.",
  );
  await expect(page.getByLabel("Patient name")).toBeEnabled();
  await expect(page.getByLabel("Patient name")).toHaveValue(
    "Demo Patient Ananya Deshmukh",
  );
  await expect(
    page.getByRole("article", { name: "Draft prescription preview" }),
  ).not.toContainText("Demo Patient Kavya Mehta");
});

test("a prior visit link can be restored, replaced, removed, and cleared by New", async ({
  page,
}) => {
  await setIsolatedDraft(page, "manage-prior-link");
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("Saved");

  await page.getByRole("radio", { name: "Follow-up prescription" }).check();
  await page
    .getByLabel("Prior demo visit")
    .selectOption("demo-visit-kavya-mehta-2026-08-18");
  await expect(page.getByRole("status")).toContainText("Unsaved changes");
  await expect(page.getByRole("status")).toContainText("Saved", {
    timeout: 5_000,
  });

  await page.reload();
  await expect(
    page.getByRole("radio", { name: "Follow-up prescription" }),
  ).toBeChecked();
  const linkedVisit = page.getByRole("region", { name: "Linked prior visit" });
  await expect(linkedVisit).toContainText("Demo Patient Kavya Mehta");

  await page
    .getByLabel("Prior demo visit")
    .selectOption("demo-visit-rohan-shah-2026-07-29");
  await expect(linkedVisit).toContainText("Demo Patient Rohan Shah");
  await expect(linkedVisit).not.toContainText("Demo Patient Kavya Mehta");

  await page.getByRole("button", { name: "Remove prior visit link" }).click();
  await expect(linkedVisit).toHaveCount(0);
  await expect(page.getByLabel("Prior demo visit")).toHaveValue("");
  await expect(page.getByLabel("Patient name")).toBeDisabled();

  await page
    .getByLabel("Prior demo visit")
    .selectOption("demo-visit-kavya-mehta-2026-08-18");
  await page.getByRole("radio", { name: "New prescription" }).check();
  await expect(linkedVisit).toHaveCount(0);
  await expect(page.getByLabel("Patient name")).toBeEnabled();
  await expect(page.getByRole("status")).toContainText("Saved", {
    timeout: 5_000,
  });

  await page.reload();
  await expect(
    page.getByRole("radio", { name: "New prescription" }),
  ).toBeChecked();
  await page.getByRole("radio", { name: "Follow-up prescription" }).check();
  await expect(page.getByLabel("Prior demo visit")).toHaveValue("");
  await expect(page.getByLabel("Patient name")).toBeDisabled();
});

test("a prior visit loading failure keeps the follow-up safe and can retry", async ({
  page,
}) => {
  await setIsolatedDraft(page, "prior-visit-retry");
  let failFirstList = true;
  await page.route("**/api/prior-visits", async (route) => {
    if (failFirstList) {
      failFirstList = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary demo backend outage" }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await page.getByRole("radio", { name: "Follow-up prescription" }).check();
  await expect(page.getByRole("alert")).toContainText(
    "Completed demo visits could not be loaded.",
  );
  await expect(page.getByLabel("Patient name")).toBeDisabled();

  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByLabel("Prior demo visit")).toBeEnabled();
  await page
    .getByLabel("Prior demo visit")
    .selectOption("demo-visit-samira-iyer-2026-06-12");
  await expect(
    page.getByRole("region", { name: "Linked prior visit" }),
  ).toContainText("Demo Patient Samira Iyer");
  await expect(page.getByLabel("Patient name")).toBeEnabled();
});

test("the draft API canonicalizes known prior visits and rejects invented links", async ({
  request,
}) => {
  const draftId = `e2e-api-prior-${Date.now()}`;
  const alteredKnownVisit = {
    id: "demo-visit-kavya-mehta-2026-08-18",
    patient: { name: "Invented Person", age: "999", sex: "Other" as const },
    consultationDate: "1900-01-01",
    doctorName: "Dr. Makarand Vishwas Apte" as const,
    clinicalSummary: "Invented summary",
  };
  const consultation = {
    ...createDemoConsultation(),
    visitType: "followup" as const,
    linkedPriorVisit: alteredKnownVisit,
  };

  const saved = await request.put(`/api/consultation-drafts/${draftId}`, {
    data: { consultation, revision: 1 },
  });
  expect(saved.ok()).toBe(true);
  const savedBody = (await saved.json()) as {
    draft: { consultation: typeof consultation };
  };
  expect(savedBody.draft.consultation.linkedPriorVisit).toMatchObject({
    id: "demo-visit-kavya-mehta-2026-08-18",
    patient: { name: "Demo Patient Kavya Mehta", age: "44", sex: "Female" },
    consultationDate: "2026-08-18",
    doctorName: "Dr. Gauri Makarand Apte",
    clinicalSummary:
      "Thyroid review; fatigue improving and observations stable.",
  });

  const invented = await request.put(`/api/consultation-drafts/${draftId}`, {
    data: {
      consultation: {
        ...consultation,
        linkedPriorVisit: { ...alteredKnownVisit, id: "invented-visit" },
      },
      revision: 2,
    },
  });
  expect(invented.status()).toBe(400);
});

test("changed consultation autosaves and recovers after refresh", async ({
  page,
}) => {
  await setIsolatedDraft(page, "recovery");
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("Saved");

  await page.getByLabel("Patient name").fill("Demo Patient Isha Kulkarni");
  await expect(page.getByRole("status")).toContainText("Unsaved changes");
  await expect(page.getByRole("button", { name: "Save draft" })).toBeEnabled();
  await expect(page.getByRole("status")).toContainText("Saved", {
    timeout: 5_000,
  });

  await page.reload();
  await expect(page.getByLabel("Patient name")).toHaveValue(
    "Demo Patient Isha Kulkarni",
  );

  await page.getByLabel("Age").fill("41");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Saved");
  await page.reload();
  await expect(page.getByLabel("Age")).toHaveValue("41");
});

test("failed save preserves the consultation and retries without data loss", async ({
  page,
}) => {
  await setIsolatedDraft(page, "failed-save");
  let failNextSave = true;
  await page.route("**/api/consultation-drafts/**", async (route) => {
    if (route.request().method() === "PUT" && failNextSave) {
      failNextSave = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary demo backend outage" }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("Saved");
  await page.getByLabel("Patient name").fill("Demo Patient Neel Joshi");

  await expect(page.getByRole("alert")).toContainText(
    "Draft save failed. Your changes are still here.",
  );
  await expect(page.getByLabel("Patient name")).toHaveValue(
    "Demo Patient Neel Joshi",
  );
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(page.getByRole("status")).toContainText("Saved");

  await page.reload();
  await expect(page.getByLabel("Patient name")).toHaveValue(
    "Demo Patient Neel Joshi",
  );
});

test("an older late save cannot replace newer consultation values", async ({
  page,
}) => {
  await setIsolatedDraft(page, "stale-save");
  let releaseOlderSave = () => {};
  let reportOlderSaveStarted = () => {};
  let reportOlderSaveFinished = () => {};
  const olderSaveGate = new Promise<void>((resolve) => {
    releaseOlderSave = resolve;
  });
  const olderSaveStarted = new Promise<void>((resolve) => {
    reportOlderSaveStarted = resolve;
  });
  const olderSaveFinished = new Promise<void>((resolve) => {
    reportOlderSaveFinished = resolve;
  });

  await page.route("**/api/consultation-drafts/**", async (route) => {
    const request = route.request();
    if (request.method() !== "PUT") {
      await route.continue();
      return;
    }
    const body = request.postDataJSON() as {
      consultation: { patient: { name: string } };
    };
    if (body.consultation.patient.name !== "Demo Patient Older Value") {
      await route.continue();
      return;
    }

    reportOlderSaveStarted();
    await olderSaveGate;
    const response = await route.fetch();
    await route.fulfill({ response });
    reportOlderSaveFinished();
  });

  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("Saved");
  await page.getByLabel("Patient name").fill("Demo Patient Older Value");
  await olderSaveStarted;

  await page.getByLabel("Patient name").fill("Demo Patient Latest Value");
  await expect(page.getByRole("status")).toContainText("Saved", {
    timeout: 5_000,
  });
  releaseOlderSave();
  await olderSaveFinished;
  await expect(page.getByRole("status")).toContainText("Saved");

  await page.reload();
  await expect(page.getByLabel("Patient name")).toHaveValue(
    "Demo Patient Latest Value",
  );
});

test("leaving while changes are unsaved warns before discarding work", async ({
  page,
}) => {
  await setIsolatedDraft(page, "leave-warning");
  await page.route("**/api/consultation-drafts/**", async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({ status: 503, body: "Temporarily unavailable" });
      return;
    }
    await route.continue();
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("Saved");
  await page.getByLabel("Patient name").fill("Demo Patient Aarya Shah");
  await expect(page.getByRole("status")).toContainText("Unsaved changes");
  await expect(page.getByRole("alert")).toContainText("changes are still here");

  const warning = page.waitForEvent("dialog").then(async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    expect(dialog.message()).toContain("unsaved changes");
    await dialog.dismiss();
  });
  await page.getByRole("link", { name: "Receipts", exact: true }).first().click();
  await warning;

  await expect(page).toHaveURL("/");
  await expect(page.getByLabel("Patient name")).toHaveValue(
    "Demo Patient Aarya Shah",
  );
});

test("a failed initial draft check can recover with a valid first save", async ({
  page,
}) => {
  await setIsolatedDraft(page, "initial-load-failure");
  let failInitialLoad = true;
  await page.route("**/api/consultation-drafts/**", async (route) => {
    if (route.request().method() === "GET" && failInitialLoad) {
      failInitialLoad = false;
      await route.fulfill({ status: 503, body: "Temporarily unavailable" });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "Your changes are still here",
  );
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(page.getByRole("status")).toContainText("Saved");

  await page.reload();
  await expect(page.getByLabel("Patient name")).toHaveValue(
    "Demo Patient Ananya Deshmukh",
  );
});

test("consultation controls stay disabled until draft recovery finishes", async ({
  page,
}) => {
  await setIsolatedDraft(page, "slow-initial-load");
  let releaseInitialLoad = () => {};
  let reportInitialLoadStarted = () => {};
  const initialLoadGate = new Promise<void>((resolve) => {
    releaseInitialLoad = resolve;
  });
  const initialLoadStarted = new Promise<void>((resolve) => {
    reportInitialLoadStarted = resolve;
  });
  await page.route("**/api/consultation-drafts/**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    reportInitialLoadStarted();
    await initialLoadGate;
    await route.continue();
  });

  await page.goto("/");
  await initialLoadStarted;
  await expect(page.getByRole("status")).toContainText(
    "Checking for a saved draft",
  );
  await expect(page.getByLabel("Patient name")).toBeDisabled();

  releaseInitialLoad();
  await expect(page.getByRole("status")).toContainText("Saved");
  await expect(page.getByLabel("Patient name")).toBeEnabled();
});

test("catalog picker exposes its field, state, options, and selected values", async ({
  page,
}) => {
  await openPrescription(page, "catalog-semantics");

  const picker = page.getByRole("combobox", {
    name: "Major complaints",
    exact: true,
  });
  await expect(picker).toHaveAttribute("aria-expanded", "false");
  await expect(picker).toHaveAccessibleDescription(
    "Selected: Low-grade fever, Dry cough",
  );

  await picker.click();
  await expect(picker).toHaveAttribute("aria-expanded", "true");

  const search = page.getByRole("combobox", {
    name: "Search Major complaints",
  });
  await search.fill("Headache");

  const option = page.getByRole("option", { name: "Headache", exact: true });
  await expect(option).toHaveAttribute("aria-selected", "false");
  await option.click();
  await expect(option).toHaveAttribute("aria-selected", "true");
  await expect(picker).toHaveAccessibleDescription(
    "Selected: Low-grade fever, Dry cough, Headache",
  );
});

test("keyboard users can open, search, navigate, select, remove, and dismiss", async ({
  page,
}) => {
  await openPrescription(page, "catalog-keyboard");

  const picker = page.getByRole("combobox", {
    name: "Major complaints",
    exact: true,
  });
  await picker.focus();
  await page.keyboard.press("ArrowDown");
  await expect(picker).toHaveAttribute("aria-expanded", "true");

  const search = page.getByRole("combobox", {
    name: "Search Major complaints",
  });
  await expect(search).toBeFocused();
  await search.fill("Headache");
  await search.press("ArrowDown");

  const option = page.getByRole("option", { name: "Headache", exact: true });
  const optionId = await option.getAttribute("id");
  expect(optionId).not.toBeNull();
  await expect(search).toHaveAttribute("aria-activedescendant", optionId!);
  await expect(picker).toHaveAttribute("aria-activedescendant", optionId!);
  await search.press("Enter");
  await expect(option).toHaveAttribute("aria-selected", "true");

  await search.press("Escape");
  await expect(picker).toHaveAttribute("aria-expanded", "false");
  await expect(picker).toBeFocused();

  const remove = page.getByRole("button", {
    name: "Remove Headache from Major complaints",
  });
  await remove.focus();
  await remove.press("Enter");
  await expect(remove).toBeHidden();
  await expect(picker).toHaveAccessibleDescription(
    "Selected: Low-grade fever, Dry cough",
  );
});

test("catalog loading failure preserves consultation data and retry recovers", async ({
  page,
}) => {
  await setIsolatedDraft(page, "catalog-load-failure");
  let firstRequest: Route | undefined;
  let retryRequest: Route | undefined;
  let requestCount = 0;
  let markFirstRequestStarted: () => void = () => undefined;
  let markRetryStarted: () => void = () => undefined;
  const firstRequestStarted = new Promise<void>((resolve) => {
    markFirstRequestStarted = resolve;
  });
  const retryStarted = new Promise<void>((resolve) => {
    markRetryStarted = resolve;
  });

  await page.route("**/api/catalog?catalog=symptoms", async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      firstRequest = route;
      markFirstRequestStarted();
    } else {
      retryRequest = route;
      markRetryStarted();
    }
  });

  await page.goto("/");
  await firstRequestStarted;
  await expect(page.getByRole("status")).toContainText("Saved");
  await page.getByLabel("Patient name").fill("Demo Patient Retained");

  const picker = page.getByRole("combobox", {
    name: "Major complaints",
    exact: true,
  });
  await picker.click();
  await expect(page.getByText("Loading clinic terms for Major complaints…")).toBeVisible();

  await firstRequest!.fulfill({ status: 503, body: "Unavailable" });
  await expect(
    page.getByText(
      "Clinic terms for Major complaints could not be loaded. Standard choices are still available.",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Patient name")).toHaveValue(
    "Demo Patient Retained",
  );

  await page
    .getByRole("button", {
      name: "Retry loading clinic terms for Major complaints",
    })
    .click();
  await retryStarted;
  await expect(page.getByText("Loading clinic terms for Major complaints…")).toBeVisible();
  await retryRequest!.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      entries: [
        { group_name: "Clinic favourites", item_name: "Recurring headache" },
      ],
    }),
  });

  await page
    .getByRole("combobox", { name: "Search Major complaints" })
    .fill("Recurring headache");
  await expect(
    page.getByRole("option", { name: "Recurring headache" }),
  ).toBeVisible();
  await expect(page.getByLabel("Patient name")).toHaveValue(
    "Demo Patient Retained",
  );
});

test("empty clinic terms and an empty search have distinct guidance", async ({
  page,
}) => {
  await page.route("**/api/catalog?catalog=symptoms", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ entries: [] }),
    }),
  );
  await openPrescription(page, "catalog-empty");

  await page
    .getByRole("combobox", { name: "Major complaints", exact: true })
    .click();
  await expect(
    page.getByText(
      "No clinic terms saved for Major complaints yet. Standard choices are ready.",
    ),
  ).toBeVisible();

  await page
    .getByRole("combobox", { name: "Search Major complaints" })
    .fill("Demo unmatched complaint");
  await expect(page.getByText("No matching catalog choices.")).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Add “Demo unmatched complaint” as a clinic term",
    }),
  ).toBeVisible();
});

test("custom term save failure keeps the proposed value available for retry", async ({
  page,
}) => {
  let saveRequest: Route | undefined;
  let retryRequest: Route | undefined;
  let saveCount = 0;
  let markSaveStarted: () => void = () => undefined;
  let markRetryStarted: () => void = () => undefined;
  const saveStarted = new Promise<void>((resolve) => {
    markSaveStarted = resolve;
  });
  const retryStarted = new Promise<void>((resolve) => {
    markRetryStarted = resolve;
  });

  await page.route("**/api/catalog", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    saveCount += 1;
    if (saveCount === 1) {
      saveRequest = route;
      markSaveStarted();
    } else {
      retryRequest = route;
      markRetryStarted();
    }
  });
  await openPrescription(page, "catalog-custom-save");
  await page.getByLabel("Patient name").fill("Demo Patient Retained");

  await page
    .getByRole("combobox", { name: "Major complaints", exact: true })
    .click();
  const search = page.getByRole("combobox", {
    name: "Search Major complaints",
  });
  await search.fill("Demo seasonal fatigue");
  await page
    .getByRole("button", {
      name: "Add “Demo seasonal fatigue” as a clinic term",
    })
    .click();

  await expect(
    page.getByLabel("Category for new Major complaints term"),
  ).toBeVisible();
  await expect(page.getByLabel("New category for Major complaints")).toBeVisible();

  const saveButton = page.getByRole("button", {
    name: "Save Demo seasonal fatigue to Major complaints catalog",
  });
  await saveButton.click();
  await saveStarted;
  await expect(saveButton).toBeDisabled();
  await expect(saveButton).toHaveText("Saving clinic term…");

  await saveRequest!.fulfill({ status: 500, body: "Save failed" });
  await expect(
    page.getByText(
      'Could not save "Demo seasonal fatigue" to Major complaints. Check the connection and try again.',
    ),
  ).toBeVisible();
  await expect(search).toHaveValue("Demo seasonal fatigue");
  await expect(page.getByLabel("Patient name")).toHaveValue(
    "Demo Patient Retained",
  );

  await expect(saveButton).toHaveText("Try saving again");
  await saveButton.click();
  await retryStarted;
  await retryRequest!.fulfill({
    status: 201,
    contentType: "application/json",
    body: JSON.stringify({
      entry: {
        group_name: "General",
        item_name: "Demo seasonal fatigue",
      },
    }),
  });

  await expect(
    page.getByRole("button", {
      name: "Remove Demo seasonal fatigue from Major complaints",
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Patient name")).toHaveValue(
    "Demo Patient Retained",
  );
});

test("catalog help explains how to finish the current consultation", async ({
  page,
}) => {
  await openPrescription(page, "catalog-help");

  await expect(
    page.getByText(
      "Search or use the categories above to record this consultation. If the right term is missing, type it and save it as a clinic term.",
    ),
  ).toBeVisible();
  await expect(page.getByText(/ABDM-recognised terminology/)).toHaveCount(0);
});
