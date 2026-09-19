import type { PriorVisitSnapshot } from "../app/consultation-model";
import { listCompletedPrescriptionsForPatient } from "./consultation-drafts";

/** Earlier prescriptions a follow-up for this patient can continue. */
export async function listPriorVisits(
  patientId: string,
): Promise<PriorVisitSnapshot[]> {
  return listCompletedPrescriptionsForPatient(patientId);
}

/** The saved version of a linked prior visit, if it is really this patient's. */
export async function findPriorVisit(patientId: string, visitId: string) {
  return (await listPriorVisits(patientId)).find((visit) => visit.id === visitId) ?? null;
}
