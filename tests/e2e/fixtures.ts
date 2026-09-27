import { expect, type Page } from "@playwright/test";
import {
  emptyConsultationPatient,
  type Consultation,
  type PatientRecord,
  type PriorVisitSnapshot,
} from "../../app/consultation-model";

export const draftIdStorageKey = "vishwas-clinic-demo-draft-id";

// Shared records outlive a single test, so names and ids carry a suffix no
// other test (or earlier run) can match.
export function uniqueSuffix() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** A fictional consultation, nearly ready to complete, for the tests to edit. */
export function sampleConsultation(): Consultation {
  return {
    visitType: null,
    linkedPriorVisit: null,
    doctorName: "Dr. Makarand Vishwas Apte",
    patient: {
      ...emptyConsultationPatient(),
      name: "Test Patient Ananya Deshmukh",
      age: "32",
      sex: "Female",
    },
    consultationDate: "",
    vitals: {
      weight: "62",
      temperature: "100.2",
      pulse: "88",
      systolic: "118",
      diastolic: "76",
      spo2: "98",
    },
    complaints: ["Low-grade fever", "Dry cough"],
    examinationFindings: ["Throat congestion"],
    provisionalDiagnosis: "Viral upper respiratory tract infection",
    advice: ["Warm saline gargles", "Maintain hydration"],
    investigations: [],
    medicines: [
      { name: "Paracetamol 500 mg tablet", dose: "", duration: "", method: "" },
      { name: "Levocetirizine 5 mg tablet", dose: "", duration: "", method: "" },
    ],
  };
}

export function todayInIndia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(),
  );
}

/** Saves `consultation` as this page's draft and opens the prescription form. */
export async function openDraft(
  page: Page,
  testName: string,
  consultation: Consultation = {
    ...sampleConsultation(),
    consultationDate: todayInIndia(),
  },
) {
  const draftId = `e2e-${testName}-${uniqueSuffix()}`.slice(0, 120);
  const saved = await page.request.put(`/api/consultation-drafts/${draftId}`, {
    data: { consultation, revision: 1 },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  // Point this browser at the draft once, from a same-origin page; reloads
  // then reopen whatever draft the app itself has moved on to.
  await page.goto("/api/prior-visits");
  await page.evaluate(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: draftIdStorageKey, value: draftId },
  );
  const catalogReady = page.waitForResponse((response) =>
    response.url().includes("/api/catalog?catalog=symptoms"),
  );
  await page.goto("/");
  await catalogReady;
  await expect(page.getByRole("status")).toContainText("Saved", {
    timeout: 15_000,
  });
  return draftId;
}

/**
 * A saved patient with one completed prescription, made through the API,
 * for follow-up tests to link to.
 */
export async function patientWithEarlierPrescription(
  page: Page,
  name = `Followup Kavya ${uniqueSuffix()}`,
) {
  const imported = await page.request.post("/api/patients/import", {
    data: {
      patients: [
        { number: "", name, age: "44", dateOfBirth: "", sex: "Female", phone: "" },
      ],
    },
  });
  expect(imported.ok(), await imported.text()).toBe(true);
  const found = await page.request.get(`/api/patients?q=${encodeURIComponent(name)}`);
  const [patient] = ((await found.json()) as { patients: PatientRecord[] }).patients;
  const consultation: Consultation = {
    ...sampleConsultation(),
    visitType: "new",
    consultationDate: "2026-08-18",
    patient: {
      ...emptyConsultationPatient(),
      patientId: patient.id,
      patientNumber: patient.number,
      name,
      age: "44",
      sex: "Female",
    },
    provisionalDiagnosis: "Thyroid review",
    medicines: [
      {
        name: "Paracetamol 500 mg tablet",
        dose: "1–0–1",
        duration: "5 days",
        method: "After food",
      },
    ],
  };
  const draftId = `e2e-earlier-${uniqueSuffix()}`;
  const saved = await page.request.put(`/api/consultation-drafts/${draftId}`, {
    data: { consultation, revision: 1 },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  const completed = await page.request.post(
    `/api/consultation-drafts/${draftId}/complete`,
    { data: { revision: 1, expectedConsultation: consultation } },
  );
  expect(completed.ok(), await completed.text()).toBe(true);
  const visits = await page.request.get(
    `/api/prior-visits?patientId=${encodeURIComponent(patient.id)}`,
  );
  const [visit] = ((await visits.json()) as { visits: PriorVisitSnapshot[] }).visits;
  return { patient, visit };
}
