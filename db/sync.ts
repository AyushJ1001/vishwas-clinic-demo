import { env } from "cloudflare:workers";

import { addMissingColumns } from "./add-column";
import { catalogUpgradeColumns } from "./catalog";

import type {
  ClinicRecordChange,
  ClinicRecordKind,
  ConfirmedPhoneIssuedRecord,
  PhoneIssuedRecord,
  PhoneIssuedRecordKind,
} from "../app/sync-model";
import {
  consultationDraftsTableSql,
  medicalCertificateIndexesSql,
  medicalCertificatesTableSql,
  patientRecordIndexesSql,
  patientRecordsTableSql,
  patientRecordUpgradeColumns,
} from "./clinic-record-schema";

type RecordValue = Record<string, unknown>;

const currentVersion = `EXISTS (
  SELECT 1 FROM clinic_sync_records
  WHERE entity_kind = ? AND record_id = ? AND recorded_at = ?
)`;

async function ensureSyncTables() {
  const db = env.DB;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS clinic_sync_records (
      entity_kind TEXT NOT NULL,
      record_id TEXT NOT NULL,
      record_json TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      PRIMARY KEY (entity_kind, record_id)
    )`),
    db.prepare(patientRecordsTableSql),
    db.prepare(consultationDraftsTableSql),
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
    db.prepare(medicalCertificatesTableSql),
    db.prepare(`CREATE TABLE IF NOT EXISTS catalog_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id TEXT,
      catalog TEXT NOT NULL,
      group_name TEXT NOT NULL,
      item_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_sync_records_identity ON clinic_sync_records (entity_kind, record_id)",
    ),
    ...patientRecordIndexesSql.map((sql) => db.prepare(sql)),
    db.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_number ON receipts (receipt_number)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_receipts_issued_on ON receipts (issued_on)",
    ),
    ...medicalCertificateIndexesSql.map((sql) => db.prepare(sql)),
    db.prepare(`CREATE TABLE IF NOT EXISTS phone_issued_records (
      entity_kind TEXT NOT NULL,
      record_id TEXT NOT NULL,
      record_json TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      collected_at TEXT,
      PRIMARY KEY (entity_kind, record_id)
    )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_phone_issued_records_waiting ON phone_issued_records (collected_at, issued_at)",
    ),
  ]);
  await addMissingColumns(db, "patient_records", patientRecordUpgradeColumns);
  await addMissingColumns(db, "catalog_entries", catalogUpgradeColumns);
  await db.batch([
    db.prepare(
      "UPDATE catalog_entries SET record_id = lower(hex(randomblob(16))) WHERE record_id IS NULL OR record_id = ''",
    ),
    db.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_entries_record_id ON catalog_entries (record_id)",
    ),
    db.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_entries_unique ON catalog_entries (catalog, group_name, item_name)",
    ),
  ]);
}

function versionStatement(change: ClinicRecordChange, appliedAt: string) {
  return env.DB.prepare(
    `INSERT INTO clinic_sync_records
       (entity_kind, record_id, record_json, recorded_at, applied_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(entity_kind, record_id) DO UPDATE SET
       record_json = excluded.record_json,
       recorded_at = excluded.recorded_at,
       applied_at = excluded.applied_at
     WHERE excluded.recorded_at > clinic_sync_records.recorded_at`,
  ).bind(
    change.entityKind,
    change.recordId,
    JSON.stringify(change.record),
    change.recordedAt,
    appliedAt,
  );
}

function patientStatement(change: ClinicRecordChange) {
  const record = change.record;
  return env.DB.prepare(
    `INSERT INTO patient_records
       (id, patient_number, name, name_normalized, date_of_birth,
        date_of_birth_estimated, sex, phone, source_draft_id, phone_issued,
        possible_duplicate, created_at, updated_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
     WHERE ${currentVersion}
     ON CONFLICT(id) DO UPDATE SET
       patient_number = excluded.patient_number,
       name = excluded.name,
       name_normalized = excluded.name_normalized,
       date_of_birth = excluded.date_of_birth,
       date_of_birth_estimated = excluded.date_of_birth_estimated,
       sex = excluded.sex,
       phone = excluded.phone,
       source_draft_id = excluded.source_draft_id,
       phone_issued = excluded.phone_issued,
       possible_duplicate = excluded.possible_duplicate,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at`,
  ).bind(
    record.id,
    record.patientNumber,
    record.name,
    record.nameNormalized,
    record.dateOfBirth,
    record.dateOfBirthEstimated ? 1 : 0,
    record.sex,
    record.phone,
    record.sourceDraftId,
    record.phoneIssued ? 1 : 0,
    record.possibleDuplicate ? 1 : 0,
    record.createdAt,
    record.updatedAt,
    change.entityKind,
    change.recordId,
    change.recordedAt,
  );
}

function prescriptionStatement(change: ClinicRecordChange) {
  const record = change.record;
  return env.DB.prepare(
    `INSERT INTO consultation_drafts
       (id, revision, consultation_json, lifecycle_status,
        completed_snapshot_json, created_at, updated_at)
     SELECT ?, ?, ?, 'completed', ?, ?, ?
     WHERE ${currentVersion}
     ON CONFLICT(id) DO UPDATE SET
       revision = excluded.revision,
       consultation_json = excluded.consultation_json,
       lifecycle_status = 'completed',
       completed_snapshot_json = excluded.completed_snapshot_json,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at`,
  ).bind(
    record.draftId,
    record.sourceRevision,
    JSON.stringify(record.consultation),
    JSON.stringify(record),
    record.completedAt,
    change.recordedAt,
    change.entityKind,
    change.recordId,
    change.recordedAt,
  );
}

function receiptStatement(change: ClinicRecordChange) {
  const record = change.record;
  const patient = record.patient as RecordValue;
  const doctor = record.doctor as RecordValue;
  return env.DB.prepare(
    `INSERT INTO receipts
       (id, receipt_number, patient_id, doctor_name, issued_on,
        amount_paise, snapshot_json, created_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?
     WHERE ${currentVersion}
     ON CONFLICT(id) DO UPDATE SET
       receipt_number = excluded.receipt_number,
       patient_id = excluded.patient_id,
       doctor_name = excluded.doctor_name,
       issued_on = excluded.issued_on,
       amount_paise = excluded.amount_paise,
       snapshot_json = excluded.snapshot_json,
       created_at = excluded.created_at`,
  ).bind(
    record.id,
    record.receiptNumber,
    patient.id,
    doctor.name,
    record.issuedOn,
    record.amountPaise,
    JSON.stringify(record),
    record.createdAt,
    change.entityKind,
    change.recordId,
    change.recordedAt,
  );
}

function certificateStatement(change: ClinicRecordChange) {
  const record = change.record;
  const patient = record.patient as RecordValue;
  const doctor = record.doctor as RecordValue;
  return env.DB.prepare(
    `INSERT INTO medical_certificates
       (id, patient_id, doctor_name, issued_on, snapshot_json, created_at)
     SELECT ?, ?, ?, ?, ?, ?
     WHERE ${currentVersion}
     ON CONFLICT(id) DO UPDATE SET
       patient_id = excluded.patient_id,
       doctor_name = excluded.doctor_name,
       issued_on = excluded.issued_on,
       snapshot_json = excluded.snapshot_json,
       created_at = excluded.created_at`,
  ).bind(
    record.id,
    patient.id,
    doctor.name,
    record.issuedOn,
    JSON.stringify(record),
    record.createdAt,
    change.entityKind,
    change.recordId,
    change.recordedAt,
  );
}

function catalogStatement(change: ClinicRecordChange) {
  const record = change.record;
  return env.DB.prepare(
    `INSERT INTO catalog_entries
       (record_id, catalog, group_name, item_name, created_at)
     SELECT ?, ?, ?, ?, ?
     WHERE ${currentVersion}
     ON CONFLICT(catalog, group_name, item_name) DO UPDATE SET
       record_id = excluded.record_id,
       created_at = excluded.created_at`,
  ).bind(
    record.id,
    record.catalog,
    record.groupName,
    record.itemName,
    record.createdAt,
    change.entityKind,
    change.recordId,
    change.recordedAt,
  );
}

function recordStatement(change: ClinicRecordChange) {
  switch (change.entityKind) {
    case "patient":
      return patientStatement(change);
    case "prescription":
      return prescriptionStatement(change);
    case "receipt":
      return receiptStatement(change);
    case "medical-certificate":
      return certificateStatement(change);
    case "catalog-entry":
      return catalogStatement(change);
  }
}

export async function applyClinicRecordChanges(changes: ClinicRecordChange[]) {
  await ensureSyncTables();
  const appliedAt = new Date().toISOString();
  await env.DB.batch(
    changes.flatMap((change) => [
      versionStatement(change, appliedAt),
      recordStatement(change),
    ]),
  );
}

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function recordMatchesKind(
  kind: ClinicRecordKind,
  recordId: string,
  record: RecordValue,
) {
  if (record.id !== recordId) return false;
  if (kind === "patient") {
    return (
      (record.patientNumber === null || Number.isSafeInteger(record.patientNumber)) &&
      isString(record.name) &&
      isString(record.nameNormalized) &&
      isString(record.dateOfBirth) &&
      typeof record.dateOfBirthEstimated === "boolean" &&
      isString(record.sex) &&
      isString(record.phone) &&
      (record.sourceDraftId === null || isString(record.sourceDraftId)) &&
      (record.phoneIssued === undefined ||
        typeof record.phoneIssued === "boolean") &&
      (record.possibleDuplicate === undefined ||
        typeof record.possibleDuplicate === "boolean") &&
      isString(record.createdAt) &&
      isString(record.updatedAt)
    );
  }
  if (kind === "prescription") {
    return (
      isString(record.draftId) &&
      Number.isSafeInteger(record.sourceRevision) &&
      isString(record.completedAt) &&
      isRecord(record.consultation)
    );
  }
  if (kind === "receipt") {
    return (
      Number.isSafeInteger(record.receiptNumber) &&
      Number.isSafeInteger(record.amountPaise) &&
      isString(record.issuedOn) &&
      isString(record.createdAt) &&
      isRecord(record.patient) &&
      isString(record.patient.id) &&
      isRecord(record.doctor) &&
      isString(record.doctor.name)
    );
  }
  if (kind === "medical-certificate") {
    return (
      isString(record.issuedOn) &&
      isString(record.createdAt) &&
      isRecord(record.patient) &&
      isString(record.patient.id) &&
      isRecord(record.doctor) &&
      isString(record.doctor.name)
    );
  }
  return (
    isString(record.catalog) &&
    isString(record.groupName) &&
    isString(record.itemName) &&
    isString(record.createdAt)
  );
}

const kinds = new Set<ClinicRecordKind>([
  "patient",
  "prescription",
  "receipt",
  "medical-certificate",
  "catalog-entry",
]);

export function isClinicRecordChange(value: unknown): value is ClinicRecordChange {
  if (!isRecord(value)) return false;
  if (
    !isString(value.entityKind) ||
    !kinds.has(value.entityKind as ClinicRecordKind) ||
    !isString(value.recordId) ||
    !value.recordId ||
    !isRecord(value.record) ||
    !isString(value.recordedAt) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.recordedAt) ||
    !Number.isFinite(Date.parse(value.recordedAt))
  ) {
    return false;
  }
  return recordMatchesKind(
    value.entityKind as ClinicRecordKind,
    value.recordId,
    value.record,
  );
}

const phoneKinds = new Set<PhoneIssuedRecordKind>([
  "patient",
  "prescription",
  "medical-certificate",
]);

export function isPhoneIssuedRecord(value: unknown): value is PhoneIssuedRecord {
  if (!isRecord(value)) return false;
  if (
    !isString(value.entityKind) ||
    !phoneKinds.has(value.entityKind as PhoneIssuedRecordKind) ||
    !isString(value.recordId) ||
    !value.recordId ||
    !isRecord(value.record) ||
    !isString(value.issuedAt) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.issuedAt) ||
    !Number.isFinite(Date.parse(value.issuedAt)) ||
    !recordMatchesKind(
      value.entityKind as PhoneIssuedRecordKind,
      value.recordId,
      value.record,
    )
  ) {
    return false;
  }
  return value.entityKind !== "patient" || value.record.patientNumber === null;
}

export function isConfirmedPhoneIssuedRecord(
  value: unknown,
): value is ConfirmedPhoneIssuedRecord {
  if (!isRecord(value)) return false;
  return (
    isString(value.entityKind) &&
    phoneKinds.has(value.entityKind as PhoneIssuedRecordKind) &&
    isString(value.recordId) &&
    Boolean(value.recordId) &&
    isString(value.issuedAt) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.issuedAt) &&
    Number.isFinite(Date.parse(value.issuedAt))
  );
}

export async function queuePhoneIssuedRecord(record: PhoneIssuedRecord) {
  await ensureSyncTables();
  if (!isPhoneIssuedRecord(record)) {
    throw new TypeError("The Phone-issued record is invalid.");
  }
  await env.DB.prepare(
    `INSERT INTO phone_issued_records
       (entity_kind, record_id, record_json, issued_at, collected_at)
     VALUES (?, ?, ?, ?, NULL)
     ON CONFLICT(entity_kind, record_id) DO NOTHING`,
  )
    .bind(
      record.entityKind,
      record.recordId,
      JSON.stringify(record.record),
      record.issuedAt,
    )
    .run();
}

export async function confirmPhoneIssuedRecords(
  confirmations: ConfirmedPhoneIssuedRecord[],
) {
  if (!confirmations.length) return;
  await ensureSyncTables();
  const collectedAt = new Date().toISOString();
  await env.DB.batch(
    confirmations.map((confirmation) =>
      env.DB.prepare(
        `UPDATE phone_issued_records SET collected_at = COALESCE(collected_at, ?)
         WHERE entity_kind = ? AND record_id = ? AND issued_at = ?`,
      ).bind(
        collectedAt,
        confirmation.entityKind,
        confirmation.recordId,
        confirmation.issuedAt,
      ),
    ),
  );
}

export async function listWaitingPhoneIssuedRecords(
  limit: number,
): Promise<PhoneIssuedRecord[]> {
  await ensureSyncTables();
  const rows = await env.DB.prepare(
    `SELECT entity_kind, record_id, record_json, issued_at
     FROM phone_issued_records
     WHERE collected_at IS NULL
     ORDER BY issued_at ASC,
       CASE entity_kind WHEN 'patient' THEN 0 ELSE 1 END,
       entity_kind ASC, record_id ASC
     LIMIT ?`,
  )
    .bind(limit)
    .all<{
      entity_kind: PhoneIssuedRecordKind;
      record_id: string;
      record_json: string;
      issued_at: string;
    }>();
  return rows.results.map((row) => ({
    entityKind: row.entity_kind,
    recordId: row.record_id,
    record: JSON.parse(row.record_json) as Record<string, unknown>,
    issuedAt: row.issued_at,
  }));
}
