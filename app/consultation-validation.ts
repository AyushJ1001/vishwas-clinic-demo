import type { Consultation, PriorVisitSnapshot } from "./consultation-model";

export type ConsultationProblem = {
  key: string;
  fieldId: string;
  fieldLabel: string;
  message: string;
};

const patientSexes = new Set(["Female", "Male", "Other"]);
const doctorNames = new Set([
  "Dr. Makarand Vishwas Apte",
  "Dr. Gauri Makarand Apte",
]);

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isPriorVisitShape(value: unknown): value is PriorVisitSnapshot {
  if (!value || typeof value !== "object") return false;
  const visit = value as Partial<PriorVisitSnapshot>;
  return Boolean(
    typeof visit.id === "string" &&
      typeof visit.patientId === "string" &&
      visit.patient &&
      typeof visit.patient.name === "string" &&
      typeof visit.patient.age === "string" &&
      patientSexes.has(visit.patient.sex ?? "") &&
      typeof visit.consultationDate === "string" &&
      visit.doctorName &&
      doctorNames.has(visit.doctorName) &&
      typeof visit.clinicalSummary === "string",
  );
}

export function isConsultationShape(value: unknown): value is Consultation {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<Consultation>;
  return Boolean(
    (draft.visitType === null ||
      draft.visitType === "new" ||
      draft.visitType === "followup") &&
      (draft.linkedPriorVisit === null ||
        isPriorVisitShape(draft.linkedPriorVisit)) &&
      draft.doctorName &&
      doctorNames.has(draft.doctorName) &&
      draft.patient &&
      typeof draft.patient.name === "string" &&
      typeof draft.patient.age === "string" &&
      patientSexes.has(draft.patient.sex ?? "") &&
      typeof draft.patient.patientId === "string" &&
      (draft.patient.patientNumber === null ||
        Number.isSafeInteger(draft.patient.patientNumber)) &&
      typeof draft.patient.dateOfBirth === "string" &&
      typeof draft.patient.phone === "string" &&
      typeof draft.consultationDate === "string" &&
      draft.vitals &&
      [
        draft.vitals.weight,
        draft.vitals.temperature,
        draft.vitals.pulse,
        draft.vitals.systolic,
        draft.vitals.diastolic,
        draft.vitals.spo2,
      ].every((item) => typeof item === "string") &&
      isStringArray(draft.complaints) &&
      isStringArray(draft.examinationFindings) &&
      typeof draft.provisionalDiagnosis === "string" &&
      isStringArray(draft.advice) &&
      isStringArray(draft.investigations) &&
      Array.isArray(draft.medicines) &&
      draft.medicines.every(
        (medicine) =>
          medicine &&
          typeof medicine.name === "string" &&
          typeof medicine.dose === "string" &&
          typeof medicine.duration === "string" &&
          typeof medicine.method === "string",
      ),
  );
}

export function consultationFingerprint(consultation: Consultation) {
  const priorVisit = consultation.linkedPriorVisit;
  return JSON.stringify({
    visitType: consultation.visitType,
    linkedPriorVisit: priorVisit
      ? {
          id: priorVisit.id,
          patientId: priorVisit.patientId,
          patient: {
            name: priorVisit.patient.name,
            age: priorVisit.patient.age,
            sex: priorVisit.patient.sex,
          },
          consultationDate: priorVisit.consultationDate,
          doctorName: priorVisit.doctorName,
          clinicalSummary: priorVisit.clinicalSummary,
        }
      : null,
    doctorName: consultation.doctorName,
    // Which saved patient this is (and their number) is settled when the
    // prescription is completed, so it is not part of what was reviewed.
    patient: {
      name: consultation.patient.name,
      age: consultation.patient.age,
      dateOfBirth: consultation.patient.dateOfBirth,
      sex: consultation.patient.sex,
      phone: consultation.patient.phone,
    },
    consultationDate: consultation.consultationDate,
    vitals: {
      weight: consultation.vitals.weight,
      temperature: consultation.vitals.temperature,
      pulse: consultation.vitals.pulse,
      systolic: consultation.vitals.systolic,
      diastolic: consultation.vitals.diastolic,
      spo2: consultation.vitals.spo2,
    },
    complaints: consultation.complaints,
    examinationFindings: consultation.examinationFindings,
    provisionalDiagnosis: consultation.provisionalDiagnosis,
    advice: consultation.advice,
    investigations: consultation.investigations,
    medicines: consultation.medicines.map((medicine) => ({
      name: medicine.name,
      dose: medicine.dose,
      duration: medicine.duration,
      method: medicine.method,
    })),
  });
}

function isRealDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 1) return false;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function hasText(items: string[]) {
  return items.some((item) => item.trim().length > 0);
}

function isNonnegativeNumber(value: string) {
  return /^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value));
}

function isNonnegativeWholeNumber(value: string) {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value));
}

