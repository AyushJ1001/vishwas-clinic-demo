export type ClinicDoctorName =
  | "Dr. Makarand Vishwas Apte"
  | "Dr. Gauri Makarand Apte";

export type PatientSex = "Female" | "Male" | "Other";

export type PatientDemographics = {
  name: string;
  age: string;
  sex: PatientSex;
};

// The patient on a consultation. `patientId` links a saved Patient; it is
// blank for someone seen for the first time, who is registered (and given a
// Patient number) when their first prescription is completed.
export type ConsultationPatient = PatientDemographics & {
  patientId: string;
  patientNumber: number | null;
  dateOfBirth: string;
  phone: string;
};

export type ConsultationVitals = {
  weight: string;
  temperature: string;
  pulse: string;
  systolic: string;
  diastolic: string;
  spo2: string;
};

export type PrescribedMedicine = {
  name: string;
  dose: string;
  duration: string;
  method: string;
};

export type PriorVisitSnapshot = {
  id: string;
  patientId: string;
  patient: PatientDemographics;
  consultationDate: string;
  doctorName: ClinicDoctorName;
  clinicalSummary: string;
};

export type PatientRecord = {
  id: string;
  // Null only for a Phone-issued patient the Clinic PC has not numbered yet.
  number: number | null;
  name: string;
  // YYYY-MM-DD, or "" when only an approximate age is known.
  dateOfBirth: string;
  dateOfBirthEstimated: boolean;
  age: string;
  sex: PatientSex;
  phone: string;
};

export type Consultation = {
  visitType: "new" | "followup" | null;
  linkedPriorVisit: PriorVisitSnapshot | null;
  doctorName: ClinicDoctorName;
  patient: ConsultationPatient;
  consultationDate: string;
  vitals: ConsultationVitals;
  complaints: string[];
  examinationFindings: string[];
  provisionalDiagnosis: string;
  advice: string[];
  investigations: string[];
  medicines: PrescribedMedicine[];
};

export type SavedConsultationDraft = {
  id: string;
  revision: number;
  consultation: Consultation;
  lifecycle: "editing" | "completed";
  completedSnapshot: CompletedPrescriptionSnapshot | null;
  createdAt: string;
  updatedAt: string;
};

export type ClinicIdentitySnapshot = {
  name: string;
  address: string;
  hours: string;
  services: string;
};

export type DoctorIdentitySnapshot = {
  name: ClinicDoctorName;
  qualifications: string;
  registration: string;
  mobile: string;
  specialty: string;
};

export type CompletedMedicineSnapshot = PrescribedMedicine & {
  composition: string;
};

export type CompletedPrescriptionSnapshot = {
  id: string;
  draftId: string;
  sourceRevision: number;
  completedAt: string;
  documentVersion: "prescription-v1";
  layoutVersion: "a5-v1";
  clinic: ClinicIdentitySnapshot;
  doctor: DoctorIdentitySnapshot;
  consultation: Consultation;
  medicines: CompletedMedicineSnapshot[];
};

export type CompleteConsultationDraftResult = {
  snapshot: CompletedPrescriptionSnapshot;
};

export type SaveConsultationDraftResult = {
  accepted: boolean;
  draft: SavedConsultationDraft;
};

export type ListPriorVisitsResult = {
  visits: PriorVisitSnapshot[];
};

export type SearchPatientsResult = {
  patients: PatientRecord[];
};

export type PatientImportSummary = {
  requested: number;
  imported: number;
  updated: number;
  skipped: number;
  problems: string[];
};

export function createEmptyConsultation(
  doctorName: ClinicDoctorName,
  consultationDate: string,
): Consultation {
  return {
    visitType: null,
    linkedPriorVisit: null,
    doctorName,
    patient: emptyConsultationPatient(),
    consultationDate,
    vitals: {
      weight: "",
      temperature: "",
      pulse: "",
      systolic: "",
      diastolic: "",
      spo2: "",
    },
    complaints: [],
    examinationFindings: [],
    provisionalDiagnosis: "",
    advice: [],
    investigations: [],
    medicines: [],
  };
}

export function emptyConsultationPatient(): ConsultationPatient {
  return {
    patientId: "",
    patientNumber: null,
    name: "",
    age: "",
    dateOfBirth: "",
    sex: "Female",
    phone: "",
  };
}

function missingFields<T extends object>(value: Partial<T>, defaults: T) {
  return Object.fromEntries(
    Object.entries(defaults).filter(([key]) => !(key in value)),
  ) as Partial<T>;
}

/** Fills fields added after a draft or snapshot was first saved. */
export function withCurrentPatientFields(consultation: Consultation): Consultation {
  const priorVisit = consultation.linkedPriorVisit;
  return {
    ...consultation,
    // Existing fields keep their order; missing ones are appended.
    patient: { ...consultation.patient, ...missingFields(consultation.patient, emptyConsultationPatient()) },
    linkedPriorVisit: priorVisit
      ? { ...priorVisit, patientId: priorVisit.patientId ?? "" }
      : null,
  };
}

/** Whole years between a YYYY-MM-DD birth date and another date. */
export function ageOn(dateOfBirth: string, onDate: string) {
  const birth = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  const on = /^(\d{4})-(\d{2})-(\d{2})$/.exec(onDate);
  if (!birth || !on) return "";
  const [, by, bm, bd] = birth.map(Number);
  const [, oy, om, od] = on.map(Number);
  const years = oy - by - (om < bm || (om === bm && od < bd) ? 1 : 0);
  return years >= 0 ? String(years) : "";
}

/**
 * A birth date that makes someone `age` on `onDate`, for patients whose
 * exact date of birth is unknown; kept marked as estimated.
 */
export function estimatedDateOfBirth(age: string, onDate: string) {
  const on = /^(\d{4})-(\d{2})-(\d{2})$/.exec(onDate);
  if (!/^\d+$/.test(age) || !on) return "";
  return `${String(Number(on[1]) - Number(age)).padStart(4, "0")}-${on[2]}-${on[3]}`;
}

export function toLocalDateInputValue(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function formatConsultationDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : "—";
}

export function formatPriorVisitDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "Date unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
