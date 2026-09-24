import { env } from "cloudflare:workers";

import { clinicDoctors, clinicIdentity } from "../app/clinic-facts";
import type { ConsultationPatient, ClinicDoctorName } from "../app/consultation-model";
import type {
  CertificateTitle,
  MedicalCertificateSnapshot,
  ReceiptSnapshot,
  ReceiptTitle,
} from "../app/issued-document-model";
import { savePatientForConsultation } from "./patients";
import {
  medicalCertificateIndexesSql,
  medicalCertificatesTableSql,
} from "./clinic-record-schema";
import { queuePhoneIssuedRecord } from "./sync";

type ReceiptRow = { snapshot_json: string };
type CertificateRow = { snapshot_json: string };

async function ensureIssuedDocumentTables() {
  const db = env.DB;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY NOT NULL,
      receipt_number INTEGER NOT NULL UNIQUE,
      patient_id TEXT NOT NULL,
      doctor_name TEXT NOT NULL,
      issued_on TEXT NOT NULL,
      amount_paise INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_number ON receipts (receipt_number)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_receipts_issued_on ON receipts (issued_on)",
    ),
    db.prepare(medicalCertificatesTableSql),
    ...medicalCertificateIndexesSql.map((sql) => db.prepare(sql)),
  ]);
}

function parseReceipt(row: ReceiptRow): ReceiptSnapshot {
  return JSON.parse(row.snapshot_json) as ReceiptSnapshot;
}

function parseCertificate(row: CertificateRow): MedicalCertificateSnapshot {
  return JSON.parse(row.snapshot_json) as MedicalCertificateSnapshot;
}

export async function getReceipt(id: string) {
  await ensureIssuedDocumentTables();
  const row = await env.DB.prepare(
    "SELECT snapshot_json FROM receipts WHERE id = ?",
  )
    .bind(id)
    .first<ReceiptRow>();
  return row ? parseReceipt(row) : null;
}

export async function nextReceiptNumber() {
  await ensureIssuedDocumentTables();
  const row = await env.DB.prepare(
    "SELECT COALESCE(MAX(receipt_number) + 1, 1) AS next_number FROM receipts",
  ).first<{ next_number: number }>();
  return row?.next_number ?? 1;
}

export async function listRecentReceipts(limit = 30) {
  await ensureIssuedDocumentTables();
  const rows = await env.DB.prepare(
    `SELECT snapshot_json FROM receipts
     ORDER BY created_at DESC, receipt_number DESC LIMIT ?`,
  )
    .bind(limit)
    .all<ReceiptRow>();
  return rows.results.map(parseReceipt);
}

export async function issueReceipt(input: {
  id: string;
  patient: ConsultationPatient;
  doctorName: ClinicDoctorName;
  issuedOn: string;
  title: ReceiptTitle;
  amountPaise: number;
}) {
  await ensureIssuedDocumentTables();
  const existing = await getReceipt(input.id);
  if (existing) return existing;

  const patient = await savePatientForConsultation(
    input.patient,
    input.issuedOn,
    input.id,
  );
  const createdAt = new Date().toISOString();
  const snapshotWithoutNumber = {
    id: input.id,
    documentVersion: "receipt-v1",
    layoutVersion: "a5-v1",
    issuedOn: input.issuedOn,
    createdAt,
    clinic: { ...clinicIdentity },
    doctor: { ...clinicDoctors[input.doctorName] },
    patient: {
      id: patient.id,
      number: patient.number,
      name: patient.name,
      age: patient.age,
      sex: patient.sex,
    },
    title: input.title,
    amountPaise: input.amountPaise,
  };
  try {
    await env.DB.prepare(
      `INSERT INTO receipts
         (id, receipt_number, patient_id, doctor_name, issued_on,
          amount_paise, snapshot_json, created_at)
       SELECT ?, COALESCE(MAX(receipt_number) + 1, 1), ?, ?, ?, ?,
         json_set(?, '$.receiptNumber', COALESCE(MAX(receipt_number) + 1, 1)), ?
       FROM receipts`,
    )
      .bind(
        input.id,
        patient.id,
        input.doctorName,
        input.issuedOn,
        input.amountPaise,
        JSON.stringify(snapshotWithoutNumber),
        createdAt,
      )
      .run();
  } catch (error) {
    const raced = await getReceipt(input.id);
    if (raced) return raced;
    throw error;
  }
  const issued = await getReceipt(input.id);
  if (!issued) throw new Error("Issued receipt could not be read.");
  return issued;
}

export async function getMedicalCertificate(id: string) {
  await ensureIssuedDocumentTables();
  const row = await env.DB.prepare(
    "SELECT snapshot_json FROM medical_certificates WHERE id = ?",
  )
    .bind(id)
    .first<CertificateRow>();
  return row ? parseCertificate(row) : null;
}

export async function listRecentMedicalCertificates(limit = 30) {
  await ensureIssuedDocumentTables();
  const rows = await env.DB.prepare(
    `SELECT snapshot_json FROM medical_certificates
     ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(limit)
    .all<CertificateRow>();
  return rows.results.map(parseCertificate);
}

export async function issueMedicalCertificate(input: {
  id: string;
  patient: ConsultationPatient;
  doctorName: ClinicDoctorName;
  issuedOn: string;
  title: CertificateTitle;
  diagnosis: string;
  treatmentSince: string;
  restDays: number;
  fitToResume: boolean;
  resumeFrom: string;
  phoneIssued?: boolean;
}) {
  await ensureIssuedDocumentTables();
  const existing = await getMedicalCertificate(input.id);
  if (existing) {
    if (input.phoneIssued) {
      await queuePhoneIssuedRecord({
        entityKind: "medical-certificate",
        recordId: existing.id,
        record: existing as unknown as Record<string, unknown>,
        issuedAt: existing.createdAt,
      });
    }
    return existing;
  }

  const patient = await savePatientForConsultation(
    input.patient,
    input.issuedOn,
    input.id,
    { phoneIssued: input.phoneIssued },
  );
  const createdAt = new Date().toISOString();
  const snapshot: MedicalCertificateSnapshot = {
    id: input.id,
    documentVersion: "medical-certificate-v1",
    layoutVersion: "a5-v1",
    issuedOn: input.issuedOn,
    createdAt,
    clinic: { ...clinicIdentity },
    doctor: { ...clinicDoctors[input.doctorName] },
    patient: {
      id: patient.id,
      number: patient.number,
      name: patient.name,
      age: patient.age,
      sex: patient.sex,
    },
    title: input.title,
    diagnosis: input.diagnosis,
    treatmentSince: input.treatmentSince,
    restDays: input.restDays,
    fitToResume: input.fitToResume,
    resumeFrom: input.resumeFrom,
  };
  try {
    await env.DB.prepare(
      `INSERT INTO medical_certificates
         (id, patient_id, doctor_name, issued_on, snapshot_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        input.id,
        patient.id,
        input.doctorName,
        input.issuedOn,
        JSON.stringify(snapshot),
        createdAt,
      )
      .run();
  } catch (error) {
    const raced = await getMedicalCertificate(input.id);
    if (raced) return raced;
    throw error;
  }
  if (input.phoneIssued) {
    await queuePhoneIssuedRecord({
      entityKind: "medical-certificate",
      recordId: snapshot.id,
      record: snapshot as unknown as Record<string, unknown>,
      issuedAt: snapshot.createdAt,
    });
  }
  return snapshot;
}
