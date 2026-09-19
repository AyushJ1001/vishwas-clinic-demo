import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  openDraft,
  patientWithEarlierPrescription,
  sampleConsultation,
} from "./fixtures";

async function openPrescription(page: Page, testName: string) {
  await openDraft(page, testName);
}

const draftIdStorageKey = "vishwas-clinic-demo-draft-id";

async function tabTo(page: Page, target: Locator, maxTabs = 120) {
  for (let index = 0; index < maxTabs; index += 1) {
    if (
      await target.evaluate((element) => element === document.activeElement)
    ) {
      return;
    }
    await page.keyboard.press("Tab");
  }
  const activeElement = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    name: document.activeElement?.getAttribute("aria-label"),
    text: document.activeElement?.textContent?.trim().slice(0, 80),
  }));
  throw new Error(
    `Could not reach the requested control by keyboard. Active element: ${JSON.stringify(activeElement)}`,
  );
}

async function replaceFocusedValue(page: Page, value: string) {
  await page.keyboard.press("ControlOrMeta+A");
  if (value) await page.keyboard.type(value);
  else await page.keyboard.press("Backspace");
}

async function chooseFirstSelectOption(page: Page) {
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

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

async function makeSeededConsultationValid(page: Page) {
  await page.getByRole("radio", { name: "New prescription" }).check();
  for (const medicine of [
    "Paracetamol 500 mg tablet",
    "Levocetirizine 5 mg tablet",
  ]) {
    await page.getByLabel(`${medicine} dose`).selectOption("1–0–1");
    await page.getByLabel(`${medicine} duration`).selectOption("5 days");
    await page.getByLabel(`${medicine} method`).selectOption("After food");
  }
}

async function completeSeededPrescription(page: Page, patientName: string) {
  await makeSeededConsultationValid(page);
  await page.getByLabel("Patient name").fill(patientName);
  await page.getByRole("button", { name: "Review prescription" }).click();
  await page
    .getByRole("dialog", { name: "Review prescription" })
    .getByRole("button", { name: "Complete prescription" })
    .click();
  await expect(
    page.getByRole("status", { name: "Prescription completed" }),
  ).toBeVisible();
}

// A completed prescription adds the Patient number the draft did not have
// yet; everything else must match what was reviewed.
function withoutPatientNumber(texts: string[]) {
  return texts.map((text) => text.replace(/Patient no\. \d+ · /gu, ""));
}

async function textWithoutPatientNumber(pages: Locator) {
  return withoutPatientNumber(await pages.allInnerTexts());
}

function validPaginationConsultation() {
  return {
    ...sampleConsultation(),
    visitType: "new" as const,
    consultationDate: "2026-09-12",
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

async function openSavedConsultation(
  page: Page,
  request: APIRequestContext,
  testName: string,
  consultation: ReturnType<typeof validPaginationConsultation>,
) {
  const draftId = `e2e-pagination-${testName}-${Date.now()}`;
  const saved = await request.put(`/api/consultation-drafts/${draftId}`, {
    data: { consultation, revision: 1 },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: draftIdStorageKey, value: draftId },
  );
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("Saved", {
    timeout: 15_000,
  });
  await expect(page.getByLabel("Patient name")).toHaveValue(
    consultation.patient.name,
  );
}

test("an exactly full A5 prescription remains one page in review and completion", async ({
  page,
  request,
}) => {
  // After the letterhead and three one-line clinical sections, eighteen
  // one-line advice items plus the empty investigations row fill the left
  // column exactly at full 9pt text; a nineteenth would make it step down.
  const exactFitAdvice = [
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
  ].map((count) => `Fit ${count}`);
  await openSavedConsultation(page, request, "exact-fit", {
    ...validPaginationConsultation(),
    advice: exactFitAdvice,
  });

  await page.getByRole("button", { name: "Review prescription" }).click();
  const review = page.getByRole("dialog", { name: "Review prescription" });
  await expect(review.getByText("1 A5 page", { exact: true })).toBeVisible();
  await expect(
    review.getByRole("article", { name: "Prescription under review" }),
  ).toHaveCount(1);
  await expect(
    review.getByRole("article", { name: "Prescription under review" }),
  ).toContainText("Fit eighteen");
  const lastAdviceClipping = await review
    .locator(".rx-left-column")
    .evaluate((column) => {
      const lastItem = column.querySelector("li:last-of-type")!;
      return (
        lastItem.getBoundingClientRect().bottom -
        column.getBoundingClientRect().bottom
      );
    });
  expect(lastAdviceClipping).toBeLessThanOrEqual(0);
  await expect(
    review.getByRole("article", { name: "Prescription under review" }),
  ).toHaveCSS("font-size", "12px");

  await review.getByRole("button", { name: "Complete prescription" }).click();
  await expect(
    page.getByRole("article", { name: "Completed prescription" }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("article", { name: "Completed prescription" }),
  ).toContainText("Page 1 of 1");
});

test("supported-script glyphs stay inside the DOM columns and PDF media box", async ({
  page,
  request,
}) => {
  const adversarialDevanagari = "ओ".repeat(69);
  const adversarialLatin = "m".repeat(69);
  await openSavedConsultation(page, request, "supported-script-width", {
    ...validPaginationConsultation(),
    examinationFindings: [adversarialDevanagari],
    provisionalDiagnosis: adversarialLatin,
  });

  await page.getByRole("button", { name: "Review prescription" }).click();
  const review = page.getByRole("dialog", { name: "Review prescription" });
  const reviewPages = review.getByRole("article", {
    name: "Prescription under review",
  });
  for (const adversarialText of [adversarialDevanagari, adversarialLatin]) {
    const character = adversarialText[0];
    const plannedLines = reviewPages
      .locator(".prescription-clinical span")
      .filter({ hasText: new RegExp(`^${character}+\\s*$`, "u") });
    expect(await plannedLines.count()).toBeGreaterThan(1);
    expect(
      (await plannedLines.allInnerTexts()).join("").replaceAll(" ", ""),
    ).toBe(adversarialText);
    const domBounds = await plannedLines.evaluateAll((elements) =>
      elements.map((element) => {
        const line = element.getBoundingClientRect();
        const prescriptionPage = element
          .closest("article")!
          .getBoundingClientRect();
        return {
          left: line.left,
          right: line.right,
          pageLeft: prescriptionPage.left,
          pageRight: prescriptionPage.right,
        };
      }),
    );
    for (const bounds of domBounds) {
      expect(bounds.left).toBeGreaterThanOrEqual(bounds.pageLeft - 1);
      expect(bounds.right).toBeLessThanOrEqual(bounds.pageRight + 1);
    }
  }

  await review.getByRole("button", { name: "Complete prescription" }).click();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const path = await (await downloadEvent).path();
  expect(path).not.toBeNull();
  const pdf = await getDocument({
    data: new Uint8Array(await readFile(path!)),
  }).promise;
  let extractedDevanagari = "";
  let extractedLatin = "";
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const pdfPage = await pdf.getPage(pageNumber);
    const viewport = pdfPage.getViewport({ scale: 1 });
    const content = await pdfPage.getTextContent();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      expect(item.transform[4]).toBeGreaterThanOrEqual(-1);
      expect(item.transform[4] + item.width).toBeLessThanOrEqual(
        viewport.width + 1,
      );
      if (/^ओ+$/u.test(item.str)) extractedDevanagari += item.str;
      if (/^m+$/u.test(item.str)) extractedLatin += item.str;
    }
  }
  expect(extractedDevanagari).toBe(adversarialDevanagari);
  expect(extractedLatin).toBe(adversarialLatin);
});

test("eight medicines with full clinical notes still fit on one A5 page", async ({
  page,
  request,
}) => {
  const medicines = [
    ["Paracetamol 650 mg tablet", "1–0–1", "5 days", "After food"],
    ["Azithromycin 500 mg tablet", "1–0–0", "3 days", "After food"],
    ["Pantoprazole 40 mg tablet", "1–0–0", "7 days", "Before food"],
    ["Levocetirizine 5 mg tablet", "0–0–1", "5 days", "At bedtime"],
    ["Montelukast 10 mg tablet", "0–0–1", "10 days", "At bedtime"],
    ["Metformin 500 mg tablet", "1–0–1", "Until review", "After food"],
    ["Budesonide–formoterol inhaler", "1–0–1", "14 days", "As directed"],
    ["ORS low-osmolarity sachet", "As needed", "3 days", "With water"],
  ].map(([name, dose, duration, method]) => ({
    name,
    dose,
    duration,
    method,
  }));
  await openSavedConsultation(page, request, "eight-medicines", {
    ...validPaginationConsultation(),
    doctorName: "Dr. Gauri Makarand Apte",
    complaints: [
      "Low-grade fever for three days",
      "Dry cough worse at night",
      "Sore throat",
      "Body ache",
    ],
    examinationFindings: ["Throat congestion", "Mild bilateral wheeze"],
    advice: [
      "Warm saline gargles",
      "Maintain hydration",
      "Steam inhalation twice daily",
    ],
    investigations: ["CBC", "Chest X-ray PA view"],
    medicines,
  });

  await page.getByRole("button", { name: "Review prescription" }).click();
  const review = page.getByRole("dialog", { name: "Review prescription" });
  await expect(review.getByText("1 A5 page", { exact: true })).toBeVisible();
  const reviewed = review.getByRole("article", {
    name: "Prescription under review",
  });
  await expect(reviewed).toContainText("8. ORS low-osmolarity sachet");
  const clipping = await reviewed.evaluate((article) =>
    [
      ...article.querySelectorAll(
        ".prescription-clinical, .rx-left-column, .rx-medicine-column",
      ),
    ].map((region) => region.scrollHeight - region.clientHeight),
  );
  expect(Math.max(...clipping)).toBeLessThanOrEqual(0);
  const fontSize = await reviewed.evaluate((article) =>
    Number.parseFloat(getComputedStyle(article).fontSize),
  );
  // Text steps down together from 9pt, but never below 7.5pt (10px).
  expect(fontSize).toBeLessThan(12);
  expect(fontSize).toBeGreaterThanOrEqual(10);

  await review.getByRole("button", { name: "Complete prescription" }).click();
  await expect(
    page.getByRole("article", { name: "Completed prescription" }),
  ).toHaveCount(1);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const path = await (await downloadEvent).path();
  const pdf = await getDocument({
    data: new Uint8Array(await readFile(path!)),
  }).promise;
  expect(pdf.numPages).toBe(1);
});

test("overflow keeps identical two-page breaks and content across mobile review, completion, print, and PDF", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Enough advice that even the smallest text step cannot fit one page, so
  // the prescription stays at full size and breaks onto exactly two pages.
  const advice = Array.from(
    { length: 18 },
    (_, index) => `Overflow advice ${index + 1}: drink measured fluids`,
  );
  const consultation = {
    ...validPaginationConsultation(),
    patient: {
      ...validPaginationConsultation().patient,
      name: "Demo Patient 李 Zoë D’Souza",
    },
    advice,
    investigations: ["CBC overflow marker · रक्त जाँच"],
  };
  await openSavedConsultation(page, request, "two-page-mobile", consultation);

  const draftPages = page.getByRole("article", {
    name: "Draft prescription preview",
  });
  await expect(draftPages).toHaveCount(2);
  await page.getByRole("button", { name: "Review prescription" }).click();
  const review = page.getByRole("dialog", { name: "Review prescription" });
  await expect(review.getByText("2 A5 pages", { exact: true })).toBeVisible();
  const reviewPages = review.getByRole("article", {
    name: "Prescription under review",
  });
  await expect(reviewPages).toHaveCount(2);
  const reviewedText = await reviewPages.allInnerTexts();
  const reviewedBounds = await reviewPages.evaluateAll((elements) =>
    elements.map((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      };
    }),
  );
  for (const bounds of reviewedBounds) {
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(390);
    expect(bounds.scrollHeight).toBeLessThanOrEqual(bounds.clientHeight + 1);
  }
  const clinicalLabel = reviewPages
    .getByText("Major complaints:", { exact: true })
    .first();
  const fitWidthClinicalFontSize = await clinicalLabel.evaluate((element) => {
    const prescriptionPage = element.closest<HTMLElement>(
      ".prescription-page",
    )!;
    const scale =
      prescriptionPage.getBoundingClientRect().width /
      prescriptionPage.offsetWidth;
    return Number.parseFloat(getComputedStyle(element).fontSize) * scale;
  });
  expect(Number.isFinite(fitWidthClinicalFontSize)).toBe(true);
  expect(fitWidthClinicalFontSize).toBeLessThan(11);
  for (let step = 0; step < 4; step += 1) {
    await review.getByRole("button", { name: "Zoom in" }).click();
  }
  await expect(review.getByLabel("Review zoom")).toHaveText("200%");
  const effectiveClinicalFontSize = await clinicalLabel.evaluate((element) => {
      const prescriptionPage = element.closest<HTMLElement>(
        ".prescription-page",
      )!;
      const fontSize = Number.parseFloat(getComputedStyle(element).fontSize);
      const transformScale =
        prescriptionPage.getBoundingClientRect().width /
        prescriptionPage.offsetWidth;
      return fontSize * transformScale;
    });
  expect(Number.isFinite(effectiveClinicalFontSize)).toBe(true);
  expect(effectiveClinicalFontSize).toBeGreaterThanOrEqual(11);

  await review.getByRole("button", { name: "Complete prescription" }).click();
  const completedPages = page.getByRole("article", {
    name: "Completed prescription",
  });
  await expect(completedPages).toHaveCount(2);
  expect(await textWithoutPatientNumber(completedPages)).toEqual(withoutPatientNumber(reviewedText));
  await expect(completedPages.nth(0)).toContainText("Overflow advice 1:");
  await expect(completedPages.nth(1)).toContainText("CBC overflow marker");

  await page.emulateMedia({ media: "print" });
  const printBreaks = await completedPages.evaluateAll((elements) =>
    elements.map((element) => getComputedStyle(element).breakAfter),
  );
  expect(printBreaks).toEqual(["page", "auto"]);
  await page.emulateMedia({ media: "screen" });

  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const path = await (await downloadEvent).path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);
  const pdf = await getDocument({ data: new Uint8Array(bytes) }).promise;
  expect(pdf.numPages).toBe(2);
  const pdfText: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const pdfPage = await pdf.getPage(pageNumber);
    const content = await pdfPage.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pdfText.push(text);
    expect(text).toContain("VISHWAS CLINIC");
    expect(text).toContain("Demo Patient 李 Zoë D’Souza");
    expect(text).toContain("No substitutes · Bring the prescription");
    expect(text).toContain(`Page ${pageNumber} of 2`);
  }
  const allPdfText = pdfText.join(" ");
  for (const item of [...advice, "CBC overflow marker", "रक्त जाँच"]) {
    expect(allPdfText).toContain(item);
  }
});

