import { NextResponse } from "next/server";
import type { Consultation } from "../../../consultation-model";
import {
  getConsultationDraft,
  saveConsultationDraft,
} from "../../../../db/consultation-drafts";

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

function isConsultation(value: unknown): value is Consultation {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<Consultation>;
  return Boolean(
    (draft.visitType === null ||
      draft.visitType === "new" ||
      draft.visitType === "followup") &&
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
  return NextResponse.json(
    await saveConsultationDraft(
      id,
      body.revision as number,
      body.consultation,
    ),
  );
}
