import { env } from "cloudflare:workers";
import type {
  CompletedPrescriptionSnapshot,
  Consultation,
  SaveConsultationDraftResult,
  SavedConsultationDraft,
} from "../app/consultation-model";
import { createCompletedPrescriptionSnapshot } from "../app/clinic-facts";
import { consultationFingerprint } from "../app/consultation-validation";

type ConsultationDraftRow = {
  id: string;
  revision: number;
  consultation_json: string;
  lifecycle_status: "editing" | "completed";
  completed_snapshot_json: string | null;
  created_at: string;
  updated_at: string;
};

async function ensureConsultationDraftsTable() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS consultation_drafts (
    id TEXT PRIMARY KEY NOT NULL,
    revision INTEGER NOT NULL,
    consultation_json TEXT NOT NULL,
    lifecycle_status TEXT NOT NULL DEFAULT 'editing',
    completed_snapshot_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
  const columns = await env.DB.prepare(
    "PRAGMA table_info(consultation_drafts)",
  ).all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  if (!names.has("lifecycle_status")) {
    await env.DB.prepare(
      "ALTER TABLE consultation_drafts ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'editing'",
    ).run();
  }
  if (!names.has("completed_snapshot_json")) {
    await env.DB.prepare(
      "ALTER TABLE consultation_drafts ADD COLUMN completed_snapshot_json TEXT",
    ).run();
  }
}

function toDraft(row: ConsultationDraftRow): SavedConsultationDraft {
  return {
    id: row.id,
    revision: row.revision,
    consultation: JSON.parse(row.consultation_json) as Consultation,
    lifecycle: row.lifecycle_status ?? "editing",
    completedSnapshot: row.completed_snapshot_json
      ? (JSON.parse(row.completed_snapshot_json) as CompletedPrescriptionSnapshot)
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getConsultationDraft(id: string) {
  await ensureConsultationDraftsTable();
  const row = await env.DB.prepare(
    `SELECT id, revision, consultation_json, lifecycle_status,
       completed_snapshot_json, created_at, updated_at
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
     WHERE excluded.revision > consultation_drafts.revision
       AND consultation_drafts.lifecycle_status = 'editing'`,
  )
    .bind(id, revision, JSON.stringify(consultation), timestamp, timestamp)
    .run();
  const draft = await getConsultationDraft(id);
  if (!draft) throw new Error("Saved consultation draft could not be read.");
  if (draft.lifecycle === "completed") throw new ConsultationCompletedError();
  return { accepted: result.meta.changes > 0, draft };
}

export class ConsultationCompletedError extends Error {
  constructor() {
    super("Completed prescriptions cannot be edited.");
  }
}

export class ConsultationRevisionConflictError extends Error {
  constructor(message = "The saved draft differs from this review.") {
    super(message);
  }
}

type CompleteConsultationDraftRequest = {
  id: string;
  expectedRevision: number;
  expectedConsultation: Consultation;
  consultation: Consultation;
};

function snapshotMatchesReview(
  snapshot: CompletedPrescriptionSnapshot,
  expectedRevision: number,
  expectedFingerprint: string,
) {
  return (
    snapshot.sourceRevision === expectedRevision &&
    consultationFingerprint(snapshot.consultation) === expectedFingerprint
  );
}

export async function completeConsultationDraft({
  id,
  expectedRevision,
  expectedConsultation,
  consultation,
}: CompleteConsultationDraftRequest) {
  await ensureConsultationDraftsTable();
  const expectedFingerprint = consultationFingerprint(expectedConsultation);
  const existing = await getConsultationDraft(id);
  if (!existing) return null;
  if (existing.lifecycle === "completed" && existing.completedSnapshot) {
    if (
      snapshotMatchesReview(
        existing.completedSnapshot,
        expectedRevision,
        expectedFingerprint,
      )
    ) {
      return existing.completedSnapshot;
    }
    throw new ConsultationRevisionConflictError(
      "The completed prescription differs from this review.",
    );
  }
  if (
    existing.revision !== expectedRevision ||
    consultationFingerprint(existing.consultation) !== expectedFingerprint ||
    consultationFingerprint(consultation) !== expectedFingerprint
  ) {
    throw new ConsultationRevisionConflictError();
  }

  const completedAt = new Date().toISOString();
  const snapshot = createCompletedPrescriptionSnapshot(
    id,
    expectedRevision,
    consultation,
    completedAt,
    `prescription-${crypto.randomUUID()}`,
  );
  const result = await env.DB.prepare(
    `UPDATE consultation_drafts
     SET lifecycle_status = 'completed', completed_snapshot_json = ?, updated_at = ?
     WHERE id = ? AND revision = ? AND consultation_json = ?
       AND lifecycle_status = 'editing'`,
  )
    .bind(
      JSON.stringify(snapshot),
      completedAt,
      id,
      expectedRevision,
      JSON.stringify(existing.consultation),
    )
    .run();
  if (result.meta.changes > 0) return snapshot;

  const current = await getConsultationDraft(id);
  if (
    current?.lifecycle === "completed" &&
    current.completedSnapshot &&
    snapshotMatchesReview(
      current.completedSnapshot,
      expectedRevision,
      expectedFingerprint,
    )
  ) {
    return current.completedSnapshot;
  }
  throw new ConsultationRevisionConflictError();
}