test("oversized clinical, advice, and medicine items always advance without clipping or data loss", async ({
  page,
  request,
}) => {
  const longClinical = `CLINICAL-START ${"carefully-observed ".repeat(90)}CLINICAL-END`;
  const longAdvice = `ADVICE-START ${"measured-hydration ".repeat(90)}ADVICE-END`;
  const longMedicine = `MEDICINE-START ${"extended-release ".repeat(90)}MEDICINE-END`;
  await openSavedConsultation(page, request, "oversized-items", {
    ...validPaginationConsultation(),
    examinationFindings: [longClinical],
    advice: [longAdvice],
    medicines: [
      {
        name: longMedicine,
        dose: "1–0–1",
        duration: "5 days",
        method: "After food",
      },
    ],
  });

  await page.getByRole("button", { name: "Review prescription" }).click();
  const review = page.getByRole("dialog", { name: "Review prescription" });
  const pages = review.getByRole("article", {
    name: "Prescription under review",
  });
  const count = await pages.count();
  expect(count).toBeGreaterThan(3);
  expect(count).toBeLessThan(20);
  await expect(pages.first()).toContainText("CLINICAL-START");
  const completeText = (await pages.allInnerTexts()).join(" ");
  const completeCharacters = completeText.replace(/\s/gu, "");
  for (const marker of [
    "CLINICAL-START",
    "CLINICAL-END",
    "ADVICE-START",
    "ADVICE-END",
    "MEDICINE-START",
    "MEDICINE-END",
  ]) {
    expect(completeCharacters).toContain(marker);
  }
  const numbering = await pages.evaluateAll((elements) =>
    elements.map((element) => {
      const pageBounds = element.getBoundingClientRect();
      const footerTop = element
        .querySelector("footer")!
        .getBoundingClientRect().top;
      const content = element.querySelectorAll(
        ".prescription-clinical b, .prescription-clinical span, .prescription-columns b, .prescription-columns span",
      );
      const visuallyClipped = Array.from(content).some((node) => {
        const bounds = node.getBoundingClientRect();
        return (
          bounds.bottom > footerTop + 1 ||
          bounds.left < pageBounds.left - 1 ||
          bounds.right > pageBounds.right + 1
        );
      });
      return {
        number: element.getAttribute("data-page-number"),
        count: element.getAttribute("data-page-count"),
        clipped:
          element.scrollHeight > element.clientHeight + 1 || visuallyClipped,
      };
    }),
  );
  expect(numbering).toEqual(
    Array.from({ length: count }, (_, index) => ({
      number: String(index + 1),
      count: String(count),
      clipped: false,
    })),
  );

  await review.getByRole("button", { name: "Complete prescription" }).click();
  const completedPages = page.getByRole("article", {
    name: "Completed prescription",
  });
  await expect(completedPages).toHaveCount(count);
  expect((await textWithoutPatientNumber(completedPages)).join(" ")).toBe(completeText);

  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const path = await (await downloadEvent).path();
  expect(path).not.toBeNull();
  const pdf = await getDocument({
    data: new Uint8Array(await readFile(path!)),
  }).promise;
  expect(pdf.numPages).toBe(count);
  const pdfPageText: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const pdfPage = await pdf.getPage(pageNumber);
    const content = await pdfPage.getTextContent();
    pdfPageText.push(
      content.items.map((item) => ("str" in item ? item.str : "")).join(" "),
    );
  }
  const allPdfText = pdfPageText.join(" ");
  const allPdfCharacters = allPdfText.replace(/\s/gu, "");
  for (const marker of [
    "CLINICAL-START",
    "CLINICAL-END",
    "ADVICE-START",
    "ADVICE-END",
    "MEDICINE-START",
    "MEDICINE-END",
  ]) {
    expect(allPdfCharacters).toContain(marker);
  }
});

test("print is available only for a completed A5 prescription and prints only that document", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.print = () => {
      document.documentElement.dataset.printCalled = "true";
    };
  });
  await openPrescription(page, "completed-print");
  await expect(
    page.getByRole("button", { name: "Print prescription" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download PDF" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Share prescription" }),
  ).toHaveCount(0);

  await completeSeededPrescription(page, "Demo Patient Print Boundary");
  const completedDocument = page.getByRole("article", {
    name: "Completed prescription",
  });
  await expect(completedDocument).toContainText("Demo Patient Print Boundary");
  await expect(completedDocument).toHaveAttribute("data-page-number", "1");
  await expect(completedDocument).toHaveAttribute("data-page-count", "1");

  await page.getByRole("button", { name: "Print prescription" }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-print-called",
    "true",
  );

  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("navigation")).toBeHidden();
  await expect(
    page.getByRole("status", { name: "Prescription completed" }),
  ).toBeHidden();
  await expect(completedDocument).toBeVisible();
  const printSize = await completedDocument.evaluate((element) => {
    const style = getComputedStyle(element);
    return { width: style.width, height: style.height };
  });
  expect(Number.parseFloat(printSize.width)).toBeCloseTo(559.37, 0);
  expect(Number.parseFloat(printSize.height)).toBeCloseTo(793.7, 0);
});

test("downloaded PDF is a readable A5 document with the completed Unicode content", async ({
  page,
}) => {
  const requestedFonts: string[] = [];
  page.on("request", (request) => requestedFonts.push(request.url()));
  await openPrescription(page, "completed-pdf");
  await completeSeededPrescription(page, "Demo Patient माधुरी देशमुख");
  const downloadButton = page.getByRole("button", { name: "Download PDF" });
  await expect(downloadButton).toBeEnabled();

  const downloadEvent = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe(
    "vishwas-prescription-demo-patient.pdf",
  );
  const path = await download.path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(bytes.byteLength).toBeGreaterThan(4_000);

  const pdf = await getDocument({ data: new Uint8Array(bytes) }).promise;
  expect(pdf.numPages).toBe(1);
  const pdfPage = await pdf.getPage(1);
  const viewport = pdfPage.getViewport({ scale: 1 });
  expect(viewport.width).toBeCloseTo(419.53, 1);
  expect(viewport.height).toBeCloseTo(595.28, 1);
  const content = await pdfPage.getTextContent();
  const text = content.items
    .map((item) => ("str" in item ? item.str : ""))
    .join(" ");
  for (const expected of [
    "VISHWAS CLINIC",
    "Dr. Makarand Vishwas Apte",
    "MBBS, MD (Anatomy)",
    "Demo Patient माधुरी देशमुख",
    "Temperature 100.2 °F",
    "SpO₂ 98%",
    "Low-grade fever",
    "Throat congestion",
    "Viral upper respiratory tract infection",
    "Paracetamol 500 mg tablet",
    "Paracetamol IP 500 mg",
    "1–0–1 · After food · 5 days",
    "Warm saline gargles",
    "No substitutes · Bring the prescription at the next visit",
    "Page 1 of 1",
  ]) {
    expect(text).toContain(expected);
  }
  expect(requestedFonts.some((url) => url.includes("NotoSansSC"))).toBe(false);
});

