import { env } from "cloudflare:workers";
import type {
  CompletedPrescriptionSnapshot,
  Consultation,
  PriorVisitSnapshot,
  SaveConsultationDraftResult,
  SavedConsultationDraft,
} from "../app/consultation-model";
import { createCompletedPrescriptionSnapshot } from "../app/clinic-facts";
import { consultationFingerprint } from "../app/consultation-validation";
import { withCurrentPatientFields } from "../app/consultation-model";
import { consultationDraftsTableSql } from "./clinic-record-schema";
import { queuePhoneIssuedRecord } from "./sync";

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
  await env.DB.prepare(consultationDraftsTableSql).run();
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

function withCurrentSnapshotFields(
  snapshot: CompletedPrescriptionSnapshot,
): CompletedPrescriptionSnapshot {
  return {
    ...snapshot,
    consultation: withCurrentPatientFields(snapshot.consultation),
  };
}

function toDraft(row: ConsultationDraftRow): SavedConsultationDraft {
  return {
    id: row.id,
    revision: row.revision,
    consultation: withCurrentPatientFields(
      JSON.parse(row.consultation_json) as Consultation,
    ),
    lifecycle: row.lifecycle_status ?? "editing",
    completedSnapshot: row.completed_snapshot_json
      ? withCurrentSnapshotFields(
          JSON.parse(row.completed_snapshot_json) as CompletedPrescriptionSnapshot,
        )
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
  phoneIssued?: boolean;
};

async function keepPhoneIssuedPrescription(
  snapshot: CompletedPrescriptionSnapshot,
) {
  await queuePhoneIssuedRecord({
    entityKind: "prescription",
    recordId: snapshot.id,
    record: snapshot as unknown as Record<string, unknown>,
    issuedAt: snapshot.completedAt,
  });
}

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
  phoneIssued = false,
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
      if (phoneIssued) await keepPhoneIssuedPrescription(existing.completedSnapshot);
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

  const stored = await env.DB.prepare(
    "SELECT consultation_json FROM consultation_drafts WHERE id = ?",
  )
    .bind(id)
    .first<{ consultation_json: string }>();
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
      // Compared as stored: `existing` has had newer fields filled in.
      stored?.consultation_json ?? "",
    )
    .run();
  if (result.meta.changes > 0) {
    if (phoneIssued) await keepPhoneIssuedPrescription(snapshot);
    return snapshot;
  }

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
    if (phoneIssued) await keepPhoneIssuedPrescription(current.completedSnapshot);
    return current.completedSnapshot;
  }
  throw new ConsultationRevisionConflictError();
}

/** The patient's completed prescriptions, newest first, for follow-ups. */
export async function listCompletedPrescriptionsForPatient(
  patientId: string,
): Promise<PriorVisitSnapshot[]> {
  if (!patientId) return [];
  await ensureConsultationDraftsTable();
  const rows = await env.DB.prepare(
    `SELECT completed_snapshot_json FROM consultation_drafts
     WHERE lifecycle_status = 'completed'
       AND json_extract(completed_snapshot_json, '$.consultation.patient.patientId') = ?
     ORDER BY json_extract(completed_snapshot_json, '$.consultation.consultationDate') DESC,
       updated_at DESC
     LIMIT 50`,
  )
    .bind(patientId)
    .all<{ completed_snapshot_json: string }>();
  return rows.results.map((row) =>
    toPriorVisit(JSON.parse(row.completed_snapshot_json) as CompletedPrescriptionSnapshot),
  );
}

function toPriorVisit(snapshot: CompletedPrescriptionSnapshot): PriorVisitSnapshot {
  const { consultation } = snapshot;
  const summary = [
    consultation.provisionalDiagnosis,
    consultation.complaints.join(", "),
  ]
    .filter((part) => part.trim())
    .join("; ");
  return {
    id: snapshot.id,
    patientId: consultation.patient.patientId,
    patient: {
      name: consultation.patient.name,
      age: consultation.patient.age,
      sex: consultation.patient.sex,
    },
    consultationDate: consultation.consultationDate,
    doctorName: snapshot.doctor.name,
    clinicalSummary: summary || "No diagnosis recorded",
  };
}
