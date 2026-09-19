import { NextResponse } from "next/server";
import type { Consultation } from "../../../consultation-model";
import { isConsultationShape } from "../../../consultation-validation";
import {
  ConsultationCompletedError,
  getConsultationDraft,
  saveConsultationDraft,
} from "../../../../db/consultation-drafts";
import { findPriorVisit } from "../../../../db/prior-visits";

type RouteContext = { params: Promise<{ id: string }> };

function isDraftId(value: string) {
  return /^[a-zA-Z0-9-]{8,120}$/.test(value);
}

async function canonicalizeConsultation(
  consultation: Consultation,
): Promise<Consultation | null> {
  if (!consultation.linkedPriorVisit) return consultation;
  if (consultation.visitType !== "followup") return null;

  const canonicalVisit = await findPriorVisit(
    consultation.patient.patientId,
    consultation.linkedPriorVisit.id,
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
    !isConsultationShape(body.consultation)
  ) {
    return NextResponse.json(
      { error: "A valid consultation and revision are required" },
      { status: 400 },
    );
  }
  const consultation = await canonicalizeConsultation(body.consultation);
  if (!consultation) {
    return NextResponse.json(
      { error: "The linked earlier prescription must be one of this patient's completed prescriptions" },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(
      await saveConsultationDraft(
        id,
        body.revision as number,
        consultation,
      ),
    );
  } catch (error) {
    if (error instanceof ConsultationCompletedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