test("downloaded PDF preserves a long multilingual patient identity without overlapping demographics", async ({
  page,
}) => {
  const requestedFonts: string[] = [];
  page.on("request", (request) => requestedFonts.push(request.url()));
  const patientName =
    "Demo Patient 李 Zoë D’Souza Chandrashekhar Venkataraman Narayanaswamy";
  await openPrescription(page, "long-multilingual-patient-pdf");
  await completeSeededPrescription(page, patientName);

  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const path = await (await downloadEvent).path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);
  expect(bytes.byteLength).toBeLessThan(500_000);
  const pdf = await getDocument({ data: new Uint8Array(bytes) }).promise;
  const pdfPage = await pdf.getPage(1);
  const content = await pdfPage.getTextContent();
  const textItems = content.items.flatMap((item) =>
    "str" in item
      ? [
          {
            text: item.str,
            x: item.transform[4],
            y: item.transform[5],
            right: item.transform[4] + item.width,
          },
        ]
      : [],
  );
  const extractedText = textItems.map((item) => item.text).join(" ");
  expect(extractedText).toContain(patientName);

  const ageAndGender = textItems.find((item) =>
    /^Patient no\. \d+ · Age\/Gender:/u.test(item.text),
  );
  const consultationDate = textItems.find((item) =>
    item.text.startsWith("Date:"),
  );
  expect(ageAndGender).toBeDefined();
  expect(consultationDate).toBeDefined();
  expect(ageAndGender!.right).toBeLessThanOrEqual(consultationDate!.x - 4);

  const nameRows = textItems.filter(
    (item) =>
      item.text.includes("Demo Patient") ||
      item.text.includes("李") ||
      item.text.includes("Narayanaswamy"),
  );
  expect(nameRows.length).toBeGreaterThan(0);
  expect(Math.max(...nameRows.map((item) => item.right))).toBeLessThanOrEqual(
    395,
  );
  expect(Math.min(...nameRows.map((item) => item.y))).toBeGreaterThan(
    ageAndGender!.y + 4,
  );
  expect(
    requestedFonts.some(
      (url) =>
        url.includes("NotoSansSC") &&
        url.includes("prescription-font-request="),
    ),
  ).toBe(true);
});

test("supported file sharing receives the prepared PDF and treats cancellation as harmless", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const state = {
      canShareCalls: 0,
      shareCalls: 0,
      file: null as File | null,
      shareWasSynchronous: false,
      directClickActive: false,
    };
    Object.defineProperty(window, "__prescriptionShareState", { value: state });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: (data: ShareData) => {
        state.canShareCalls += 1;
        return data.files?.length === 1;
      },
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        state.shareCalls += 1;
        state.file = data.files?.[0] ?? null;
        if (state.directClickActive) state.shareWasSynchronous = true;
        if (state.shareCalls === 1) {
          throw new DOMException("Share cancelled", "AbortError");
        }
      },
    });
  });
  await openPrescription(page, "supported-file-share");
  await completeSeededPrescription(page, "Demo Patient Mobile Share");
  const shareButton = page.getByRole("button", { name: "Share prescription" });
  await expect(shareButton).toBeEnabled();

  await shareButton.evaluate((button) => {
    const state = (
      window as typeof window & {
        __prescriptionShareState: { directClickActive: boolean };
      }
    ).__prescriptionShareState;
    state.directClickActive = true;
    (button as HTMLButtonElement).click();
    state.directClickActive = false;
  });
  await expect(shareButton).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await shareButton.click();
  await expect(
    page.locator('[role="status"]').filter({ hasText: "Prescription shared." }),
  ).toBeVisible();
  const shared = await page.evaluate(() => {
    const state = (
      window as typeof window & {
        __prescriptionShareState: {
          canShareCalls: number;
          shareCalls: number;
          file: File;
          shareWasSynchronous: boolean;
        };
      }
    ).__prescriptionShareState;
    return {
      canShareCalls: state.canShareCalls,
      shareCalls: state.shareCalls,
      name: state.file.name,
      type: state.file.type,
      size: state.file.size,
      shareWasSynchronous: state.shareWasSynchronous,
    };
  });
  expect(shared).toEqual({
    canShareCalls: 2,
    shareCalls: 2,
    name: "vishwas-prescription-demo-patient-mobile-share.pdf",
    type: "application/pdf",
    size: expect.any(Number),
    shareWasSynchronous: true,
  });
  expect(shared.size).toBeGreaterThan(4_000);
});

test("download failure keeps the completed prescription and succeeds on retry", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const createObjectUrl = URL.createObjectURL.bind(URL);
    let failNextDownload = true;
    URL.createObjectURL = (object) => {
      if (failNextDownload) {
        failNextDownload = false;
        throw new Error("Download unavailable");
      }
      return createObjectUrl(object);
    };
  });
  await openPrescription(page, "download-failure-retry");
  await completeSeededPrescription(page, "Demo Patient Download Recovery");
  const completed = page.getByRole("article", {
    name: "Completed prescription",
  });
  const downloadButton = page.getByRole("button", { name: "Download PDF" });

  await downloadButton.click();
  await expect(page.getByRole("alert")).toContainText(
    "The PDF could not be downloaded. Try again.",
  );
  await expect(completed).toContainText("Demo Patient Download Recovery");

  const downloadEvent = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe(
    "vishwas-prescription-demo-patient-download-recovery.pdf",
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(completed).toContainText("Demo Patient Download Recovery");
});

test("unsupported file sharing explains the fallback and downloads the same PDF", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => false,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: () => {
        throw new Error("navigator.share must not be called");
      },
    });
  });
  await openPrescription(page, "unsupported-file-share");
  await completeSeededPrescription(page, "Demo Patient Share Fallback");
  const shareButton = page.getByRole("button", { name: "Share prescription" });
  await expect(shareButton).toBeEnabled();

  const fallbackEvent = page.waitForEvent("download");
  await shareButton.click();
  const fallbackDownload = await fallbackEvent;
  await expect(
    page
      .locator('[role="status"]')
      .filter({ hasText: "File sharing is not supported" }),
  ).toContainText("The same PDF was downloaded instead.");
  const directEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const directDownload = await directEvent;
  const [fallbackPath, directPath] = await Promise.all([
    fallbackDownload.path(),
    directDownload.path(),
  ]);
  expect(fallbackPath).not.toBeNull();
  expect(directPath).not.toBeNull();
  const [fallbackBytes, directBytes] = await Promise.all([
    readFile(fallbackPath!),
    readFile(directPath!),
  ]);
  expect(fallbackBytes.equals(directBytes)).toBe(true);
});