export function validateConsultation(
  consultation: Consultation,
): ConsultationProblem[] {
  const problems: ConsultationProblem[] = [];
  const add = (
    key: string,
    fieldId: string,
    fieldLabel: string,
    message: string,
  ) => problems.push({ key, fieldId, fieldLabel, message });

  if (!consultation.visitType) {
    add(
      "visit-type",
      "prescription-type-new",
      "prescription type",
      "Choose a prescription type.",
    );
  } else if (
    consultation.visitType === "followup" &&
    !consultation.linkedPriorVisit
  ) {
    add(
      "prior-visit",
      "prior-visit",
      "earlier prescription",
      "Choose the earlier prescription this follow-up continues.",
    );
  } else if (
    consultation.visitType === "new" &&
    consultation.linkedPriorVisit
  ) {
    add(
      "prior-visit-new",
      "prescription-type-new",
      "prescription type",
      "A new prescription cannot keep a prior visit link.",
    );
  }

  if (!consultation.patient.name.trim()) {
    add("patient-name", "patient-name", "patient name", "Enter the patient's name.");
  }
  if (!isNonnegativeWholeNumber(consultation.patient.age)) {
    add(
      "patient-age",
      "patient-age",
      "age",
      "Age must be a nonnegative whole number.",
    );
  }
  if (
    consultation.patient.dateOfBirth &&
    (!isRealDate(consultation.patient.dateOfBirth) ||
      (isRealDate(consultation.consultationDate) &&
        consultation.patient.dateOfBirth > consultation.consultationDate))
  ) {
    add(
      "patient-date-of-birth",
      "patient-date-of-birth",
      "date of birth",
      "Enter a real date of birth that is not after the consultation date.",
    );
  }
  if (
    consultation.visitType === "followup" &&
    consultation.linkedPriorVisit &&
    consultation.linkedPriorVisit.patientId !== consultation.patient.patientId
  ) {
    add(
      "prior-visit-patient",
      "prior-visit",
      "earlier prescription",
      "The earlier prescription belongs to a different patient.",
    );
  }
  if (!patientSexes.has(consultation.patient.sex)) {
    add(
      "patient-sex",
      "patient-sex",
      "gender",
      "Choose Female, Male, or Other.",
    );
  }
  if (!isRealDate(consultation.consultationDate)) {
    add(
      "consultation-date",
      "consultation-date",
      "consultation date",
      "Enter a real date in YYYY-MM-DD format.",
    );
  }

  const decimalVitals: Array<[keyof Consultation["vitals"], string, string]> = [
    ["weight", "weight", "Weight"],
    ["temperature", "temperature", "Temperature"],
  ];
  for (const [key, fieldId, label] of decimalVitals) {
    const value = consultation.vitals[key].trim();
    if (value && !isNonnegativeNumber(value)) {
      add(`vital-${key}`, fieldId, label.toLowerCase(), `Enter ${label.toLowerCase()} as a number.`);
    }
  }
  const wholeVitals: Array<[keyof Consultation["vitals"], string, string]> = [
    ["pulse", "pulse", "Pulse"],
    ["systolic", "systolic-blood-pressure", "Systolic blood pressure"],
    ["diastolic", "diastolic-blood-pressure", "Diastolic blood pressure"],
  ];
  for (const [key, fieldId, label] of wholeVitals) {
    const value = consultation.vitals[key].trim();
    if (value && !isNonnegativeWholeNumber(value)) {
      add(`vital-${key}`, fieldId, label.toLowerCase(), `${label} must be a nonnegative whole number.`);
    }
  }
  const spo2 = consultation.vitals.spo2.trim();
  if (spo2 && (!isNonnegativeNumber(spo2) || Number(spo2) > 100)) {
    add(
      "vital-spo2",
      "spo2",
      "SpO2",
      "SpO2 must be a number from 0 to 100.",
    );
  }

  if (!hasText(consultation.complaints)) {
    add("complaints", "complaints", "major complaints", "Choose at least one major complaint.");
  }
  if (!hasText(consultation.examinationFindings)) {
    add("findings", "examination-findings", "examination findings", "Choose at least one examination finding.");
  }
  if (!consultation.provisionalDiagnosis.trim()) {
    add("diagnosis", "provisional-diagnosis", "provisional diagnosis", "Choose a provisional diagnosis.");
  }

  consultation.medicines.forEach((medicine, index) => {
    const prefix = `medicine-${index}`;
    if (!medicine.name.trim()) {
      add(`${prefix}-name`, "medicines", "medicines", "Remove the unnamed medicine or choose it again.");
    }
    for (const field of ["dose", "duration", "method"] as const) {
      if (!medicine[field].trim()) {
        add(
          `${prefix}-${field}`,
          `${prefix}-${field}`,
          `${medicine.name || `medicine ${index + 1}`} ${field}`,
          `Choose a ${field} for ${medicine.name || `medicine ${index + 1}`}.`,
        );
      }
    }
  });

  return problems;
}
