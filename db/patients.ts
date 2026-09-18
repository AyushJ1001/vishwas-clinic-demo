import { env } from "cloudflare:workers";
import type { PatientRecord } from "../app/consultation-model";
import type { ParsedPatientRow } from "../app/patient-import";
import {
  isValidPatientInput,
  normalizePatientName,
} from "../app/patient-import";
import type { PatientImportSummary } from "../app/consultation-model";

type PatientRow = {
  id: number;
  name: string;
  age: string;
  sex: string;
  phone: string;
};

const searchLimit = 8;

async function ensurePatientsTable() {
  const db = env.DB;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      name_normalized TEXT NOT NULL,
      age TEXT NOT NULL DEFAULT '',
      sex TEXT NOT NULL DEFAULT 'Other',
      phone TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_patients_name_normalized ON patients (name_normalized)",
    ),
  ]);
}

function toPatientRecord(row: PatientRow): PatientRecord {
  return {
    id: row.id,
    name: row.name,
    age: row.age,
    sex: (row.sex === "Female" || row.sex === "Male"
      ? row.sex
      : "Other") as PatientRecord["sex"],
    phone: row.phone,
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
      `SELECT id, name, age, sex, phone FROM patients
       ORDER BY updated_at DESC, id DESC
       LIMIT ?`,
    )
      .bind(limit)
      .all<PatientRow>();
    return recent.results.map(toPatientRecord);
  }
  const prefix = normalized.replace(/[%_]/gu, "");
  const result = await env.DB.prepare(
    `SELECT id, name, age, sex, phone FROM patients
     WHERE name_normalized LIKE '%' || ? || '%'
     ORDER BY (name_normalized LIKE ? || '%') DESC, name_normalized ASC
     LIMIT ?`,
  )
    .bind(prefix, prefix, limit)
    .all<PatientRow>();
  return result.results.map(toPatientRecord);
}

async function findPatientByName(name: string) {
  return env.DB.prepare(
    "SELECT id, name, age, sex, phone FROM patients WHERE name_normalized = ?",
  )
    .bind(normalizePatientName(name))
    .first<PatientRow & { name_normalized?: string }>();
}

export async function upsertPatient(
  input: ParsedPatientRow,
): Promise<{ record: PatientRecord; created: boolean }> {
  await ensurePatientsTable();
  const name = input.name.trim();
  const timestamp = new Date().toISOString();
  const existing = await findPatientByName(name);
  if (existing) {
    await env.DB.prepare(
      `UPDATE patients SET
         age = CASE WHEN ? != '' THEN ? ELSE age END,
         sex = CASE WHEN ? != '' THEN ? ELSE sex END,
         phone = CASE WHEN ? != '' THEN ? ELSE phone END,
         name = ?,
         updated_at = ?
       WHERE id = ?`,
    )
      .bind(
        input.age,
        input.age,
        input.sex,
        input.sex,
        input.phone,
        input.phone,
        existing.name,
        timestamp,
        existing.id,
      )
      .run();
    return {
      record: toPatientRecord({
        id: existing.id,
        name: existing.name,
        age: input.age || existing.age,
        sex: input.sex || existing.sex,
        phone: input.phone || existing.phone,
      }),
      created: false,
    };
  }
  const result = await env.DB.prepare(
    `INSERT INTO patients (name, name_normalized, age, sex, phone, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      name,
      normalizePatientName(name),
      input.age,
      input.sex,
      input.phone,
      timestamp,
      timestamp,
    )
    .run();
  return {
    record: {
      id: Number(result.meta.last_row_id),
      name,
      age: input.age,
      sex: input.sex,
      phone: input.phone,
    },
    created: true,
  };
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
        `Row ${index + 1}: missing or invalid name, age, sex, or phone.`,
      );
      continue;
    }
    const { created } = await upsertPatient(row);
    if (created) summary.imported += 1;
    else summary.updated += 1;
  }
  return summary;
}
