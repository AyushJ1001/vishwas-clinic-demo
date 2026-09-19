import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

import {
  emptyConsultationPatient,
  type Consultation,
  type PatientRecord,
  type PriorVisitSnapshot,
} from "../../app/consultation-model";
import {
  openDraft,
  sampleConsultation,
  todayInIndia,
  uniqueSuffix,
} from "./fixtures";

test.describe.configure({ mode: "serial" });

async function importPatient(
  request: APIRequestContext,
  patient: { name: string; age: string; sex: "Female" | "Male" | "Other" },
) {
  const imported = await request.post("/api/patients/import", {
    data: {
      patients: [
        {
          number: "",
          dateOfBirth: "",
          phone: "",
          ...patient,
        },
      ],
    },
  });
  expect(imported.ok(), await imported.text()).toBe(true);
  const found = await request.get(
    `/api/patients?q=${encodeURIComponent(patient.name)}`,
  );
  return ((await found.json()) as { patients: PatientRecord[] }).patients[0];
}

function consultationPatient(patient: PatientRecord): Consultation["patient"] {
  return {
    ...emptyConsultationPatient(),
    patientId: patient.id,
    patientNumber: patient.number,
    name: patient.name,
    age: patient.age,
    sex: patient.sex,
    phone: patient.phone,
  };
}

