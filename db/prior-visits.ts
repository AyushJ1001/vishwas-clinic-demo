import type { PriorVisitSnapshot } from "../app/consultation-model";

const completedDemoVisits: PriorVisitSnapshot[] = [
  {
    id: "demo-visit-kavya-mehta-2026-08-18",
    patient: {
      name: "Demo Patient Kavya Mehta",
      age: "44",
      sex: "Female",
    },
    consultationDate: "2026-08-18",
    doctorName: "Dr. Gauri Makarand Apte",
    clinicalSummary:
      "Thyroid review; fatigue improving and observations stable.",
  },
  {
    id: "demo-visit-rohan-shah-2026-07-29",
    patient: {
      name: "Demo Patient Rohan Shah",
      age: "36",
      sex: "Male",
    },
    consultationDate: "2026-07-29",
    doctorName: "Dr. Makarand Vishwas Apte",
    clinicalSummary:
      "Seasonal cough review; chest examination clear and fever resolved.",
  },
  {
    id: "demo-visit-samira-iyer-2026-06-12",
    patient: {
      name: "Demo Patient Samira Iyer",
      age: "51",
      sex: "Female",
    },
    consultationDate: "2026-06-12",
    doctorName: "Dr. Gauri Makarand Apte",
    clinicalSummary:
      "Diabetes follow-up; home glucose readings reviewed and stable.",
  },
];

export async function listCompletedDemoVisits(): Promise<
  PriorVisitSnapshot[]
> {
  return completedDemoVisits.map((visit) => ({
    ...visit,
    patient: { ...visit.patient },
  }));
}
