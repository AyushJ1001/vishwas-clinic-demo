import { NextResponse } from "next/server";

import { patientDocumentFileName } from "../../../../../patient-document-model";
import { isPhoneIssuedRequest } from "../../../../../phone-issued-request";
import {
  readPatientDocument,
  removePatientDocument,
} from "../../../../../../db/patient-documents";

type RouteContext = { params: Promise<{ id: string; documentId: string }> };

const notFound = () =>
  NextResponse.json({ error: "Patient document not found" }, { status: 404 });

export async function GET(_request: Request, context: RouteContext) {
  const { id, documentId } = await context.params;
  const found = await readPatientDocument(id, documentId);
  if (!found) return notFound();
  const fileName = patientDocumentFileName(
    found.document.name,
    found.document.contentType,
  );
  return new Response(found.bytes, {
    headers: {
      "Content-Type": found.document.contentType,
      "Content-Length": String(found.bytes.length),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  if (isPhoneIssuedRequest(request)) {
    return NextResponse.json(
      { error: "Patient documents can only be removed on the Clinic PC" },
      { status: 403 },
    );
  }
  const { id, documentId } = await context.params;
  return (await removePatientDocument(id, documentId))
    ? NextResponse.json({ removed: true })
    : notFound();
}