test("PDF preparation, sharing, and printing failures keep the completed snapshot and recover", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = { printCalls: 0, shareCalls: 0 };
    Object.defineProperty(window, "__prescriptionFailureState", {
      value: state,
    });
    const NativeFile = File;
    let failFileCreation = true;
    Object.defineProperty(window, "File", {
      configurable: true,
      value: class FlakyFile extends NativeFile {
        constructor(
          fileBits: BlobPart[],
          fileName: string,
          options?: FilePropertyBag,
        ) {
          if (failFileCreation) {
            failFileCreation = false;
            throw new Error("File creation unavailable");
          }
          super(fileBits, fileName, options);
        }
      },
    });
    window.print = () => {
      state.printCalls += 1;
      if (state.printCalls === 1) throw new Error("Print unavailable");
    };
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        state.shareCalls += 1;
        if (state.shareCalls === 1) throw new Error("Share unavailable");
      },
    });
  });
  await openPrescription(page, "output-failure-retry");
  await completeSeededPrescription(page, "Demo Patient Stable Snapshot");
  const completed = page.getByRole("article", {
    name: "Completed prescription",
  });
  await expect(completed).toContainText("Demo Patient Stable Snapshot");
  await expect(page.getByRole("alert")).toContainText(
    "The PDF could not be prepared. The completed prescription is still available.",
  );

  await page.getByRole("button", { name: "Retry PDF preparation" }).click();
  await expect(
    page.getByRole("button", { name: "Download PDF" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Download PDF" }),
  ).toBeFocused();

  await page.getByRole("button", { name: "Print prescription" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "The print dialog did not open. Try again or download the PDF.",
  );
  await page.getByRole("button", { name: "Print prescription" }).click();
  await expect(completed).toContainText("Demo Patient Stable Snapshot");

  await page.getByRole("button", { name: "Share prescription" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "The prescription could not be shared. Try again or download the PDF.",
  );
  await expect(
    page.getByRole("button", { name: "Download PDF" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Share prescription" }).click();
  await expect(
    page.locator('[role="status"]').filter({ hasText: "Prescription shared." }),
  ).toBeVisible();
  await expect(completed).toContainText("Demo Patient Stable Snapshot");

  const attempts = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __prescriptionFailureState: {
            printCalls: number;
            shareCalls: number;
          };
        }
      ).__prescriptionFailureState,
  );
  expect(attempts).toEqual({ printCalls: 2, shareCalls: 2 });

  await page.reload();
  await expect(
    page.getByRole("article", { name: "Completed prescription" }),
  ).toContainText("Demo Patient Stable Snapshot");
});

test("review lists blocking problems and takes focus to the selected field", async ({
  page,
}) => {
  await openPrescription(page, "invalid-review");
  await page.getByLabel("Patient name").fill("   ");
  await page.getByLabel("Age").fill("-2");
  await page.getByLabel("Weight").fill("62kg");

  await page.getByRole("button", { name: "Review prescription" }).click();

  const review = page.getByRole("dialog", { name: "Review prescription" });
  await expect(review).toBeVisible();
  await expect(review).toContainText("Choose a prescription type.");
  await expect(review).toContainText("Enter the patient's name.");
  await expect(review).toContainText("Age must be a nonnegative whole number.");
  await expect(review).toContainText("Enter weight as a number.");
  await expect(review).toContainText(
    "Choose a dose for Paracetamol 500 mg tablet.",
  );
  await expect(
    review.getByRole("button", { name: "Complete prescription" }),
  ).toBeDisabled();

  await review.getByRole("button", { name: "Fix patient name" }).click();
  await expect(review).toBeHidden();
  await expect(page.getByLabel("Patient name")).toBeFocused();
  await expect(page.getByLabel("Patient name")).toHaveValue("   ");
  const inlineProblem = page.getByText("Enter the patient's name.");
  await expect(inlineProblem).toBeVisible();
  await expect(inlineProblem).toHaveCSS("color", "rgb(179, 38, 30)");
});

test("closing review restores focus to the review action", async ({ page }) => {
  await openPrescription(page, "review-close-focus");
  const reviewButton = page.getByRole("button", {
    name: "Review prescription",
  });
  await reviewButton.click();
  const review = page.getByRole("dialog", { name: "Review prescription" });
  await expect(review.getByRole("button", { name: /Fix / }).first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(review).toBeHidden();
  await expect(reviewButton).toBeFocused();
});

test("a keyboard-only journey corrects review problems and completes an output action", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openPrescription(page, "keyboard-only-consultation");

  const newPrescription = page.getByRole("radio", {
    name: "New prescription",
  });
  await tabTo(page, newPrescription);
  await page.keyboard.press("Space");
  await expect(newPrescription).toBeChecked();

  const patientName = page.getByLabel("Patient name");
  await tabTo(page, patientName);
  await replaceFocusedValue(page, "");

  const complaints = page.getByRole("combobox", {
    name: "Major complaints",
    exact: true,
  });
  await tabTo(page, complaints);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("combobox", { name: "Search Major complaints" }),
  ).toBeFocused();
  await page.keyboard.type("Headache");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(complaints).toBeFocused();

  const removeHeadache = page.getByRole("button", {
    name: "Remove Headache from Major complaints",
  });
  await tabTo(page, removeHeadache);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", {
      name: "Remove Dry cough from Major complaints",
    }),
  ).toBeFocused();

  const reviewButton = page.getByRole("button", {
    name: "Review prescription",
  });
  await tabTo(page, reviewButton);
  await page.keyboard.press("Enter");

  const review = page.getByRole("dialog", { name: "Review prescription" });
  const fixPatientName = review.getByRole("button", {
    name: "Fix patient name",
  });
  await expect(fixPatientName).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(patientName).toBeFocused();
  await page.keyboard.type("Demo Patient Keyboard Journey");

  for (const label of [
    "Paracetamol 500 mg tablet dose",
    "Paracetamol 500 mg tablet duration",
    "Paracetamol 500 mg tablet method",
    "Levocetirizine 5 mg tablet dose",
    "Levocetirizine 5 mg tablet duration",
    "Levocetirizine 5 mg tablet method",
  ]) {
    await tabTo(page, page.getByLabel(label));
    await chooseFirstSelectOption(page);
  }

  await tabTo(page, reviewButton);
  await page.keyboard.press("Enter");
  const completeButton = review.getByRole("button", {
    name: "Complete prescription",
  });
  await expect(completeButton).toBeFocused();
  await page.keyboard.press("Enter");

  const completed = page.getByRole("status", {
    name: "Prescription completed",
  });
  await expect(completed).toBeFocused();
  await expect(
    page.getByRole("article", { name: "Completed prescription" }),
  ).toContainText("Demo Patient Keyboard Journey");

  const download = page.getByRole("button", { name: "Download PDF" });
  await expect(download).toBeEnabled();
  await tabTo(page, download);
  const downloadEvent = page.waitForEvent("download");
  await page.keyboard.press("Enter");
  expect((await downloadEvent).suggestedFilename()).toBe(
    "vishwas-prescription-demo-patient-keyboard-journey.pdf",
  );
});

test("an unlinked follow-up review lists every problem and routes clinical fixes through the earlier prescription", async ({
  page,
}) => {
  await openPrescription(page, "followup-review-focus");
  await page.getByLabel("Patient name").fill("   ");
  await page.getByRole("radio", { name: "Follow-up prescription" }).check();
  await expect(page.getByRole("combobox", { name: /^Earlier prescription/ })).toBeDisabled();

  await page.getByRole("button", { name: "Review prescription" }).click();
  const review = page.getByRole("dialog", { name: "Review prescription" });
  const problemActions = review.getByRole("list").first().getByRole("button");
  await expect(problemActions).toHaveCount(8);
  await expect(review).toContainText(
    "Choose the earlier prescription this follow-up continues.",
  );
  await expect(review).toContainText("Enter the patient's name.");
  await expect(review).toContainText(
    "Choose a dose for Paracetamol 500 mg tablet.",
  );

  // Patient details can be fixed straight away...
  await review.getByRole("button", { name: "Fix patient name" }).click();
  await expect(page.getByLabel("Patient name")).toBeFocused();

  // ...but clinical fixes wait for the earlier prescription, which in turn
  // waits for a saved patient.
  const { patient } = await patientWithEarlierPrescription(page);
  const doseFix = {
    name: "Choose the earlier prescription before fixing Paracetamol 500 mg tablet dose",
  };
  await page.getByRole("button", { name: "Review prescription" }).click();
  await review.getByRole("button", doseFix).click();
  await expect(page.getByLabel("Patient name")).toBeFocused();

  await page.getByLabel("Patient name").fill(patient.name);
  await page
    .getByRole("listbox", { name: "Matching patient records" })
    .getByRole("option", { name: new RegExp(patient.name) })
    .click();
  await page.getByRole("button", { name: "Review prescription" }).click();
  await review.getByRole("button", doseFix).click();
  await expect(
    page.getByRole("combobox", { name: /^Earlier prescription/ }),
  ).toBeFocused();
});

test("a reviewed prescription completes once, locks, and recovers after refresh", async ({
  page,
}) => {
  await openPrescription(page, "complete-and-recover");
  await makeSeededConsultationValid(page);
  await page.getByLabel("Patient name").fill("Demo Patient Completion");

  await page.getByRole("button", { name: "Review prescription" }).click();
  const review = page.getByRole("dialog", { name: "Review prescription" });
  await expect(
    review.getByRole("article", { name: "Prescription under review" }),
  ).toContainText("Demo Patient Completion");
  await expect(review).toContainText("Ready to complete");
  await review.getByRole("button", { name: "Complete prescription" }).click();

  await expect(
    page.getByRole("status", { name: "Prescription completed" }),
  ).toContainText("Prescription completed");
  await expect(
    page.getByRole("article", { name: "Completed prescription" }),
  ).toContainText("Demo Patient Completion");
  await expect(page.getByLabel("Patient name")).toHaveCount(0);
  await expect(page.getByLabel("Writing as")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Review prescription" }),
  ).toHaveCount(0);

  await page.reload();
  await expect(
    page.getByRole("status", { name: "Prescription completed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Completed prescription" }),
  ).toContainText("Demo Patient Completion");
  await expect(page.getByLabel("Patient name")).toHaveCount(0);
  await expect(page.getByLabel("Writing as")).toBeDisabled();
});

test("starting another consultation preserves the completed prescription and recovers from failure", async ({
  page,
  request,
}) => {
  await openPrescription(page, "unseeded-1");
  const completionResponse = page.waitForResponse((response) =>
    response.url().endsWith("/complete") && response.request().method() === "POST",
  );
  await completeSeededPrescription(page, "Demo Patient Previous Visit");
  const { snapshot } = await (await completionResponse).json();
  const completedDocument = page.getByRole("article", {
    name: "Completed prescription",
  });
  const completedText = await completedDocument.allInnerTexts();
  let failNextDraft = true;
  await page.route("**/api/consultation-drafts/**", async (route) => {
    if (route.request().method() === "PUT" && failNextDraft) {
      failNextDraft = false;
      await route.fulfill({ status: 503, body: "Temporary demo outage" });
      return;
    }
    await route.continue();
  });

  const startAnother = page.getByRole("button", {
    name: "Start another consultation",
  });
  await tabTo(page, startAnother);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toContainText(
    "The next consultation could not be started. This completed prescription is still available. Try again.",
  );
  await expect(startAnother).toBeFocused();
  expect(await completedDocument.allInnerTexts()).toEqual(completedText);
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeEnabled();
  await page.reload();
  await expect(completedDocument).toContainText("Demo Patient Previous Visit");

  await tabTo(page, startAnother);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("radio", { name: "New prescription" })).toBeFocused();
  await expect(page.getByLabel("Patient name")).toHaveValue("");
  await expect(page.getByLabel("Age")).toHaveValue("");
  await expect(page.getByRole("radiogroup", { name: "Prescription type" }).getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove Paracetamol 500 mg tablet", exact: true })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Saved");
  await page.reload();
  await expect(page.getByLabel("Patient name")).toHaveValue("");
  await expect(completedDocument).toHaveCount(0);

  const previous = await request.get(`/api/consultation-drafts/${snapshot.draftId}`);
  expect(previous.ok()).toBe(true);
  expect((await previous.json()).draft.completedSnapshot).toEqual(snapshot);
});

test("an older tab cannot save its patient into a newly started consultation", async ({ page, context }) => {
  await openPrescription(page, "unseeded-2");
  await makeSeededConsultationValid(page);
  await page.getByLabel("Patient name").fill("Demo Patient Original Tab");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Saved");
  const olderTab = await context.newPage();
  await olderTab.goto("/");
  await expect(olderTab.getByLabel("Patient name")).toHaveValue("Demo Patient Original Tab");

  await page.getByRole("button", { name: "Review prescription" }).click();
  await page.getByRole("dialog", { name: "Review prescription" }).getByRole("button", { name: "Complete prescription" }).click();
  await page.getByRole("button", { name: "Start another consultation" }).click();
  await expect(page.getByLabel("Patient name")).toHaveValue("");
  await page.getByLabel("Patient name").fill("Demo Patient New Consultation");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Saved");

  await olderTab.getByLabel("Patient name").fill("Demo Patient Stale Tab Edit");
  await expect(olderTab.getByRole("alert")).toContainText("Draft save failed. Your changes are still here.");
  await page.reload();
  await expect(page.getByLabel("Patient name")).toHaveValue("Demo Patient New Consultation");
  await expect(page.getByRole("status")).toContainText("Saved");
  await olderTab.close();
});

