import { env } from "cloudflare:workers";
import type {
  ConsultationPatient,
  PatientImportSummary,
  PatientRecord,
} from "../app/consultation-model";
import {
  ageOn,
  estimatedDateOfBirth,
  toLocalDateInputValue,
} from "../app/consultation-model";
import type { ParsedPatientRow } from "../app/patient-import";
import {
  isValidPatientInput,
  normalizePatientName,
} from "../app/patient-import";
import { addMissingColumns } from "./add-column";
import {
  patientRecordIndexesSql,
  patientRecordsTableSql,
  patientRecordUpgradeColumns,
} from "./clinic-record-schema";
import { queuePhoneIssuedRecord } from "./sync";

// ADR 0003: a Patient has a globally unique id and, separately, the
// sequential Patient number the clinic uses. Two patients with the same name
// are never merged automatically.

type PatientRow = {
  id: string;
  patient_number: number | null;
  name: string;
  date_of_birth: string;
  date_of_birth_estimated: number;
  sex: string;
  phone: string;
  phone_issued: number;
  possible_duplicate: number;
};

const columns = `id, patient_number, name, date_of_birth,
  date_of_birth_estimated, sex, phone, phone_issued, possible_duplicate`;
const searchLimit = 8;

function today() {
  return toLocalDateInputValue(new Date());
}

async function ensurePatientsTable() {
  const db = env.DB;
  await db.batch([
    db.prepare(patientRecordsTableSql),
    ...patientRecordIndexesSql.map((sql) => db.prepare(sql)),
  ]);
  await addMissingColumns(db, "patient_records", patientRecordUpgradeColumns);
  await migrateLegacyPatients();
}

