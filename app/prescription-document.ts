import type {
  CompletedMedicineSnapshot,
  CompletedPrescriptionSnapshot,
  Consultation,
  DoctorIdentitySnapshot,
  ClinicIdentitySnapshot,
} from "./consultation-model";
import { formatConsultationDate } from "./consultation-model";

export const prescriptionFooter = [
  "No substitutes · Bring the prescription at the next visit",
  "Prescription is valid for the given person and duration only",
] as const;

export const emptyPrescriptionValue = "—";
export const emptyPrescriptionList = "None entered";

export function formatPrescriptionVitals(vitals: Consultation["vitals"]) {
  return [
    `Weight ${vitals.weight || emptyPrescriptionValue} kg`,
    `Temperature ${vitals.temperature || emptyPrescriptionValue} °F`,
    `Pulse ${vitals.pulse || emptyPrescriptionValue} /min`,
    `BP ${vitals.systolic || emptyPrescriptionValue}/${vitals.diastolic || emptyPrescriptionValue} mmHg`,
    `SpO₂ ${vitals.spo2 || emptyPrescriptionValue}%`,
  ] as const;
}

export function formatMedicineDirections(
  medicine: Pick<CompletedMedicineSnapshot, "dose" | "method" | "duration">,
) {
  return `${medicine.dose || "Dose not set"} · ${medicine.method || "Method not set"} · ${medicine.duration || "Duration not set"}`;
}

export type PrescriptionDocumentPage = {
  number: number;
  count: number;
  clinic: ClinicIdentitySnapshot;
  doctor: DoctorIdentitySnapshot;
  patient: Consultation["patient"];
  consultationDate: string;
  vitals: Consultation["vitals"];
  complaints: readonly string[];
  examinationFindings: readonly string[];
  provisionalDiagnosis: string;
  advice: readonly string[];
  investigations: readonly string[];
  medicines: readonly CompletedMedicineSnapshot[];
  footer: typeof prescriptionFooter;
};

export type CompletedPrescriptionDocument = {
  snapshotId: string;
  draftId: string;
  fileName: string;
  documentVersion: CompletedPrescriptionSnapshot["documentVersion"];
  layout: {
    version: CompletedPrescriptionSnapshot["layoutVersion"];
    pageSize: "A5";
    orientation: "portrait";
  };
  pages: readonly [PrescriptionDocumentPage];
};

function prescriptionFileName(snapshot: CompletedPrescriptionSnapshot) {
  const patient = snapshot.consultation.patient.name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `vishwas-prescription-${patient || snapshot.id}.pdf`;
}

function freezePage(page: PrescriptionDocumentPage) {
  Object.freeze(page.clinic);
  Object.freeze(page.doctor);
  Object.freeze(page.patient);
  Object.freeze(page.vitals);
  Object.freeze(page.complaints);
  Object.freeze(page.examinationFindings);
  Object.freeze(page.advice);
  Object.freeze(page.investigations);
  page.medicines.forEach(Object.freeze);
  Object.freeze(page.medicines);
  Object.freeze(page.footer);
  return Object.freeze(page);
}

export function createCompletedPrescriptionDocument(
  snapshot: CompletedPrescriptionSnapshot,
): CompletedPrescriptionDocument {
  const consultation = structuredClone(snapshot.consultation);
  const page = freezePage({
    number: 1,
    count: 1,
    clinic: { ...snapshot.clinic },
    doctor: { ...snapshot.doctor },
    patient: { ...consultation.patient },
    consultationDate: formatConsultationDate(consultation.consultationDate),
    vitals: { ...consultation.vitals },
    complaints: [...consultation.complaints],
    examinationFindings: [...consultation.examinationFindings],
    provisionalDiagnosis: consultation.provisionalDiagnosis,
    advice: [...consultation.advice],
    investigations: [...consultation.investigations],
    medicines: snapshot.medicines.map((medicine) => ({ ...medicine })),
    footer: prescriptionFooter,
  });
  const document = {
    snapshotId: snapshot.id,
    draftId: snapshot.draftId,
    fileName: prescriptionFileName(snapshot),
    documentVersion: snapshot.documentVersion,
    layout: Object.freeze({
      version: snapshot.layoutVersion,
      pageSize: "A5" as const,
      orientation: "portrait" as const,
    }),
    pages: Object.freeze([page]) as readonly [PrescriptionDocumentPage],
  };
  return Object.freeze(document);
}