test("phone completion keeps readable patient identity beside the output actions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPrescription(page, "completed-phone-handoff");
  await page.getByLabel("Consultation date").fill("2026-09-10");
  await completeSeededPrescription(page, "Demo Patient Phone Handoff");
  const confirmation = page.getByRole("status", { name: "Prescription completed" });
  await expect(confirmation).toContainText("Demo Patient Phone Handoff");
  await expect(confirmation).toContainText("10/09/2026");
  const patientText = confirmation.getByText("Demo Patient Phone Handoff", { exact: true });
  expect(await patientText.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  await page.keyboard.press("ControlOrMeta+Home");
  for (const name of ["Print prescription", "Download PDF", "Share prescription"]) {
    const action = page.getByRole("button", { name, exact: true });
    await expect(action).toBeEnabled();
    const bounds = await action.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  }
});

test("phone review fits the viewport and keeps clinical text readable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPrescription(page, "phone-readable-review");
  await makeSeededConsultationValid(page);

  await page.getByRole("button", { name: "Review prescription" }).click();
  const review = page.getByRole("dialog", { name: "Review prescription" });
  const document = review.getByRole("article", {
    name: "Prescription under review",
  });
  await expect(document).toBeVisible();

  const bounds = await document.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      width: box.width,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(390);
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth);

  for (const text of ["Major complaints:", "1–0–1 · After food · 5 days"]) {
    const fontSize = await document
      .getByText(text, { exact: true })
      .first()
      .evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      );
    expect(fontSize).toBeGreaterThanOrEqual(11);
  }
});

test("phone keeps the current consultation and review action within thumb reach", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPrescription(page, "phone-persistent-review");

  const actions = page.getByRole("region", {
    name: "Current consultation actions",
  });
  await expect(actions).toBeVisible();
  await expect(actions).toContainText("Test Patient Ananya Deshmukh");
  await expect(actions).toContainText("Prescription type needed");
  await expect(actions).toContainText("Saved");
  await expect(
    page.locator('[role="status"]').filter({ hasText: "Saved" }),
  ).toHaveCount(1);

  const reviewButton = actions.getByRole("button", {
    name: "Review prescription",
  });
  const buttonBox = await reviewButton.boundingBox();
  expect(buttonBox).not.toBeNull();
  expect(buttonBox!.height).toBeGreaterThanOrEqual(44);
  expect(buttonBox!.y + buttonBox!.height).toBeLessThanOrEqual(844);
  expect(buttonBox!.y).toBeGreaterThan(700);
  await expect(
    page.getByRole("button", { name: "Review prescription" }),
  ).toHaveCount(1);

  await page.getByLabel("Patient name").fill("Demo Patient Mobile Context");
  await page.getByRole("radio", { name: "New prescription" }).check();
  await expect(actions).toContainText("Demo Patient Mobile Context");
  await expect(actions).toContainText("New consultation");

  await page.getByLabel("Levocetirizine 5 mg tablet method").scrollIntoViewIfNeeded();
  const methodBox = await page
    .getByLabel("Levocetirizine 5 mg tablet method")
    .boundingBox();
  const actionsBox = await actions.boundingBox();
  expect(methodBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  expect(methodBox!.y + methodBox!.height).toBeLessThanOrEqual(actionsBox!.y);
});

test("phone review expands to the viewport and zooms on a scrollable canvas", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPrescription(page, "phone-review-zoom");
  const opener = page.getByRole("button", { name: "Review prescription" });
  await opener.click();

  const review = page.getByRole("dialog", { name: "Review prescription" });
  await expect(review).toBeVisible();
  const dialogBox = await review.boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(dialogBox!.x).toBe(0);
  expect(dialogBox!.y).toBe(0);
  expect(dialogBox!.width).toBe(390);
  expect(dialogBox!.height).toBe(844);

  const canvas = review.getByRole("region", {
    name: "Prescription preview canvas",
  });
  const zoom = review.getByLabel("Review zoom");
  await expect(zoom).toHaveText("100%");
  await expect(review.getByRole("button", { name: "Zoom out" })).toBeDisabled();
  const fitBounds = await canvas.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(fitBounds.scrollWidth).toBeLessThanOrEqual(fitBounds.clientWidth);

  await review.getByRole("button", { name: "Zoom in" }).click();
  await expect(zoom).toHaveText("125%");
  await review.getByRole("button", { name: "Zoom in" }).click();
  await expect(zoom).toHaveText("150%");
  await review.getByRole("button", { name: "Zoom out" }).click();
  await expect(zoom).toHaveText("125%");
  const zoomedBounds = await canvas.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(zoomedBounds.scrollWidth).toBeGreaterThan(zoomedBounds.clientWidth);
  expect(zoomedBounds.scrollHeight).toBeGreaterThan(zoomedBounds.clientHeight);
  const scrollPosition = await canvas.evaluate((element) => {
    element.scrollLeft = 60;
    element.scrollTop = 60;
    return { left: element.scrollLeft, top: element.scrollTop };
  });
  expect(scrollPosition.left).toBeGreaterThan(0);
  expect(scrollPosition.top).toBeGreaterThan(0);

  await review.getByRole("button", { name: "Fit width" }).click();
  await expect(zoom).toHaveText("100%");
  await page.keyboard.press("Escape");
  await expect(review).toBeHidden();
  await expect(opener).toBeFocused();
});

test("reduced motion keeps the draft preview steady and uses instant scrolling", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openPrescription(page, "reduced-motion-preview");
  const preview = page.getByRole("article", {
    name: "Draft prescription preview",
  });
  const initial = await preview.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      transform: style.transform,
      opacity: style.opacity,
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    };
  });
  expect(initial).toEqual({
    transform: "none",
    opacity: "1",
    scrollBehavior: "auto",
  });

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const afterScroll = await preview.evaluate((element) => {
    const style = getComputedStyle(element);
    return { transform: style.transform, opacity: style.opacity };
  });
  expect(afterScroll).toEqual({ transform: "none", opacity: "1" });
});

test("desktop prioritizes the current consultation beside the live paper", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPrescription(page, "desktop-consultation-priority");

  const context = page.getByRole("region", { name: "Current consultation" });
  await expect(context).toBeVisible();
  await expect(context).toContainText("Test Patient Ananya Deshmukh");
  await expect(context).toContainText("Prescription type needed");
  await expect(context).toContainText("Saved");
  await expect(
    context.getByRole("button", { name: "Review prescription" }),
  ).toBeVisible();

  const form = page.getByRole("region", { name: "Consultation form" });
  const preview = page.locator(".preview-wrap");
  const [formBox, previewBox] = await Promise.all([
    form.boundingBox(),
    preview.boundingBox(),
  ]);
  expect(formBox).not.toBeNull();
  expect(previewBox).not.toBeNull();
  expect(formBox!.x + formBox!.width).toBeLessThan(previewBox!.x);
  expect(Math.abs(formBox!.y - previewBox!.y)).toBeLessThanOrEqual(2);
});

test("medicine instructions retain visible labels and readable selected values on desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPrescription(page, "medicine-visible-labels");
  for (const label of ["Medicine", "Dose", "Duration", "Method"]) {
    await expect(page.getByRole("columnheader", { name: label, exact: true })).toBeVisible();
  }
  for (const medicine of ["Paracetamol 500 mg tablet", "Levocetirizine 5 mg tablet"]) {
    await page.getByLabel(`${medicine} dose`).selectOption("As needed");
    await page.getByLabel(`${medicine} duration`).selectOption("Until review");
    await page.getByLabel(`${medicine} method`).selectOption("Before food");
    for (const instruction of ["dose", "duration", "method"]) {
      const selectedTextFits = await page.getByLabel(`${medicine} ${instruction}`).evaluate((element) => {
        const style = getComputedStyle(element);
        const context = document.createElement("canvas").getContext("2d")!;
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const textWidth = context.measureText(element.querySelector("option:checked")!.textContent!).width;
        // Leave 24px for the native select arrow in addition to its padding.
        return textWidth <= element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 24;
      });
      expect(selectedTextFits).toBe(true);
    }
  }
});

test("consultation controls wrap without clipping at supported breakpoints", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openPrescription(page, "responsive-breakpoints");

  for (const width of [320, 640, 768, 1024]) {
    await page.setViewportSize({ width, height: 700 });
    const layout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);

    const doctor = page.getByLabel("Writing as");
    const doctorBox = await doctor.boundingBox();
    expect(doctorBox).not.toBeNull();
    expect(doctorBox!.x).toBeGreaterThanOrEqual(0);
    expect(doctorBox!.x + doctorBox!.width).toBeLessThanOrEqual(width);

    const medicineRow = page
      .getByRole("button", {
        name: "Remove Paracetamol 500 mg tablet",
        exact: true,
      })
      .locator("..");
    const rowBounds = await medicineRow.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      };
    });
    expect(rowBounds.left).toBeGreaterThanOrEqual(0);
    expect(rowBounds.right).toBeLessThanOrEqual(width);
    expect(rowBounds.scrollWidth).toBeLessThanOrEqual(rowBounds.clientWidth);

    const mobileActions = page.getByRole("region", {
      name: "Current consultation actions",
    });
    if (width < 1024) await expect(mobileActions).toBeVisible();
    else await expect(mobileActions).toBeHidden();
  }

  await page.setViewportSize({ width: 320, height: 700 });
  const [brandBox, doctorBox] = await Promise.all([
    page.getByRole("link", { name: /Vishwas Clinic/ }).boundingBox(),
    page.getByLabel("Writing as").boundingBox(),
  ]);
  expect(brandBox).not.toBeNull();
  expect(doctorBox).not.toBeNull();
  expect(brandBox!.y + brandBox!.height).toBeLessThanOrEqual(doctorBox!.y);
});