function readyConsultation(
  patient: PatientRecord,
  date: string,
  doctorName: Consultation["doctorName"],
  visitType: Consultation["visitType"] = "new",
  linkedPriorVisit: PriorVisitSnapshot | null = null,
): Consultation {
  return {
    ...sampleConsultation(),
    visitType,
    linkedPriorVisit,
    doctorName,
    patient: consultationPatient(patient),
    consultationDate: date,
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

async function completePrescription(
  request: APIRequestContext,
  id: string,
  consultation: Consultation,
) {
  const saved = await request.put(`/api/consultation-drafts/${id}`, {
    data: { consultation, revision: 1 },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  const completed = await request.post(
    `/api/consultation-drafts/${id}/complete`,
    { data: { revision: 1, expectedConsultation: consultation } },
  );
  expect(completed.ok(), await completed.text()).toBe(true);
}

async function chooseDiagnosis(page: Page, diagnosis: string) {
  await page
    .getByRole("combobox", { name: "Provisional diagnosis", exact: true })
    .click();
  await page.getByPlaceholder("Search provisional diagnosis").fill(diagnosis);
  await page.getByRole("option", { name: diagnosis, exact: true }).click();
}

test("receipt numbers are sequential and retrying an id returns the same receipt", async ({
  request,
}) => {
  const suffix = uniqueSuffix();
  const patient = await importPatient(request, {
    name: `Receipt API ${suffix}`,
    age: "42",
    sex: "Male",
  });
  const issue = (id: string, amountRupees: number) =>
    request.post("/api/receipts", {
      data: {
        id,
        patient: {
          ...emptyConsultationPatient(),
          patientId: patient.id,
          patientNumber: patient.number,
          name: patient.name,
          age: patient.age,
          sex: patient.sex,
        },
        doctorName: "Dr. Makarand Vishwas Apte",
        issuedOn: "2031-04-12",
        title: "Mr.",
        amountPaise: amountRupees * 100,
      },
    });

  const firstResponse = await issue(`receipt-${suffix}-one`, 1250);
  expect(firstResponse.ok(), await firstResponse.text()).toBe(true);
  const first = (await firstResponse.json()) as {
    receipt: { id: string; receiptNumber: number; amountPaise: number };
  };
  const retryResponse = await issue(`receipt-${suffix}-one`, 9999);
  expect(retryResponse.ok(), await retryResponse.text()).toBe(true);
  expect(await retryResponse.json()).toEqual(first);

  const secondResponse = await issue(`receipt-${suffix}-two`, 600);
  expect(secondResponse.ok(), await secondResponse.text()).toBe(true);
  const second = (await secondResponse.json()) as typeof first;
  // Sequential for the whole clinic: other receipts may be issued meanwhile.
  expect(second.receipt.receiptNumber).toBeGreaterThan(first.receipt.receiptNumber);
  expect(second.receipt.amountPaise).toBe(60_000);
});

test("certificate issue retries return the first frozen certificate", async ({
  request,
}) => {
  const suffix = uniqueSuffix();
  const patient = await importPatient(request, {
    name: `Certificate retry ${suffix}`,
    age: "37",
    sex: "Female",
  });
  const id = `certificate-${suffix}`;
  const issue = (diagnosis: string) =>
    request.post("/api/medical-certificates", {
      data: {
        id,
        patient: consultationPatient(patient),
        doctorName: "Dr. Makarand Vishwas Apte",
        issuedOn: "2031-04-12",
        title: "Mrs.",
        diagnosis,
        treatmentSince: "2031-04-08",
        restDays: 4,
        fitToResume: true,
        resumeFrom: "2031-04-13",
      },
    });
  const firstResponse = await issue("Viral fever");
  expect(firstResponse.ok(), await firstResponse.text()).toBe(true);
  const first = await firstResponse.json();
  const retryResponse = await issue("Changed after issue");
  expect(retryResponse.ok(), await retryResponse.text()).toBe(true);
  expect(await retryResponse.json()).toEqual(first);
});

test("medical certificates use saved and new Patients with gender-correct wording and reopen unchanged", async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const savedName = `Certificate Mahesh ${suffix}`;
  const saved = await importPatient(request, {
    name: savedName,
    age: "48",
    sex: "Male",
  });
  // The register loads once the page is interactive; typing sooner is lost.
  const registerLoaded = page.waitForResponse((response) =>
    response.url().endsWith("/api/medical-certificates"),
  );
  await page.goto("/medical-certificate");
  await registerLoaded;
  const patientInput = page.getByRole("combobox", { name: "Patient" });
  await patientInput.fill(savedName);
  await page
    .getByRole("listbox", { name: "Matching patient records" })
    .getByRole("option", { name: new RegExp(savedName) })
    .click();
  await expect(page.getByText(`Patient no. ${saved.number}`, { exact: true })).toBeVisible();
  await chooseDiagnosis(page, "Viral upper respiratory tract infection");
  await page.getByLabel("Rest advised (days)").fill("3");
  await page.getByRole("button", { name: "Issue certificate" }).click();
  const issued = page.getByRole("article", { name: "Issued medical certificate" });
  await expect(page.getByRole("status", { name: "Certificate issued" })).toBeVisible();
  await expect(issued).toContainText(`Mr. ${savedName}`);
  await expect(issued).toContainText("He was suffering");
  await expect(issued).toContainText("found him fit to resume his duties");

  await page.getByRole("button", { name: "New certificate" }).click();
  await page.getByRole("button", { name: `Open medical certificate for ${savedName}` }).click();
  await expect(issued).toContainText("Viral upper respiratory tract infection");

  for (const entry of [
    {
      name: `Certificate Nisha ${suffix}`,
      sex: "Female",
      title: "Mrs.",
      wording: "She was suffering",
      fit: "found her fit to resume her duties",
    },
    {
      name: `Certificate Sam ${suffix}`,
      sex: "Other",
      title: "",
      wording: "They were suffering",
      fit: "found them fit to resume their duties",
    },
  ] as const) {
    await page.getByRole("button", { name: "New certificate" }).click();
    await page.getByRole("combobox", { name: "Patient" }).fill(entry.name);
    await page.keyboard.press("Escape");
    await page.getByLabel("Age").fill("29");
    await page.getByLabel("Gender").selectOption(entry.sex);
    await chooseDiagnosis(page, "Viral upper respiratory tract infection");
    await page.getByLabel("Rest advised (days)").fill("2");
    await page.getByRole("button", { name: "Issue certificate" }).click();
    await expect(page.getByRole("status", { name: "Certificate issued" })).toBeVisible();
    await expect(issued).toContainText(
      entry.title ? `${entry.title} ${entry.name}` : entry.name,
    );
    await expect(issued).toContainText(entry.wording);
    await expect(issued).toContainText(entry.fit);
    await expect(issued).not.toContainText("Patient no. Pending");
  }
  const registered = await request.get(
    `/api/patients?q=${encodeURIComponent(`Certificate Sam ${suffix}`)}`,
  );
  const [newPatient] = ((await registered.json()) as {
    patients: PatientRecord[];
  }).patients;
  expect(newPatient.number).toBeGreaterThan(0);
});

test("a completed prescription prefills its medical certificate", async ({ page }) => {
  const consultation: Consultation = {
    ...sampleConsultation(),
    visitType: "new",
    consultationDate: todayInIndia(),
    patient: {
      ...emptyConsultationPatient(),
      name: `Prefill Aarya ${uniqueSuffix()}`,
      age: "32",
      sex: "Female",
    },
    medicines: [
      {
        name: "Paracetamol 500 mg tablet",
        dose: "1–0–1",
        duration: "5 days",
        method: "After food",
      },
    ],
  };
  await openDraft(page, "certificate-prefill", consultation);
  await page.getByRole("button", { name: "Review prescription" }).click();
  await page
    .getByRole("dialog", { name: "Review prescription" })
    .getByRole("button", { name: "Complete prescription" })
    .click();
  await page.getByRole("button", { name: "Medical certificate" }).click();
  await expect(page).toHaveURL(/\/medical-certificate\?patient=/);
  await expect(page.getByRole("combobox", { name: "Patient" })).toHaveValue(
    consultation.patient.name,
  );
  await expect(
    page.getByRole("combobox", { name: "Provisional diagnosis", exact: true }),
  ).toContainText(consultation.provisionalDiagnosis);
  await expect(page.getByLabel("Under treatment since")).toHaveValue(
    consultation.consultationDate,
  );
});

test("monthly summaries are calculated from records and download the same table", async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const monthBucket = [...suffix].reduce(
    (hash, character) => (hash * 33 + character.charCodeAt(0)) % 72_000,
    0,
  );
  const summaryYear = 3000 + Math.floor(monthBucket / 12);
  const summaryMonth = `${summaryYear}-${String((monthBucket % 12) + 1).padStart(2, "0")}`;
  const summaryDate = (day: string) => `${summaryMonth}-${day}`;
  const firstPatient = await importPatient(request, {
    name: `Summary first ${suffix}`,
    age: "31",
    sex: "Female",
  });
  const secondPatient = await importPatient(request, {
    name: `Summary second ${suffix}`,
    age: "52",
    sex: "Male",
  });
  const first = readyConsultation(
    firstPatient,
    summaryDate("05"),
    "Dr. Makarand Vishwas Apte",
  );
  const second = readyConsultation(
    secondPatient,
    summaryDate("06"),
    "Dr. Gauri Makarand Apte",
  );
  await completePrescription(request, `summary-${suffix}-first`, first);
  await completePrescription(request, `summary-${suffix}-second`, second);
  const visitsResponse = await request.get(
    `/api/prior-visits?patientId=${encodeURIComponent(secondPatient.id)}`,
  );
  const [priorVisit] = ((await visitsResponse.json()) as {
    visits: PriorVisitSnapshot[];
  }).visits;
  const followUp = readyConsultation(
    secondPatient,
    summaryDate("10"),
    "Dr. Gauri Makarand Apte",
    "followup",
    priorVisit,
  );
  await completePrescription(request, `summary-${suffix}-followup`, followUp);

  for (const [id, patient, doctorName, amountPaise] of [
    [`summary-${suffix}-receipt-one`, firstPatient, "Dr. Makarand Vishwas Apte", 125_000],
    [`summary-${suffix}-receipt-two`, secondPatient, "Dr. Gauri Makarand Apte", 60_000],
  ] as const) {
    const response = await request.post("/api/receipts", {
      data: {
        id,
        patient: consultationPatient(patient),
        doctorName,
        issuedOn: summaryDate("12"),
        title: patient.sex === "Male" ? "Mr." : "Mrs.",
        amountPaise,
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
  }
  const certificate = await request.post("/api/medical-certificates", {
    data: {
      id: `summary-${suffix}-certificate`,
      patient: consultationPatient(secondPatient),
      doctorName: "Dr. Gauri Makarand Apte",
      issuedOn: summaryDate("12"),
      title: "Mr.",
      diagnosis: "Viral fever",
      treatmentSince: summaryDate("08"),
      restDays: 4,
      fitToResume: true,
      resumeFrom: summaryDate("13"),
    },
  });
  expect(certificate.ok(), await certificate.text()).toBe(true);

  const response = await request.get(`/api/summaries?month=${summaryMonth}`);
  expect(response.ok(), await response.text()).toBe(true);
  const { summary } = (await response.json()) as {
    summary: {
      doctors: Record<string, Record<string, number>>;
      total: Record<string, number>;
    };
  };
  expect(summary.doctors["Dr. Makarand Vishwas Apte"]).toMatchObject({
    patientsSeen: 1,
    prescriptionsNew: 1,
    prescriptionsFollowUp: 0,
    prescriptionsTotal: 1,
    receiptsIssued: 1,
    amountReceivedPaise: 125_000,
  });
  expect(summary.doctors["Dr. Gauri Makarand Apte"]).toMatchObject({
    patientsSeen: 1,
    prescriptionsNew: 1,
    prescriptionsFollowUp: 1,
    prescriptionsTotal: 2,
    receiptsIssued: 1,
    amountReceivedPaise: 60_000,
    medicalCertificatesIssued: 1,
  });
  expect(summary.total).toMatchObject({
    patientsSeen: 2,
    newPatients: 0,
    prescriptionsNew: 2,
    prescriptionsFollowUp: 1,
    prescriptionsTotal: 3,
    receiptsIssued: 2,
    amountReceivedPaise: 185_000,
    medicalCertificatesIssued: 1,
  });

  // The first summary loads once the page is interactive; typing sooner is lost.
  const firstSummary = page.waitForResponse((response) =>
    response.url().includes("/api/summaries?month="),
  );
  await page.goto("/summaries");
  await firstSummary;
  await page.getByLabel("Month", { exact: true }).fill(summaryMonth);
  await expect(page.getByRole("button", { name: "Download CSV" })).toBeEnabled();
  await expect(page.getByRole("row", { name: /Amount received/ })).toContainText(
    "₹1,850",
  );
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const download = await downloadEvent;
  const path = await download.path();
  expect(path).not.toBeNull();
  const csv = await readFile(path!, "utf8");
  expect(csv).toContain(
    "Measure,Dr. Makarand Vishwas Apte,Dr. Gauri Makarand Apte,Total",
  );
  expect(csv).toContain("Prescriptions: follow-up,0,1,1");
  expect(csv).toContain('Amount received,"₹1,250",₹600,"₹1,850"');
});

test("receipt and medical certificate pages pass WCAG 2.1 AA scans", async ({
  page,
}) => {
  for (const path of ["/receipts", "/medical-certificate"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  }
});
