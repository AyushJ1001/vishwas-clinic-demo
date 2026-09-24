// Kept outside the Electron main process so the Clinic PC and Cloud copy use
// one definition for the records collected from a phone.
export const patientRecordsTableSql = `CREATE TABLE IF NOT EXISTS patient_records (
  id TEXT PRIMARY KEY NOT NULL,
  patient_number INTEGER,
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL,
  date_of_birth TEXT NOT NULL DEFAULT '',
  date_of_birth_estimated INTEGER NOT NULL DEFAULT 0,
  sex TEXT NOT NULL DEFAULT 'Other',
  phone TEXT NOT NULL DEFAULT '',
  source_draft_id TEXT,
  phone_issued INTEGER NOT NULL DEFAULT 0,
  possible_duplicate INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

export const patientRecordIndexesSql = [
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_records_number ON patient_records (patient_number)",
  "CREATE INDEX IF NOT EXISTS idx_patient_records_name ON patient_records (name_normalized)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_records_source_draft ON patient_records (source_draft_id)",
] as const;

export const patientRecordUpgradeColumns = [
  {
    name: "phone_issued",
    sql: "ALTER TABLE patient_records ADD COLUMN phone_issued INTEGER NOT NULL DEFAULT 0",
  },
  {
    name: "possible_duplicate",
    sql: "ALTER TABLE patient_records ADD COLUMN possible_duplicate INTEGER NOT NULL DEFAULT 0",
  },
] as const;

export const consultationDraftsTableSql = `CREATE TABLE IF NOT EXISTS consultation_drafts (
  id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL,
  consultation_json TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'editing',
  completed_snapshot_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

export const medicalCertificatesTableSql = `CREATE TABLE IF NOT EXISTS medical_certificates (
  id TEXT PRIMARY KEY NOT NULL,
  patient_id TEXT NOT NULL,
  doctor_name TEXT NOT NULL,
  issued_on TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL
)`;

export const medicalCertificateIndexesSql = [
  "CREATE INDEX IF NOT EXISTS idx_medical_certificates_issued_on ON medical_certificates (issued_on)",
] as const;

export const phoneCollectionsTableSql = `CREATE TABLE IF NOT EXISTS clinic_phone_collections (
  entity_kind TEXT NOT NULL,
  record_id TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  PRIMARY KEY (entity_kind, record_id)
)`;
