export type ClinicDoctorName =
  | "Dr. Makarand Vishwas Apte"
  | "Dr. Gauri Makarand Apte";

export type PatientSex = "Female" | "Male" | "Other";

export type PatientDemographics = {
  name: string;
  age: string;
  sex: PatientSex;
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
  patient: PatientDemographics;
  consultationDate: string;
  doctorName: ClinicDoctorName;
  clinicalSummary: string;
};

export type Consultation = {
  visitType: "new" | "followup" | null;
  linkedPriorVisit: PriorVisitSnapshot | null;
  doctorName: ClinicDoctorName;
  patient: PatientDemographics;
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

export function createDemoConsultation(): Consultation {
  return {
    visitType: null,
    linkedPriorVisit: null,
    doctorName: "Dr. Makarand Vishwas Apte",
    patient: {
      name: "Demo Patient Ananya Deshmukh",
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
      {
        name: "Paracetamol 500 mg tablet",
        dose: "",
        duration: "",
        method: "",
      },
      {
        name: "Levocetirizine 5 mg tablet",
        dose: "",
        duration: "",
        method: "",
      },
    ],
  };
}

export function createEmptyConsultation(
  doctorName: ClinicDoctorName,
  consultationDate: string,
): Consultation {
  return {
    visitType: null,
    linkedPriorVisit: null,
    doctorName,
    patient: { name: "", age: "", sex: "Female" },
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
