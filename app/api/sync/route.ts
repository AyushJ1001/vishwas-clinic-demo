import { NextResponse } from "next/server";

import type { PatientDocumentSyncRecord } from "../../patient-document-model";
import {
  clinicSyncBatchLimit,
  type ClinicRecordChange,
  type ConfirmedPhoneIssuedRecord,
} from "../../sync-model";
import {
  applyClinicRecordChanges,
  confirmPhoneIssuedRecords,
  isClinicRecordChange,
  isConfirmedPhoneIssuedRecord,
  listWaitingPhoneIssuedRecords,
} from "../../../db/sync";
import { patientDocumentsMissingPieces } from "../../../db/patient-documents";
import { fromClinicPc } from "./device-key";
import {
  isPatientDocumentPiece,
  storePatientDocumentPiece,
} from "./patient-document-piece";

const maxRequestBytes = 1_000_000;

export async function POST(request: Request) {
  if (!(await fromClinicPc(request))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (isPatientDocumentPiece(request)) return storePatientDocumentPiece(request);
  const declaredBytes = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredBytes) && declaredBytes > maxRequestBytes) {
    return NextResponse.json({ error: "Sync batch is too large" }, { status: 413 });
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxRequestBytes) {
    return NextResponse.json({ error: "Sync batch is too large" }, { status: 413 });
  }
  let body: { changes?: unknown; collected?: unknown } | null;
  try {
    body = JSON.parse(text || "null") as {
      changes?: unknown;
      collected?: unknown;
    } | null;
  } catch {
    return NextResponse.json({ error: "The Sync batch is invalid" }, { status: 400 });
  }
  if (
    !body ||
    !Array.isArray(body.changes) ||
    !Array.isArray(body.collected ?? [])
  ) {
    return NextResponse.json({ error: "The Sync batch is invalid" }, { status: 400 });
  }
  const collected = (body.collected ?? []) as unknown[];
  if (
    body.changes.length > clinicSyncBatchLimit ||
    collected.length > clinicSyncBatchLimit
  ) {
    return NextResponse.json(
      { error: `Sync at most ${clinicSyncBatchLimit} changes per request` },
      { status: 413 },
    );
  }
  if (!body.changes.every(isClinicRecordChange)) {
    return NextResponse.json({ error: "The Sync batch is invalid" }, { status: 400 });
  }
  if (!collected.every(isConfirmedPhoneIssuedRecord)) {
    return NextResponse.json({ error: "The Sync batch is invalid" }, { status: 400 });
  }
  const changes = body.changes as ClinicRecordChange[];
  // A Patient document is announced only after its bytes: the Clinic PC is
  // told to send them again instead of the Cloud copy listing an empty file.
  const announced = changes
    .filter((change) => change.entityKind === "patient-document")
    .map((change) => change.record as unknown as PatientDocumentSyncRecord)
    .filter((document) => document.removedAt === null);
  const missingPieces = await patientDocumentsMissingPieces(announced);
  if (missingPieces.length) {
    return NextResponse.json(
      { error: "A Patient document's bytes have not all arrived", missingPieces },
      { status: 409 },
    );
  }
  if (changes.length) await applyClinicRecordChanges(changes);
  await confirmPhoneIssuedRecords(collected as ConfirmedPhoneIssuedRecord[]);
  return NextResponse.json({
    accepted: changes.map(({ entityKind, recordId, recordedAt }) => ({
      entityKind,
      recordId,
      recordedAt,
    })),
    collected,
    phoneIssued: await listWaitingPhoneIssuedRecords(clinicSyncBatchLimit),
  });
}
