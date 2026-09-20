import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const catalogEntries = sqliteTable(
  "catalog_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recordId: text("record_id"),
    catalog: text("catalog").notNull(),
    groupName: text("group_name").notNull(),
    itemName: text("item_name").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_catalog_entries_unique").on(
      table.catalog,
      table.groupName,
      table.itemName,
    ),
    uniqueIndex("idx_catalog_entries_record_id").on(table.recordId),
  ],
);

export const clinicSyncRecords = sqliteTable(
  "clinic_sync_records",
  {
    entityKind: text("entity_kind").notNull(),
    recordId: text("record_id").notNull(),
    recordJson: text("record_json").notNull(),
    recordedAt: text("recorded_at").notNull(),
    appliedAt: text("applied_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_clinic_sync_records_identity").on(
      table.entityKind,
      table.recordId,
    ),
  ],
);

export const consultationDrafts = sqliteTable("consultation_drafts", {
  id: text("id").primaryKey(),
  revision: integer("revision").notNull(),
  consultationJson: text("consultation_json").notNull(),
  lifecycleStatus: text("lifecycle_status").notNull().default("editing"),
  completedSnapshotJson: text("completed_snapshot_json"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const patients = sqliteTable(
  "patients",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    nameNormalized: text("name_normalized").notNull(),
    age: text("age").notNull().default(""),
    sex: text("sex").notNull().default("Other"),
    phone: text("phone").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_patients_name_normalized").on(table.nameNormalized)],
);

// Replaces `patients` (see db/patients.ts, which copies its rows over): a
// globally unique id, plus the sequential Patient number the clinic uses.
export const patientRecords = sqliteTable(
  "patient_records",
  {
    id: text("id").primaryKey(),
    patientNumber: integer("patient_number"),
    name: text("name").notNull(),
    nameNormalized: text("name_normalized").notNull(),
    dateOfBirth: text("date_of_birth").notNull().default(""),
    dateOfBirthEstimated: integer("date_of_birth_estimated").notNull().default(0),
    sex: text("sex").notNull().default("Other"),
    phone: text("phone").notNull().default(""),
    sourceDraftId: text("source_draft_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_patient_records_number").on(table.patientNumber),
    index("idx_patient_records_name").on(table.nameNormalized),
    uniqueIndex("idx_patient_records_source_draft").on(table.sourceDraftId),
  ],
);

// Issued documents are immutable snapshots. Receipt numbers are assigned by
// the Clinic PC when the row is inserted; the UUID supplied by the client
// makes a retried issue request idempotent.
export const receipts = sqliteTable(
  "receipts",
  {
    id: text("id").primaryKey(),
    receiptNumber: integer("receipt_number").notNull(),
    patientId: text("patient_id").notNull(),
    doctorName: text("doctor_name").notNull(),
    issuedOn: text("issued_on").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_receipts_number").on(table.receiptNumber),
    index("idx_receipts_issued_on").on(table.issuedOn),
  ],
);

export const medicalCertificates = sqliteTable(
  "medical_certificates",
  {
    id: text("id").primaryKey(),
    patientId: text("patient_id").notNull(),
    doctorName: text("doctor_name").notNull(),
    issuedOn: text("issued_on").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_medical_certificates_issued_on").on(table.issuedOn)],
);