// The first version kept patients in `patients`, keyed by an autoincrement id
// that doubled as the patient number, with an age instead of a birth date.
async function migrateLegacyPatients() {
  const legacy = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'patients'",
  ).first();
  if (!legacy) return;
  const existing = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM patient_records",
  ).first<{ count: number }>();
  if (existing && existing.count > 0) return;
  const rows = await env.DB.prepare(
    "SELECT id, name, age, sex, phone, created_at, updated_at FROM patients ORDER BY id",
  ).all<{
    id: number;
    name: string;
    age: string;
    sex: string;
    phone: string;
    created_at: string;
    updated_at: string;
  }>();
  if (!rows.results.length) return;
  await env.DB.batch(
    rows.results.map((row) => {
      const dateOfBirth = estimatedDateOfBirth(
        row.age,
        row.created_at.slice(0, 10),
      );
      return env.DB.prepare(
        `INSERT INTO patient_records (id, patient_number, name, name_normalized,
           date_of_birth, date_of_birth_estimated, sex, phone, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        row.id,
        row.name,
        normalizePatientName(row.name),
        dateOfBirth,
        dateOfBirth ? 1 : 0,
        row.sex,
        row.phone,
        row.created_at,
        row.updated_at,
      );
    }),
  );
}

function toSex(value: string): PatientRecord["sex"] {
  return value === "Female" || value === "Male" ? value : "Other";
}

function toPatientRecord(row: PatientRow): PatientRecord {
  return {
    id: row.id,
    number: row.patient_number,
    name: row.name,
    dateOfBirth: row.date_of_birth,
    dateOfBirthEstimated: row.date_of_birth_estimated === 1,
    age: ageOn(row.date_of_birth, today()),
    sex: toSex(row.sex),
    phone: row.phone,
    phoneIssued: row.phone_issued === 1,
    possibleDuplicate: row.possible_duplicate === 1,
  };
}

export async function searchPatients(
  query: string,
  limit = searchLimit,
): Promise<PatientRecord[]> {
  await ensurePatientsTable();
  const normalized = normalizePatientName(query);
  if (!normalized) {
    const recent = await env.DB.prepare(
      `SELECT ${columns} FROM patient_records
       ORDER BY updated_at DESC, patient_number DESC
       LIMIT ?`,
    )
      .bind(limit)
      .all<PatientRow>();
    return recent.results.map(toPatientRecord);
  }
  // instr() rather than LIKE: D1 refuses long LIKE patterns, and a name
  // needs no wildcard escaping this way.
  const digits = /^\d+$/.test(normalized) ? Number(normalized) : -1;
  const phoneDigits = normalized.replace(/\D/gu, "");
  const result = await env.DB.prepare(
    `SELECT ${columns} FROM patient_records
     WHERE patient_number = ?
       OR instr(name_normalized, ?) > 0
       OR (length(?) >= 4 AND instr(replace(phone, ' ', ''), ?) > 0)
     ORDER BY patient_number = ? DESC,
       instr(name_normalized, ?) = 1 DESC,
       name_normalized ASC
     LIMIT ?`,
  )
    .bind(digits, normalized, phoneDigits, phoneDigits, digits, normalized, limit)
    .all<PatientRow>();
  return result.results.map(toPatientRecord);
}

export async function getPatient(id: string) {
  await ensurePatientsTable();
  const row = await env.DB.prepare(
    `SELECT ${columns} FROM patient_records WHERE id = ?`,
  )
    .bind(id)
    .first<PatientRow>();
  return row ? toPatientRecord(row) : null;
}

type NewPatient = {
  number?: number;
  name: string;
  dateOfBirth: string;
  dateOfBirthEstimated: boolean;
  sex: string;
  phone: string;
  sourceDraftId?: string;
  phoneIssued?: boolean;
};

// The next Patient number is worked out inside the insert itself, so two
// registrations can never be given the same number.
async function insertPatient(patient: NewPatient) {
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO patient_records (id, patient_number, name, name_normalized,
       date_of_birth, date_of_birth_estimated, sex, phone, source_draft_id,
       phone_issued, possible_duplicate, created_at, updated_at)
     SELECT ?, CASE WHEN ? = 1 THEN NULL
       ELSE COALESCE(?, MAX(patient_number) + 1, 1) END,
       ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?
     FROM patient_records`,
  )
    .bind(
      id,
      patient.phoneIssued ? 1 : 0,
      patient.number ?? null,
      patient.name.trim(),
      normalizePatientName(patient.name),
      patient.dateOfBirth,
      patient.dateOfBirthEstimated ? 1 : 0,
      toSex(patient.sex),
      patient.phone.trim(),
      patient.sourceDraftId ?? null,
      patient.phoneIssued ? 1 : 0,
      timestamp,
      timestamp,
    )
    .run();
  const saved = (await getPatient(id))!;
  if (patient.phoneIssued) {
    await queuePhoneIssuedRecord({
      entityKind: "patient",
      recordId: id,
      issuedAt: timestamp,
      record: {
        id,
        patientNumber: null,
        name: saved.name,
        nameNormalized: normalizePatientName(saved.name),
        dateOfBirth: saved.dateOfBirth,
        dateOfBirthEstimated: saved.dateOfBirthEstimated,
        sex: saved.sex,
        phone: saved.phone,
        sourceDraftId: patient.sourceDraftId ?? null,
        phoneIssued: true,
        possibleDuplicate: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
  }
  return saved;
}

/**
 * Saves the patient a prescription is being completed for: new patients are
 * registered once; the Clinic PC gives them the next Patient number, while
 * the Cloud copy leaves it pending. A chosen Clinic record is brought up to
 * date only on the Clinic PC.
 */
export async function savePatientForConsultation(
  patient: ConsultationPatient,
  consultationDate: string,
  draftId: string,
  options: { phoneIssued?: boolean } = {},
): Promise<PatientRecord> {
  await ensurePatientsTable();
  const typedBirthDate = patient.dateOfBirth;
  const estimatedBirthDate = typedBirthDate
    ? ""
    : estimatedDateOfBirth(patient.age.trim(), consultationDate);
  const saved = patient.patientId ? await getPatient(patient.patientId) : null;
  if (saved) {
    // A phone may select a Clinic record, but the Cloud copy never turns its
    // typed details into an edit of the Clinic PC's record.
    if (options.phoneIssued) return saved;
    // An estimated birth date is only replaced when the age has changed.
    const keepsEstimate =
      !typedBirthDate &&
      saved.dateOfBirth &&
      ageOn(saved.dateOfBirth, consultationDate) === patient.age.trim();
    const dateOfBirth =
      typedBirthDate || (keepsEstimate ? saved.dateOfBirth : estimatedBirthDate);
    const dateOfBirthEstimated = typedBirthDate
      ? false
      : keepsEstimate
        ? saved.dateOfBirthEstimated
        : Boolean(estimatedBirthDate);
    await env.DB.prepare(
      `UPDATE patient_records SET name = ?, name_normalized = ?, date_of_birth = ?,
         date_of_birth_estimated = ?, sex = ?,
         phone = CASE WHEN ? != '' THEN ? ELSE phone END, updated_at = ?
       WHERE id = ?`,
    )
      .bind(
        patient.name.trim(),
        normalizePatientName(patient.name),
        dateOfBirth,
        dateOfBirthEstimated ? 1 : 0,
        patient.sex,
        patient.phone.trim(),
        patient.phone.trim(),
        new Date().toISOString(),
        saved.id,
      )
      .run();
    return (await getPatient(saved.id))!;
  }
  const findRegistered = async () => {
    const row = await env.DB.prepare(
      `SELECT ${columns} FROM patient_records WHERE source_draft_id = ?`,
    )
      .bind(draftId)
      .first<PatientRow>();
    return row ? toPatientRecord(row) : null;
  };
  const registered = await findRegistered();
  if (registered) return registered;
  try {
    return await insertPatient({
      name: patient.name,
      dateOfBirth: typedBirthDate || estimatedBirthDate,
      dateOfBirthEstimated: !typedBirthDate && Boolean(estimatedBirthDate),
      sex: patient.sex,
      phone: patient.phone,
      sourceDraftId: draftId,
      phoneIssued: options.phoneIssued,
    });
  } catch (error) {
    // A simultaneous completion of the same draft registered them first.
    const raced = await findRegistered();
    if (raced) return raced;
    throw error;
  }
}

async function importPatientRow(
  row: ParsedPatientRow,
): Promise<"imported" | "updated" | "unchanged"> {
  const dateOfBirth = row.dateOfBirth || estimatedDateOfBirth(row.age, today());
  const estimated = !row.dateOfBirth && Boolean(dateOfBirth);
  if (row.number) {
    // ADR 0003: an Imported patient keeps the number from the old system, so
    // a row naming an existing number updates that same patient.
    const existing = await env.DB.prepare(
      `SELECT ${columns} FROM patient_records WHERE patient_number = ?`,
    )
      .bind(Number(row.number))
      .first<PatientRow>();
    if (existing) {
      await env.DB.prepare(
        `UPDATE patient_records SET name = ?, name_normalized = ?,
           date_of_birth = CASE WHEN ? != '' THEN ? ELSE date_of_birth END,
           date_of_birth_estimated = CASE WHEN ? != '' THEN ? ELSE date_of_birth_estimated END,
           sex = CASE WHEN ? != '' THEN ? ELSE sex END,
           phone = CASE WHEN ? != '' THEN ? ELSE phone END,
           updated_at = ?
         WHERE id = ?`,
      )
        .bind(
          row.name.trim(),
          normalizePatientName(row.name),
          dateOfBirth,
          dateOfBirth,
          dateOfBirth,
          estimated ? 1 : 0,
          row.sex,
          row.sex,
          row.phone,
          row.phone,
          new Date().toISOString(),
          existing.id,
        )
        .run();
      return "updated";
    }
  } else {
    // Without a number, only an identical row counts as already saved, so
    // importing the same list twice does not register everyone twice.
    const identical = await env.DB.prepare(
      `SELECT id FROM patient_records
       WHERE name_normalized = ? AND phone = ? AND sex = ?
         AND (date_of_birth = ? OR (? = '' AND date_of_birth = ''))`,
    )
      .bind(
        normalizePatientName(row.name),
        row.phone,
        toSex(row.sex),
        dateOfBirth,
        dateOfBirth,
      )
      .first();
    if (identical) return "unchanged";
  }
  await insertPatient({
    number: row.number ? Number(row.number) : undefined,
    name: row.name,
    dateOfBirth,
    dateOfBirthEstimated: estimated,
    sex: row.sex,
    phone: row.phone,
  });
  return "imported";
}

export async function importPatients(
  rows: unknown[],
): Promise<PatientImportSummary> {
  await ensurePatientsTable();
  const summary: PatientImportSummary = {
    requested: rows.length,
    imported: 0,
    updated: 0,
    skipped: 0,
    problems: [],
  };
  for (const [index, row] of rows.entries()) {
    if (!isValidPatientInput(row)) {
      summary.skipped += 1;
      summary.problems.push(
        `Row ${index + 1}: missing or invalid name, number, age, date of birth, sex, or phone.`,
      );
      continue;
    }
    const outcome = await importPatientRow(row);
    if (outcome === "imported") summary.imported += 1;
    else if (outcome === "updated") summary.updated += 1;
    else summary.skipped += 1;
  }
  return summary;
}
