import { expect, test, type Locator, type Page } from "@playwright/test";

const draftIdStorageKey = "vishwas-clinic-demo-draft-id";

async function useIsolatedDraft(page: Page, testName: string) {
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
  await trigger.page().getByRole("button", { name: item, exact: true }).click();
  await trigger.page().keyboard.press("Escape");
}

test("consultation values appear unchanged in the draft prescription", async ({
  page,
}) => {
  await page.goto("/");

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
    page.getByRole("button", { name: "Major complaints" }),
    "major complaints",
    "Headache",
  );
  await chooseCatalogItem(
    page,
    page.getByRole("button", { name: "Examination findings" }),
    "examination findings",
    "Alert and oriented",
  );
  await chooseCatalogItem(
    page,
    page.getByRole("button", { name: "Provisional diagnosis" }),
    "provisional diagnosis",
    "Migraine",
  );
  await chooseCatalogItem(
    page,
    page.getByRole("button", { name: "Advice" }),
    "advice",
    "Rest as advised",
  );
  await chooseCatalogItem(
    page,
    page.getByRole("button", { name: "Investigations" }),
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

test("changed consultation autosaves and recovers after refresh", async ({
  page,
}) => {
  await useIsolatedDraft(page, "recovery");
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
  await useIsolatedDraft(page, "failed-save");
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
  await useIsolatedDraft(page, "stale-save");
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
  await useIsolatedDraft(page, "leave-warning");
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
  await useIsolatedDraft(page, "initial-load-failure");
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
  await useIsolatedDraft(page, "slow-initial-load");
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
