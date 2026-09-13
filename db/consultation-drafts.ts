import { env } from "cloudflare:workers";
import type {
  Consultation,
  SaveConsultationDraftResult,
  SavedConsultationDraft,
} from "../app/consultation-model";

type ConsultationDraftRow = {
  id: string;
  revision: number;
  consultation_json: string;
  created_at: string;
  updated_at: string;
};

async function ensureConsultationDraftsTable() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS consultation_drafts (
    id TEXT PRIMARY KEY NOT NULL,
    revision INTEGER NOT NULL,
    consultation_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
}

function toDraft(row: ConsultationDraftRow): SavedConsultationDraft {
  return {
    id: row.id,
    revision: row.revision,
    consultation: JSON.parse(row.consultation_json) as Consultation,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getConsultationDraft(id: string) {
  await ensureConsultationDraftsTable();
  const row = await env.DB.prepare(
    `SELECT id, revision, consultation_json, created_at, updated_at
     FROM consultation_drafts WHERE id = ?`,
  )
    .bind(id)
    .first<ConsultationDraftRow>();
  return row ? toDraft(row) : null;
}

export async function saveConsultationDraft(
  id: string,
  revision: number,
  consultation: Consultation,
): Promise<SaveConsultationDraftResult> {
  await ensureConsultationDraftsTable();
  const timestamp = new Date().toISOString();
  const result = await env.DB.prepare(
    `INSERT INTO consultation_drafts
       (id, revision, consultation_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       revision = excluded.revision,
       consultation_json = excluded.consultation_json,
       updated_at = excluded.updated_at
     WHERE excluded.revision > consultation_drafts.revision`,
  )
    .bind(id, revision, JSON.stringify(consultation), timestamp, timestamp)
    .run();
  const draft = await getConsultationDraft(id);
  if (!draft) throw new Error("Saved consultation draft could not be read.");
  return { accepted: result.meta.changes > 0, draft };
}
