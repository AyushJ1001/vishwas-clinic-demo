import { NextResponse } from "next/server";
import {
  completeConsultationDraft,
  ConsultationRevisionConflictError,
  getConsultationDraft,
} from "../../../../../db/consultation-drafts";
import { findPriorVisit } from "../../../../../db/prior-visits";
import { savePatientForConsultation } from "../../../../../db/patients";
import {
  consultationFingerprint,
  isConsultationShape,
  validateConsultation,
} from "../../../../consultation-validation";
import type { Consultation } from "../../../../consultation-model";
import { isPhoneIssuedRequest } from "../../../../phone-issued-request";

type RouteContext = { params: Promise<{ id: string }> };

function isDraftId(value: string) {
  return /^[a-zA-Z0-9-]{8,120}$/.test(value);
}

// The Patient link is settled before the prescription is locked. On the
// Cloud copy the number stays pending until the Clinic PC collects it.
async function withSavedPatient(
  consultation: Consultation,
  draftId: string,
  phoneIssued: boolean,
): Promise<Consultation> {
  const patient = await savePatientForConsultation(
    consultation.patient,
    consultation.consultationDate,
    draftId,
    { phoneIssued },
  );
  return {
    ...consultation,
    patient: {
      ...consultation.patient,
      patientId: patient.id,
      patientNumber: patient.number,
    },
  };
}

export async function POST(request: Request, context: RouteContext) {
  const phoneIssued = isPhoneIssuedRequest(request);
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    revision?: unknown;
    expectedConsultation?: unknown;
  } | null;
  if (
    !body ||
    !isDraftId(id) ||
    !Number.isSafeInteger(body.revision) ||
    (body.revision as number) < 1 ||
    !isConsultationShape(body.expectedConsultation)
  ) {
    return NextResponse.json(
      { error: "A valid saved revision is required" },
      { status: 400 },
    );
  }

  const draft = await getConsultationDraft(id);
  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }
  try {
    if (draft.lifecycle === "completed" && draft.completedSnapshot) {
      const snapshot = await completeConsultationDraft({
        id,
        expectedRevision: body.revision as number,
        expectedConsultation: body.expectedConsultation,
        consultation: body.expectedConsultation,
        phoneIssued,
      });
      if (!snapshot) {
        return NextResponse.json({ error: "Draft not found" }, { status: 404 });
      }
      return NextResponse.json({ snapshot });
    }

    if (
      draft.revision !== body.revision ||
      consultationFingerprint(draft.consultation) !==
        consultationFingerprint(body.expectedConsultation)
    ) {
      return NextResponse.json(
        { error: "The saved draft differs from this review" },
        { status: 409 },
      );
    }

    let consultation = draft.consultation;
    if (consultation.visitType === "followup") {
      consultation = {
        ...consultation,
        linkedPriorVisit: consultation.linkedPriorVisit
          ? await findPriorVisit(
              consultation.patient.patientId,
              consultation.linkedPriorVisit.id,
            )
          : null,
      };
    }

    const problems = validateConsultation(consultation);
    if (problems.length) {
      return NextResponse.json(
        { error: "The consultation is not ready to complete", problems },
        { status: 422 },
      );
    }

    const snapshot = await completeConsultationDraft({
      id,
      expectedRevision: body.revision as number,
      expectedConsultation: body.expectedConsultation,
      consultation: await withSavedPatient(consultation, id, phoneIssued),
      phoneIssued,
    });
    if (!snapshot) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }
    return NextResponse.json({ snapshot });
  } catch (error) {
    if (error instanceof ConsultationRevisionConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