test("phone catalog, review, and removal controls keep 44 pixel targets with safe spacing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPrescription(page, "phone-touch-targets");
  const actionNames = [
    "Review prescription",
    "Remove Low-grade fever from Major complaints",
    "Remove Dry cough from Major complaints",
    "Remove Paracetamol 500 mg tablet",
  ];
  for (const name of actionNames) {
    const target = page.getByRole("button", { name, exact: true });
    const box = await target.boundingBox();
    expect(box, name).not.toBeNull();
    expect(box!.width, name).toBeGreaterThanOrEqual(44);
    expect(box!.height, name).toBeGreaterThanOrEqual(44);
  }

  const firstRemove = await page
    .getByRole("button", {
      name: "Remove Low-grade fever from Major complaints",
      exact: true,
    })
    .boundingBox();
  const secondRemove = await page
    .getByRole("button", {
      name: "Remove Dry cough from Major complaints",
      exact: true,
    })
    .boundingBox();
  expect(firstRemove).not.toBeNull();
  expect(secondRemove).not.toBeNull();
  expect(secondRemove!.x - (firstRemove!.x + firstRemove!.width)).toBeGreaterThanOrEqual(
    8,
  );

  await page
    .getByRole("combobox", { name: "Major complaints", exact: true })
    .click();
  for (const target of [
    page.getByRole("button", { name: "Fever", exact: true }),
    page.getByRole("option", { name: "Low-grade fever", exact: true }),
  ]) {
    const box = await target.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  await page
    .getByRole("combobox", { name: "Search Major complaints" })
    .fill("Demo touch target term");
  const addCustom = page.getByRole("button", {
    name: "Add “Demo touch target term” as a clinic term",
  });
  const addCustomBox = await addCustom.boundingBox();
  expect(addCustomBox).not.toBeNull();
  expect(addCustomBox!.width).toBeGreaterThanOrEqual(44);
  expect(addCustomBox!.height).toBeGreaterThanOrEqual(44);
  await addCustom.click();
  for (const target of [
    page.getByRole("button", {
      name: "Save Demo touch target term to Major complaints catalog",
    }),
    page.getByRole("button", { name: "Cancel", exact: true }),
  ]) {
    const box = await target.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Review prescription" }).click();
  const review = page.getByRole("dialog", { name: "Review prescription" });
  for (const name of [
    "Close prescription review",
    "Zoom out",
    "Zoom in",
    "Fit width",
    "Complete prescription",
    "Return to editing",
  ]) {
    const box = await review.getByRole("button", { name }).boundingBox();
    expect(box, name).not.toBeNull();
    expect(box!.width, name).toBeGreaterThanOrEqual(44);
    expect(box!.height, name).toBeGreaterThanOrEqual(44);
  }
});

test("phone landscape review remains operable without page clipping", async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await openPrescription(page, "phone-landscape-review");
  await makeSeededConsultationValid(page);
  await page.getByRole("button", { name: "Review prescription" }).click();

  const review = page.getByRole("dialog", { name: "Review prescription" });
  const dialogBox = await review.boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(dialogBox!.x).toBe(0);
  expect(dialogBox!.y).toBe(0);
  expect(dialogBox!.width).toBe(844);
  expect(dialogBox!.height).toBe(390);

  const canvas = review.getByRole("region", {
    name: "Prescription preview canvas",
  });
  await canvas.scrollIntoViewIfNeeded();
  await review.getByRole("button", { name: "Zoom in" }).click();
  await expect(review.getByLabel("Review zoom")).toHaveText("125%");
  const canvasBounds = await canvas.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(canvasBounds.scrollWidth).toBeGreaterThan(canvasBounds.clientWidth);
});

test("completion failure keeps the reviewed draft and can retry", async ({
  page,
}) => {
  let failFirstCompletion = true;
  await page.route("**/api/consultation-drafts/**/complete", async (route) => {
    if (failFirstCompletion) {
      failFirstCompletion = false;
      const committed = await route.fetch();
      expect(committed.ok()).toBe(true);
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary demo backend outage" }),
      });
      return;
    }
    await route.continue();
  });
  await openPrescription(page, "unseeded-3");
  await makeSeededConsultationValid(page);
  await page.getByLabel("Patient name").fill("Demo Patient Retry");

  await page.getByRole("button", { name: "Review prescription" }).click();
  const review = page.getByRole("dialog", { name: "Review prescription" });
  await review.getByRole("button", { name: "Complete prescription" }).click();
  await expect(review.getByRole("alert")).toContainText(
    "Prescription could not be completed. Your draft is still here.",
  );
  await expect(review).toContainText("Demo Patient Retry");

  const retryCompletion = review.getByRole("button", {
    name: "Retry completion",
  });
  await expect(retryCompletion).toBeFocused();
  await retryCompletion.click();
  await expect(
    page.getByRole("status", { name: "Prescription completed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Completed prescription" }),
  ).toContainText("Demo Patient Retry");
});

test("completion API validates the saved revision and freezes rendered facts", async ({
  request,
}) => {
  const draftId = `e2e-api-complete-${Date.now()}`;
  const consultation = {
    ...sampleConsultation(),
    visitType: "new" as const,
    consultationDate: "2026-09-12",
    medicines: [
      {
        name: "Paracetamol 500 mg tablet",
        dose: "1–0–1",
        duration: "5 days",
        method: "After food",
      },
    ],
  };
  const saved = await request.put(`/api/consultation-drafts/${draftId}`, {
    data: { consultation, revision: 1 },
  });
  expect(saved.ok()).toBe(true);

  const stale = await request.post(
    `/api/consultation-drafts/${draftId}/complete`,
    { data: { revision: 2, expectedConsultation: consultation } },
  );
  expect(stale.status()).toBe(409);

  const [completed, concurrentCompletion] = await Promise.all([
    request.post(`/api/consultation-drafts/${draftId}/complete`, {
      data: { revision: 1, expectedConsultation: consultation },
    }),
    request.post(`/api/consultation-drafts/${draftId}/complete`, {
      data: { revision: 1, expectedConsultation: consultation },
    }),
  ]);
  expect(completed.ok()).toBe(true);
  expect(concurrentCompletion.ok()).toBe(true);
  const body = (await completed.json()) as {
    snapshot: {
      id: string;
      draftId: string;
      completedAt: string;
      documentVersion: string;
      layoutVersion: string;
      clinic: { name: string; address: string };
      doctor: { name: string; qualifications: string; registration: string };
      consultation: typeof consultation;
      medicines: Array<{ name: string; composition: string }>;
    };
  };
  expect((await concurrentCompletion.json()).snapshot).toEqual(body.snapshot);
  expect(body.snapshot).toMatchObject({
    draftId,
    documentVersion: "prescription-v1",
    layoutVersion: "a5-v1",
    clinic: {
      name: "VISHWAS CLINIC",
      address:
        "Shop No. 6, Amrapali Apartments, Right Bhusari Colony, Paud Road, Kothrud, Pune 411038",
    },
    doctor: {
      name: "Dr. Makarand Vishwas Apte",
      qualifications: "MBBS, MD (Anatomy)",
      registration: "Reg. No. 87352",
    },
    consultation: {
      ...consultation,
      patient: {
        ...consultation.patient,
        patientId: expect.any(String),
        patientNumber: expect.any(Number),
      },
    },
    medicines: [
      {
        name: "Paracetamol 500 mg tablet",
        composition: "Paracetamol IP 500 mg",
      },
    ],
  });
  expect(body.snapshot.id).toMatch(/^prescription-/);
  expect(Number.isNaN(Date.parse(body.snapshot.completedAt))).toBe(false);

  const repeated = await request.post(
    `/api/consultation-drafts/${draftId}/complete`,
    { data: { revision: 1, expectedConsultation: consultation } },
  );
  expect(repeated.ok()).toBe(true);
  expect((await repeated.json()).snapshot).toEqual(body.snapshot);

  const mismatchedRetry = await request.post(
    `/api/consultation-drafts/${draftId}/complete`,
    {
      data: {
        revision: 1,
        expectedConsultation: {
          ...consultation,
          patient: { ...consultation.patient, name: "Demo Patient Other Tab" },
        },
      },
    },
  );
  expect(mismatchedRetry.status()).toBe(409);

  const changed = await request.put(`/api/consultation-drafts/${draftId}`, {
    data: {
      consultation: {
        ...consultation,
        patient: { ...consultation.patient, name: "Demo Patient Changed" },
      },
      revision: 2,
    },
  });
  expect(changed.status()).toBe(409);

  const restored = await request.get(`/api/consultation-drafts/${draftId}`);
  const restoredBody = await restored.json();
  expect(restoredBody.draft.lifecycle).toBe("completed");
  expect(restoredBody.draft.completedSnapshot).toEqual(body.snapshot);
});

test("completion rejects competing content saved at the reviewed revision", async ({
  request,
}) => {
  const draftId = `e2e-api-competing-review-${Date.now()}`;
  const base = {
    ...sampleConsultation(),
    visitType: "new" as const,
    consultationDate: "2026-09-12",
    medicines: [],
  };
  const competingConsultation = {
    ...base,
    patient: { ...base.patient, name: "Demo Patient Other Tab" },
  };
  const reviewedConsultation = {
    ...base,
    patient: { ...base.patient, name: "Demo Patient Reviewed" },
  };

  const competingSave = await request.put(
    `/api/consultation-drafts/${draftId}`,
    { data: { consultation: competingConsultation, revision: 1 } },
  );
  expect(competingSave.ok()).toBe(true);
  const reviewedSave = await request.put(
    `/api/consultation-drafts/${draftId}`,
    { data: { consultation: reviewedConsultation, revision: 1 } },
  );
  expect(reviewedSave.ok()).toBe(true);
  expect((await reviewedSave.json()).accepted).toBe(false);

  const completion = await request.post(
    `/api/consultation-drafts/${draftId}/complete`,
    { data: { revision: 1, expectedConsultation: reviewedConsultation } },
  );
  expect(completion.status()).toBe(409);

  const restored = await request.get(`/api/consultation-drafts/${draftId}`);
  const body = await restored.json();
  expect(body.draft.lifecycle).toBe("editing");
  expect(body.draft.consultation.patient.name).toBe("Demo Patient Other Tab");
});

test("completion API rejects clinically invalid saved drafts", async ({
  request,
}) => {
  const invalidCases = [
    [
      "age",
      {
        patient: {
          ...sampleConsultation().patient,
          name: "Demo Patient Invalid",
          age: "2.5",
        },
      },
    ],
    ["date", { consultationDate: "2026-02-30" }],
  ] as const;

  for (const [label, change] of invalidCases) {
    const draftId = `e2e-api-invalid-${label}-${Date.now()}`;
    const consultation = {
      ...sampleConsultation(),
      visitType: "new" as const,
      consultationDate: "2026-09-12",
      medicines: [],
      ...change,
    };
    const response = await request.put(`/api/consultation-drafts/${draftId}`, {
      data: { consultation, revision: 1 },
    });
    expect(response.ok()).toBe(true);
    const completion = await request.post(
      `/api/consultation-drafts/${draftId}/complete`,
      { data: { revision: 1, expectedConsultation: consultation } },
    );
    expect(completion.status()).toBe(422);
  }
});

