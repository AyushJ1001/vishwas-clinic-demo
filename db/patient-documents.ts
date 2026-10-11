import { env } from "cloudflare:workers";

import {
  isPatientDocumentType,
  patientDocumentChunkBytes,
  patientDocumentChunkCount,
  type PatientDocument,
  type PatientDocumentType,
} from "../app/patient-document-model";
import { patientDocumentTablesSql } from "./clinic-record-schema";

// ADR 0005: a Patient document's bytes are kept in the database itself, in
// pieces, so every backup and restore carries them.

type DocumentRow = {
  id: string;
  patient_id: string;
  name: string;
  content_type: string;
  byte_size: number;
  added_at: string;
};

const columns = "id, patient_id, name, content_type, byte_size, added_at";

async function ensurePatientDocumentTables() {
  const db = env.DB;
  await db.batch(patientDocumentTablesSql.map((sql) => db.prepare(sql)));
}

function toPatientDocument(row: DocumentRow): PatientDocument {
  return {
    id: row.id,
    patientId: row.patient_id,
    name: row.name,
    contentType: isPatientDocumentType(row.content_type)
      ? row.content_type
      : "application/pdf",
    byteSize: row.byte_size,
    addedAt: row.added_at,
  };
}

function fromBase64(text: string) {
  // Node's decoder where there is one (the Cloud copy); the Clinic PC's
  // window has none, and never reads a piece stored as text.
  if (typeof Buffer !== "undefined") return Buffer.from(text, "base64");
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
}

function toBase64(bytes: Uint8Array) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(
      "base64",
    );
  }
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

// A piece comes back as bytes from the Clinic PC, as a list of numbers from
// a D1 BLOB, and as base64 text when it arrived through Sync.
function toBytes(value: unknown): Uint8Array {
  if (typeof value === "string") return fromBase64(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return Uint8Array.from(value as number[]);
}

export async function listPatientDocuments(
  patientId: string,
): Promise<PatientDocument[]> {
  await ensurePatientDocumentTables();
  const rows = await env.DB.prepare(
    `SELECT ${columns} FROM patient_documents
     WHERE patient_id = ?
     ORDER BY added_at DESC, id ASC`,
  )
    .bind(patientId)
    .all<DocumentRow>();
  return rows.results.map(toPatientDocument);
}

async function getPatientDocument(patientId: string, documentId: string) {
  const row = await env.DB.prepare(
    `SELECT ${columns} FROM patient_documents WHERE id = ? AND patient_id = ?`,
  )
    .bind(documentId, patientId)
    .first<DocumentRow>();
  return row ? toPatientDocument(row) : null;
}

export async function addPatientDocument(input: {
  patientId: string;
  name: string;
  contentType: PatientDocumentType;
  bytes: Uint8Array;
}): Promise<PatientDocument> {
  await ensurePatientDocumentTables();
  const id = crypto.randomUUID();
  const addedAt = new Date().toISOString();
  const chunks: Uint8Array[] = [];
  for (
    let offset = 0;
    offset < input.bytes.length;
    offset += patientDocumentChunkBytes
  ) {
    // Copies, so each piece crosses to the database as its own megabyte.
    chunks.push(input.bytes.slice(offset, offset + patientDocumentChunkBytes));
  }
  // One transaction: a document is never listed without all of its pieces.
  await env.DB.batch([
    ...chunks.map((chunk, index) =>
      env.DB.prepare(
        "INSERT INTO patient_document_chunks (document_id, chunk_index, bytes) VALUES (?, ?, ?)",
      ).bind(id, index, chunk),
    ),
    env.DB.prepare(
      `INSERT INTO patient_documents (${columns}) VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      input.patientId,
      input.name,
      input.contentType,
      input.bytes.length,
      addedAt,
    ),
  ]);
  return {
    id,
    patientId: input.patientId,
    name: input.name,
    contentType: input.contentType,
    byteSize: input.bytes.length,
    addedAt,
  };
}

/** A Patient document with its bytes, if it is really this patient's. */
export async function readPatientDocument(
  patientId: string,
  documentId: string,
) {
  await ensurePatientDocumentTables();
  const document = await getPatientDocument(patientId, documentId);
  if (!document) return null;
  const bytes = new Uint8Array(document.byteSize);
  let offset = 0;
  // One piece per query keeps each answer under D1's size limits.
  for (let index = 0; offset < bytes.length; index += 1) {
    const chunk = await env.DB.prepare(
      "SELECT bytes FROM patient_document_chunks WHERE document_id = ? AND chunk_index = ?",
    )
      .bind(documentId, index)
      .first<{ bytes: unknown }>();
    if (!chunk) throw new Error("A Patient document is missing a piece.");
    const piece = toBytes(chunk.bytes);
    bytes.set(piece, offset);
    offset += piece.length;
  }
  return { document, bytes };
}

export async function removePatientDocument(
  patientId: string,
  documentId: string,
) {
  await ensurePatientDocumentTables();
  const document = await getPatientDocument(patientId, documentId);
  if (!document) return false;
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM patient_document_chunks WHERE document_id = ?",
    ).bind(documentId),
    env.DB.prepare("DELETE FROM patient_documents WHERE id = ?").bind(
      documentId,
    ),
  ]);
  return true;
}

/** Keeps one piece the Clinic PC sent ahead of announcing its document. */
export async function storeSyncedPatientDocumentChunk(
  documentId: string,
  chunkIndex: number,
  bytes: Uint8Array,
) {
  await ensurePatientDocumentTables();
  await env.DB.prepare(
    `INSERT INTO patient_document_chunks (document_id, chunk_index, bytes)
     VALUES (?, ?, ?)
     ON CONFLICT(document_id, chunk_index) DO UPDATE SET bytes = excluded.bytes`,
  )
    .bind(documentId, chunkIndex, toBase64(bytes))
    .run();
}

/** The documents among these whose bytes have not all reached the Cloud copy. */
export async function patientDocumentsMissingPieces(
  documents: { id: string; byteSize: number }[],
) {
  await ensurePatientDocumentTables();
  const missing: string[] = [];
  for (const document of documents) {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM patient_document_chunks WHERE document_id = ?",
    )
      .bind(document.id)
      .first<{ count: number }>();
    if ((row?.count ?? 0) < patientDocumentChunkCount(document.byteSize)) {
      missing.push(document.id);
    }
  }
  return missing;
}
