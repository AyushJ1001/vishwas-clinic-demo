import { NextResponse } from "next/server";
import type {
  Consultation,
  PriorVisitSnapshot,
} from "../../../consultation-model";
import {
  getConsultationDraft,
  saveConsultationDraft,
} from "../../../../db/consultation-drafts";
import { listCompletedDemoVisits } from "../../../../db/prior-visits";

type RouteContext = { params: Promise<{ id: string }> };

const doctorNames = new Set([
  "Dr. Makarand Vishwas Apte",
  "Dr. Gauri Makarand Apte",
]);

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isDraftId(value: string) {
  return /^[a-zA-Z0-9-]{8,120}$/.test(value);
}

function isPriorVisit(value: unknown): value is PriorVisitSnapshot {
  if (!value || typeof value !== "object") return false;
  const visit = value as Partial<PriorVisitSnapshot>;
  return Boolean(
    typeof visit.id === "string" &&
      visit.patient &&
      typeof visit.patient.name === "string" &&
      typeof visit.patient.age === "string" &&
      ["Female", "Male", "Other"].includes(visit.patient.sex) &&
      typeof visit.consultationDate === "string" &&
      visit.doctorName &&
      doctorNames.has(visit.doctorName) &&
      typeof visit.clinicalSummary === "string",
  );
}

function isConsultation(value: unknown): value is Consultation {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<Consultation>;
  return Boolean(
    (draft.visitType === null ||
      draft.visitType === "new" ||
      draft.visitType === "followup") &&
      (draft.linkedPriorVisit === null ||
        isPriorVisit(draft.linkedPriorVisit)) &&
      draft.doctorName &&
      doctorNames.has(draft.doctorName) &&
      draft.patient &&
      typeof draft.patient.name === "string" &&
      typeof draft.patient.age === "string" &&
      ["Female", "Male", "Other"].includes(draft.patient.sex) &&
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

async function canonicalizeConsultation(
  consultation: Consultation,
): Promise<Consultation | null> {
  if (!consultation.linkedPriorVisit) return consultation;
  if (consultation.visitType !== "followup") return null;

  const canonicalVisit = (await listCompletedDemoVisits()).find(
    (visit) => visit.id === consultation.linkedPriorVisit?.id,
  );
  if (!canonicalVisit) return null;
  return { ...consultation, linkedPriorVisit: canonicalVisit };
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isDraftId(id)) {
    return NextResponse.json({ error: "Invalid draft id" }, { status: 400 });
  }
  const draft = await getConsultationDraft(id);
  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }
  return NextResponse.json({ draft });
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    consultation?: unknown;
    revision?: unknown;
  } | null;
  if (
    !body ||
    !isDraftId(id) ||
    !Number.isSafeInteger(body.revision) ||
    (body.revision as number) < 1 ||
    !isConsultation(body.consultation)
  ) {
    return NextResponse.json(
      { error: "A valid consultation and revision are required" },
      { status: 400 },
    );
  }
  const consultation = await canonicalizeConsultation(body.consultation);
  if (!consultation) {
    return NextResponse.json(
      { error: "Linked prior visit must be a completed demo visit" },
      { status: 400 },
    );
  }
  return NextResponse.json(
    await saveConsultationDraft(
      id,
      body.revision as number,
      consultation,
    ),
  );
}