test("consultation values appear unchanged in the draft prescription", async ({
  page,
}) => {
  await openPrescription(page, "preview-values");

  const today = await page.evaluate(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
  });
  await expect(page.getByLabel("Consultation date")).toHaveValue(today);

  const seededMedicine = "Paracetamol 500 mg tablet";
  await expect(page.getByLabel(`${seededMedicine} dose`)).toHaveValue("");
  await expect(page.getByLabel(`${seededMedicine} duration`)).toHaveValue("");
  await expect(page.getByLabel(`${seededMedicine} method`)).toHaveValue("");
  await expect(page.locator(".preview-wrap .prescription-pages")).toContainText(
    "Dose not set · Method not set · Duration not set",
  );

  await page.getByLabel("Patient name").fill("Demo Patient Rivera");
  await page.getByLabel("Age").fill("47");
  await page.getByLabel("Gender").selectOption("Other");
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

  const preview = page.locator(".preview-wrap .prescription-pages");
  await expect(preview).toContainText("Demo Patient Rivera");
  await expect(preview).toContainText("47/Other");
  await expect(preview).toContainText("09/09/2026");
  await expect(preview).toContainText("Headache");
  await expect(preview).toContainText("Alert and oriented");
  await expect(preview).toContainText("Migraine");
  await expect(preview).toContainText("Rest as advised");
  await expect(preview).toContainText("Complete blood count");
  await expect(preview).toContainText("0–0–1 · With water · 7 days");
  await expect(
    page.getByText("Draft prescription", { exact: true }),
  ).toBeVisible();
});

test("a follow-up needs a saved patient and one of their earlier prescriptions", async ({
  page,
}) => {
  const { patient } = await patientWithEarlierPrescription(page);
  await openPrescription(page, "follow-up-link");

  const visitType = page.getByRole("radiogroup", {
    name: "Prescription type",
  });
  await expect(visitType.getByRole("radio")).toHaveCount(2);
  await visitType
    .getByRole("radio", { name: "Follow-up prescription" })
    .check();

  // The patient stays editable; clinical entry waits for the link.
  await expect(page.getByLabel("Patient name")).toBeEnabled();
  await expect(page.getByLabel("Weight")).toBeDisabled();
  await expect(page.getByRole("combobox", { name: /^Earlier prescription/ })).toBeDisabled();

  await page.getByLabel("Patient name").fill(patient.name);
  await page
    .getByRole("listbox", { name: "Matching patient records" })
    .getByRole("option", { name: new RegExp(patient.name) })
    .click();
  await page.getByRole("combobox", { name: /^Earlier prescription/ }).selectOption({ index: 1 });

  const linkedVisit = page.getByRole("region", { name: "Linked prior visit" });
  await expect(linkedVisit).toContainText(patient.name);
  await expect(linkedVisit).toContainText("18 August 2026");
  await expect(linkedVisit).toContainText("Dr. Makarand Vishwas Apte");
  await expect(linkedVisit).toContainText("Thyroid review");
  await expect(page.getByLabel("Weight")).toBeEnabled();
  await expect(
    page.locator(".preview-wrap .prescription-pages"),
  ).toContainText(`Patient no. ${patient.number}`);
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
]) {
  for (const visitType of ["new", "followup"] as const) {
    test(`${viewport.name} ${visitType} journey saves, resumes, completes, and downloads the reviewed consultation`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const earlier =
        visitType === "followup" ? await patientWithEarlierPrescription(page) : null;
      await openPrescription(page, `release-${viewport.name}-${visitType}`);
      const visitLabel = visitType === "new" ? "New prescription" : "Follow-up prescription";
      await page.getByRole("radio", { name: visitLabel }).check();
      const patientName = earlier?.patient.name ?? "Demo Patient Release Journey";
      if (earlier) {
        await page.getByLabel("Patient name").fill(patientName);
        await page
          .getByRole("listbox", { name: "Matching patient records" })
          .getByRole("option", { name: new RegExp(patientName) })
          .click();
        await page.getByRole("combobox", { name: /^Earlier prescription/ }).selectOption(earlier.visit.id);
        await expect(page.getByRole("region", { name: "Linked prior visit" })).toContainText("18 August 2026");
      }
      await page.getByLabel("Age", { exact: true }).fill("42");
      await page.getByLabel("Gender", { exact: true }).selectOption("Other");
      await page.getByLabel("Consultation date").fill("2026-09-11");
      await chooseCatalogItem(page, page.getByRole("combobox", { name: "Examination findings", exact: true }), "examination findings", "Alert and oriented");
      for (const medicine of ["Paracetamol 500 mg tablet", "Levocetirizine 5 mg tablet"]) {
        await page.getByLabel(`${medicine} dose`).selectOption("1–0–1");
        await page.getByLabel(`${medicine} duration`).selectOption("5 days");
        await page.getByLabel(`${medicine} method`).selectOption("After food");
      }
      if (!earlier) await page.getByLabel("Patient name").fill(patientName);
      await page.getByRole("button", { name: "Save draft" }).click();
      await expect(page.getByRole("status")).toContainText("Saved");
      await page.reload();
      await expect(page.getByLabel("Patient name")).toHaveValue(patientName);
      await expect(page.getByRole("radio", { name: visitLabel })).toBeChecked();
      await expect(page.getByLabel("Age", { exact: true })).toHaveValue("42");
      if (earlier) {
        await expect(page.getByRole("region", { name: "Linked prior visit" })).toContainText(patientName);
      }
      await page.getByRole("button", { name: "Review prescription" }).click();
      const review = page.getByRole("dialog", { name: "Review prescription" });
      await expect(review).toContainText("Ready to complete");
      const reviewedText = await review.getByRole("article", { name: "Prescription under review" }).allInnerTexts();
      expect(reviewedText.join(" ")).toContain("Alert and oriented");
      await review.getByRole("button", { name: "Complete prescription" }).click();
      await expect(page.getByRole("status", { name: "Prescription completed" })).toContainText(patientName);
      const completedPages = page.getByRole("article", { name: "Completed prescription" });
      expect(await textWithoutPatientNumber(completedPages)).toEqual(withoutPatientNumber(reviewedText));
      if (earlier) {
        await page.getByText("Prescription details", { exact: true }).click();
        const linkedVisit = page.getByRole("region", { name: "Linked prior visit" });
        await expect(linkedVisit).toContainText(patientName);
        await expect(linkedVisit).toContainText("18 August 2026");
        await expect(linkedVisit).toContainText("Dr. Makarand Vishwas Apte");
      }
      const downloadEvent = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download PDF" }).click();
      const download = await downloadEvent;
      const path = await download.path();
      expect(path).not.toBeNull();
      const pdf = await getDocument({ data: new Uint8Array(await readFile(path!)) }).promise;
      const extractedPages: string[] = [];
      for (let index = 1; index <= pdf.numPages; index += 1) {
        const content = await (await pdf.getPage(index)).getTextContent();
        extractedPages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
      }
      const extractedText = extractedPages.join(" ");
      for (const value of [patientName, "42/Other", "11/09/2026", "Alert and oriented", "After food", "5 days"]) {
        expect(extractedText).toContain(value);
      }
      await page.reload();
      await expect(page.getByRole("status", { name: "Prescription completed" })).toContainText(patientName);
      expect(await textWithoutPatientNumber(completedPages)).toEqual(withoutPatientNumber(reviewedText));
    });
  }
}

test("a prior visit link can be restored, replaced, removed, and cleared by New", async ({
  page,
}) => {
  const { patient, visit: first } = await patientWithEarlierPrescription(page);
  await openDraft(page, "manage-prior-link", {
    ...sampleConsultation(),
    consultationDate: "2026-09-12",
    patient: {
      ...sampleConsultation().patient,
      patientId: patient.id,
      patientNumber: patient.number,
      name: patient.name,
    },
  });
  // A second earlier prescription for the same patient to switch to.
  const secondDraft = `e2e-second-${Date.now()}`;
  const secondConsultation = {
    ...sampleConsultation(),
    visitType: "followup" as const,
    linkedPriorVisit: first,
    consultationDate: "2026-09-01",
    patient: {
      ...sampleConsultation().patient,
      patientId: patient.id,
      patientNumber: patient.number,
      name: patient.name,
    },
    provisionalDiagnosis: "Second visit marker",
    medicines: [
      { name: "Paracetamol 500 mg tablet", dose: "1–0–1", duration: "5 days", method: "After food" },
    ],
  };
  expect(
    (
      await page.request.put(`/api/consultation-drafts/${secondDraft}`, {
        data: { consultation: secondConsultation, revision: 1 },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post(`/api/consultation-drafts/${secondDraft}/complete`, {
        data: { revision: 1, expectedConsultation: secondConsultation },
      })
    ).ok(),
  ).toBe(true);
  await page.reload();

  const priorVisit = page.getByRole("combobox", { name: /^Earlier prescription/ });
  await page.getByRole("radio", { name: "Follow-up prescription" }).check();
  await priorVisit.selectOption(first.id);
  await expect(page.getByRole("status")).toContainText("Unsaved changes");
  await expect(page.getByRole("status")).toContainText("Saved", {
    timeout: 5_000,
  });

  await page.reload();
  await expect(
    page.getByRole("radio", { name: "Follow-up prescription" }),
  ).toBeChecked();
  const linkedVisit = page.getByRole("region", { name: "Linked prior visit" });
  await expect(linkedVisit).toContainText("Thyroid review");

  // Newest first.
  await expect(priorVisit.locator("option").nth(1)).toContainText("1 September 2026");
  await priorVisit.selectOption({ index: 1 });
  await expect(linkedVisit).toContainText("Second visit marker");
  await expect(linkedVisit).not.toContainText("Thyroid review");

  await page.getByRole("button", { name: "Remove prior visit link" }).click();
  await expect(linkedVisit).toHaveCount(0);
  await expect(priorVisit).toHaveValue("");
  await expect(priorVisit).toBeFocused();
  await expect(page.getByLabel("Weight")).toBeDisabled();

  await priorVisit.selectOption(first.id);
  await page.getByRole("radio", { name: "New prescription" }).check();
  await expect(linkedVisit).toHaveCount(0);
  await expect(page.getByLabel("Weight")).toBeEnabled();
  await expect(page.getByRole("status")).toContainText("Saved", {
    timeout: 5_000,
  });

  await page.reload();
  await expect(
    page.getByRole("radio", { name: "New prescription" }),
  ).toBeChecked();
  await page.getByRole("radio", { name: "Follow-up prescription" }).check();
  await expect(priorVisit).toHaveValue("");
  await expect(page.getByLabel("Weight")).toBeDisabled();
});

test("a prior visit loading failure keeps the follow-up safe and can retry", async ({
  page,
}) => {
  const { patient, visit } = await patientWithEarlierPrescription(page);
  let failFirstList = true;
  await page.route("**/api/prior-visits?**", async (route) => {
    if (failFirstList) {
      failFirstList = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporarily unavailable" }),
      });
      return;
    }
    await route.continue();
  });

  await openDraft(page, "prior-visit-retry", {
    ...sampleConsultation(),
    visitType: "followup",
    consultationDate: "2026-09-12",
    patient: {
      ...sampleConsultation().patient,
      patientId: patient.id,
      patientNumber: patient.number,
      name: patient.name,
    },
  });
  await expect(page.getByRole("alert")).toContainText(
    "Earlier prescriptions could not be loaded.",
  );
  await expect(page.getByLabel("Weight")).toBeDisabled();

  await page.getByRole("button", { name: "Try again" }).click();
  const priorVisit = page.getByRole("combobox", { name: /^Earlier prescription/ });
  await expect(priorVisit).toBeEnabled();
  await expect(priorVisit).toBeFocused();
  await priorVisit.selectOption(visit.id);
  await expect(
    page.getByRole("region", { name: "Linked prior visit" }),
  ).toContainText("Thyroid review");
  await expect(page.getByLabel("Weight")).toBeEnabled();
});

