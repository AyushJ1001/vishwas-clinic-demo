import { NextResponse } from "next/server";

import {
  patientDocumentChunkBytes,
  patientDocumentChunkCount,
  patientDocumentMaxBytes,
} from "../../patient-document-model";
import { patientDocumentPieceParams } from "../../sync-model";
import { storeSyncedPatientDocumentChunk } from "../../../db/patient-documents";

export function isPatientDocumentPiece(request: Request) {
  return new URL(request.url).searchParams.has(patientDocumentPieceParams.document);
}

/**
 * Takes one piece of a Patient document from the Clinic PC. Sending a piece
 * again replaces it, so an upload cut off by a bad connection just resumes.
 */
export async function storePatientDocumentPiece(request: Request) {
  const params = new URL(request.url).searchParams;
  const documentId = params.get(patientDocumentPieceParams.document) ?? "";
  const chunkIndex = Number(params.get(patientDocumentPieceParams.chunk) ?? "");
  if (
    !/^[a-zA-Z0-9-]{8,120}$/.test(documentId) ||
    !Number.isSafeInteger(chunkIndex) ||
    chunkIndex < 0 ||
    chunkIndex >= patientDocumentChunkCount(patientDocumentMaxBytes)
  ) {
    return NextResponse.json({ error: "The piece is invalid" }, { status: 400 });
  }
  const tooLarge = () =>
    NextResponse.json({ error: "The piece is too large" }, { status: 413 });
  if (Number(request.headers.get("content-length")) > patientDocumentChunkBytes) {
    return tooLarge();
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > patientDocumentChunkBytes) return tooLarge();
  if (!bytes.length) {
    return NextResponse.json({ error: "The piece is invalid" }, { status: 400 });
  }
  await storeSyncedPatientDocumentChunk(documentId, chunkIndex, bytes);
  return NextResponse.json({ stored: { documentId, chunkIndex } });
}
