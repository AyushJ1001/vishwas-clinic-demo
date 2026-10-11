import { NextResponse } from "next/server";

import {
  patientDocumentMaxBytes,
  patientDocumentName,
  patientDocumentTypeOf,
  patientDocumentTypesHint,
} from "../../../../patient-document-model";
import { isPhoneIssuedRequest } from "../../../../phone-issued-request";
import {
  addPatientDocument,
  listPatientDocuments,
} from "../../../../../db/patient-documents";
import { getPatient } from "../../../../../db/patients";

type RouteContext = { params: Promise<{ id: string }> };

// ADR 0005: the Cloud copy shows the Patient documents Sync has brought it,
// but only the Clinic PC adds or removes one.
export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return NextResponse.json({
    documents: await listPatientDocuments(id),
    canChange: !isPhoneIssuedRequest(request),
  });
}

export async function POST(request: Request, context: RouteContext) {
  if (isPhoneIssuedRequest(request)) {
    return NextResponse.json(
      { error: "Patient documents can only be added on the Clinic PC" },
      { status: 403 },
    );
  }
  const { id } = await context.params;
  const tooLarge = () =>
    NextResponse.json(
      { error: "The file is larger than 10 MB" },
      { status: 413 },
    );
  if (Number(request.headers.get("Content-Length")) > patientDocumentMaxBytes) {
    return tooLarge();
  }
  const name = patientDocumentName(
    new URL(request.url).searchParams.get("name") ?? "",
  );
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > patientDocumentMaxBytes) return tooLarge();
  const contentType = patientDocumentTypeOf(bytes);
  if (!name || !contentType) {
    return NextResponse.json(
      { error: `A named file is required: ${patientDocumentTypesHint}` },
      { status: 400 },
    );
  }
  if (!(await getPatient(id))) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }
  const document = await addPatientDocument({
    patientId: id,
    name,
    contentType,
    bytes,
  });
  return NextResponse.json({ document }, { status: 201 });
}