test("the draft API canonicalizes the patient's own earlier prescriptions and rejects others", async ({
  page,
}) => {
  const { patient, visit } = await patientWithEarlierPrescription(page);
  const { visit: someoneElses } = await patientWithEarlierPrescription(page);
  const draftId = `e2e-api-prior-${Date.now()}`;
  const alteredVisit = {
    ...visit,
    patient: { name: "Invented Person", age: "999", sex: "Other" as const },
    consultationDate: "1900-01-01",
    clinicalSummary: "Invented summary",
  };
  const consultation = {
    ...sampleConsultation(),
    visitType: "followup" as const,
    linkedPriorVisit: alteredVisit,
    patient: {
      ...sampleConsultation().patient,
      patientId: patient.id,
      patientNumber: patient.number,
      name: patient.name,
    },
  };

  const saved = await page.request.put(`/api/consultation-drafts/${draftId}`, {
    data: { consultation, revision: 1 },
  });
  expect(saved.ok()).toBe(true);
  const savedBody = (await saved.json()) as {
    draft: { consultation: typeof consultation };
  };
  expect(savedBody.draft.consultation.linkedPriorVisit).toEqual(visit);

  for (const [revision, linkedPriorVisit] of [
    [2, { ...alteredVisit, id: "invented-visit" }],
    [3, someoneElses],
  ] as const) {
    const rejected = await page.request.put(`/api/consultation-drafts/${draftId}`, {
      data: { consultation: { ...consultation, linkedPriorVisit }, revision },
    });
    expect(rejected.status()).toBe(400);
  }
});

test("changed consultation autosaves and recovers after refresh", async ({
  page,
}) => {
  await openPrescription(page, "unseeded-6");

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

  await openPrescription(page, "unseeded-7");
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

  await openPrescription(page, "unseeded-8");
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
  await page.route("**/api/consultation-drafts/**", async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({ status: 503, body: "Temporarily unavailable" });
      return;
    }
    await route.continue();
  });
  await openPrescription(page, "unseeded-9");
  await page.getByLabel("Patient name").fill("Demo Patient Aarya Shah");
  await expect(page.getByRole("status")).toContainText("Unsaved changes");
  await expect(page.getByRole("alert")).toContainText("changes are still here");

  const warning = page.waitForEvent("dialog").then(async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    expect(dialog.message()).toContain("unsaved changes");
    await dialog.dismiss();
  });
  await page
    .getByRole("link", { name: "Receipts", exact: true })
    .first()
    .click();
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
  // Nothing was ever saved, so the recovered consultation starts empty.
  await expect(page.getByLabel("Patient name")).toHaveValue("");
  await expect(page.getByLabel("Consultation date")).not.toHaveValue("");
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
  await expect(
    page.getByRole("button", {
      name: "Remove Dry cough from Major complaints",
    }),
  ).toBeFocused();
  await expect(picker).toHaveAccessibleDescription(
    "Selected: Low-grade fever, Dry cough",
  );
});

test("catalog picker separates choices from controls and closes when focus leaves", async ({
  page,
}) => {
  await openPrescription(page, "catalog-composite-structure");

  const picker = page.getByRole("combobox", {
    name: "Major complaints",
    exact: true,
  });
  await picker.click();

  const listbox = page.getByRole("listbox", {
    name: "Major complaints options",
  });
  await expect(listbox.getByRole("button")).toHaveCount(0);

  const feverCategory = page.getByRole("button", {
    name: "Fever",
    exact: true,
  });
  const respiratoryCategory = page.getByRole("button", {
    name: "Respiratory",
    exact: true,
  });
  await expect(feverCategory).toHaveAttribute("aria-expanded", "true");
  await expect(respiratoryCategory).toHaveAttribute("aria-expanded", "false");
  await respiratoryCategory.click();
  await expect(respiratoryCategory).toHaveAttribute("aria-expanded", "true");
  await expect(feverCategory).toHaveAttribute("aria-expanded", "false");

  await page.getByRole("combobox", { name: "Search Major complaints" }).fill(
    "Missing catalog term",
  );
  await expect(listbox.getByText("No matching catalog choices.")).toHaveCount(
    0,
  );
  await expect(
    listbox.getByRole("button", {
      name: "Add “Missing catalog term” as a clinic term",
    }),
  ).toHaveCount(0);

  await page.keyboard.press("Tab");
  while (!(await page.getByRole("combobox", { name: "Examination findings", exact: true }).evaluate(
    (element) => element === document.activeElement,
  ))) {
    await page.keyboard.press("Tab");
  }
  await expect(picker).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("combobox", { name: "Examination findings", exact: true }),
  ).toBeFocused();
});

test("multi-select picker keeps its panel open and reveals categories in place", async ({
  page,
}) => {
  await openPrescription(page, "catalog-multiselect-stays-open");

  const picker = page.getByRole("combobox", {
    name: "Major complaints",
    exact: true,
  });
  await picker.click();
  await expect(picker).toHaveAttribute("aria-expanded", "true");

  const respiratory = page.getByRole("button", {
    name: "Respiratory",
    exact: true,
  });
  await respiratory.click();
  await expect(picker).toHaveAttribute("aria-expanded", "true");
  await expect(respiratory).toHaveAttribute("aria-expanded", "true");

  const option = page.getByRole("option", {
    name: "Productive cough",
    exact: true,
  });
  const firstOption = page.getByRole("option", {
    name: "Dry cough",
    exact: true,
  });
  await expect(option).toBeVisible();
  await expect(firstOption).toBeVisible();
  const headerBox = await respiratory.boundingBox();
  const optionBox = await firstOption.boundingBox();
  expect(headerBox).not.toBeNull();
  expect(optionBox).not.toBeNull();
  expect(optionBox!.y).toBeGreaterThan(headerBox!.y);
  expect(optionBox!.y - (headerBox!.y + headerBox!.height)).toBeLessThan(20);

  await option.click();
  await expect(option).toHaveAttribute("aria-selected", "true");
  await expect(picker).toHaveAttribute("aria-expanded", "true");

  await page.mouse.click(2, 2);
  await expect(picker).toHaveAttribute("aria-expanded", "false");
});

test.describe("touch catalog picker", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });

  test("tapping a category expands it without dismissing the panel", async ({
    page,
  }) => {
    await openPrescription(page, "catalog-touch-stays-open");

    const picker = page.getByRole("combobox", {
      name: "Major complaints",
      exact: true,
    });
    await picker.tap();
    await expect(picker).toHaveAttribute("aria-expanded", "true");

    const respiratory = page.getByRole("button", {
      name: "Respiratory",
      exact: true,
    });
    await respiratory.tap();
    await expect(picker).toHaveAttribute("aria-expanded", "true");
    await expect(respiratory).toHaveAttribute("aria-expanded", "true");

    const option = page.getByRole("option", {
      name: "Productive cough",
      exact: true,
    });
    await option.tap();
    await expect(option).toHaveAttribute("aria-selected", "true");
    await expect(picker).toHaveAttribute("aria-expanded", "true");

    await page.touchscreen.tap(6, 6);
    await expect(picker).toHaveAttribute("aria-expanded", "false");
  });
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
  await expect(
    page.getByText("Loading clinic terms for Major complaints…"),
  ).toBeVisible();

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
  await expect(
    page.getByText("Loading clinic terms for Major complaints…"),
  ).toBeVisible();
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
  await expect(
    page.getByLabel("New category for Major complaints"),
  ).toBeVisible();

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
  await expect(search).toBeFocused();
  await expect(page.getByLabel("Patient name")).toHaveValue(
    "Demo Patient Retained",
  );
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "narrow", width: 390, height: 844 },
]) {
  test(`editing, picker, review, completion, and output failure pass accessibility scans at ${viewport.name} width`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      const createObjectUrl = URL.createObjectURL.bind(URL);
      let failNextDownload = true;
      URL.createObjectURL = (object) => {
        if (failNextDownload) {
          failNextDownload = false;
          throw new Error("Download unavailable");
        }
        return createObjectUrl(object);
      };
    });
    await openPrescription(page, `axe-${viewport.name}`);
    await expectNoAxeViolations(page);

    const complaints = page.getByRole("combobox", {
      name: "Major complaints",
      exact: true,
    });
    await complaints.click();
    await expectNoAxeViolations(page);
    await page
      .getByRole("combobox", { name: "Search Major complaints" })
      .fill("Demo unmatched accessibility term");
    await page
      .getByRole("button", {
        name: "Add “Demo unmatched accessibility term” as a clinic term",
      })
      .click();
    await expectNoAxeViolations(page);
    await page.keyboard.press("Escape");

    await page.getByRole("radio", { name: "New prescription" }).check();
    await page.getByLabel("Patient name").fill("");
    await page.getByRole("button", { name: "Review prescription" }).click();
    const review = page.getByRole("dialog", { name: "Review prescription" });
    await expectNoAxeViolations(page);

    await review.getByRole("button", { name: "Fix patient name" }).click();
    await page.getByLabel("Patient name").fill("Demo Patient Axe Scan");
    await makeSeededConsultationValid(page);
    await page.getByRole("button", { name: "Review prescription" }).click();
    await expect(review).toContainText("Ready to complete");
    await expectNoAxeViolations(page);

    await review
      .getByRole("button", { name: "Complete prescription" })
      .click();
    await expect(
      page.getByRole("status", { name: "Prescription completed" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: "Download PDF" }),
    ).toBeEnabled({ timeout: 15_000 });
    await expectNoAxeViolations(page);

    await page.getByRole("button", { name: "Download PDF" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "The PDF could not be downloaded. Try again.",
    );
    await expectNoAxeViolations(page);
  });
}
