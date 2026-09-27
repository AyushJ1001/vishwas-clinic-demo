import {
  emptyConsultationPatient,
  type ConsultationPatient,
  type PatientRecord,
} from "../consultation-model";

export function documentPatientFromRecord(
  record: PatientRecord,
): ConsultationPatient {
  return {
    patientId: record.id,
    patientNumber: record.number,
    name: record.name,
    age: record.age,
    dateOfBirth: record.dateOfBirthEstimated ? "" : record.dateOfBirth,
    sex: record.sex,
    phone: record.phone,
  };
}

export function freshDocumentPatient(): ConsultationPatient {
  return { ...emptyConsultationPatient(), sex: "Other" };
}
