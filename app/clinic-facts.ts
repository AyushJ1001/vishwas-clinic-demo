import { ingredientByMedicine } from "./clinic-data";
import type {
  ClinicDoctorName,
  ClinicIdentitySnapshot,
  CompletedPrescriptionSnapshot,
  Consultation,
  DoctorIdentitySnapshot,
} from "./consultation-model";

export const clinicIdentity: ClinicIdentitySnapshot = {
  name: "VISHWAS CLINIC",
  address:
    "Shop No. 6, Amrapali Apartments, Right Bhusari Colony, Paud Road, Kothrud, Pune 411038",
  hours:
    "Time: 6.30 pm to 9.30 pm, Monday to Saturday · Sunday by appointment only",
  services:
    "Emergency Home Visits · ECG · Nebulization · Blood Sugar Monitoring",
};

export const clinicDoctors: Record<ClinicDoctorName, DoctorIdentitySnapshot> = {
  "Dr. Makarand Vishwas Apte": {
    name: "Dr. Makarand Vishwas Apte",
    qualifications: "MBBS, MD (Anatomy)",
    registration: "Reg. No. 87352",
    mobile: "9730034907",
    specialty: "",
  },
  "Dr. Gauri Makarand Apte": {
    name: "Dr. Gauri Makarand Apte",
    qualifications: "MBBS, MD (Physiology)",
    registration: "Reg. No. 2000/31891",
    mobile: "9730034907",
    specialty: "CCEBDM, CCMTD · Diabetes & Thyroid Consultation",
  },
};

export function resolveMedicineComposition(name: string) {
  return ingredientByMedicine[name] || "Composition from medicine catalog";
}

export function createCompletedPrescriptionSnapshot(
  draftId: string,
  revision: number,
  consultation: Consultation,
  completedAt: string,
  snapshotId: string,
): CompletedPrescriptionSnapshot {
  const frozenConsultation = JSON.parse(
    JSON.stringify(consultation),
  ) as Consultation;
  return {
    id: snapshotId,
    draftId,
    sourceRevision: revision,
    completedAt,
    documentVersion: "prescription-v1",
    layoutVersion: "a5-v1",
    clinic: { ...clinicIdentity },
    doctor: { ...clinicDoctors[consultation.doctorName] },
    consultation: frozenConsultation,
    medicines: frozenConsultation.medicines.map((medicine) => ({
      ...medicine,
      composition: resolveMedicineComposition(medicine.name),
    })),
  };
}
