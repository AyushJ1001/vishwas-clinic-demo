import http from "node:http";
import https from "node:https";

import {
  clinicSyncBatchLimit,
  clinicSyncDeviceKeyHeader,
  type ClinicRecordChange,
  type ConfirmedClinicRecordChange,
  type ConfirmedPhoneIssuedRecord,
  type PhoneIssuedRecord,
} from "../../app/sync-model";
import type { ClinicSyncStatus } from "../../app/clinic-pc";
import {
  consultationDraftsTableSql,
  medicalCertificateIndexesSql,
  medicalCertificatesTableSql,
  patientRecordIndexesSql,
  patientRecordsTableSql,
  patientRecordUpgradeColumns,
  phoneCollectionsTableSql,
} from "../../db/clinic-record-schema";
import type { LocalQuery } from "../shared/local-database-protocol";
import type { LocalDatabase } from "./local-database";

const defaultIntervalMs = 5_000;
const requestTimeoutMs = 5_000;
const sentRetentionDays = 7;

type OutboxRow = {
  entity_kind: ClinicRecordChange["entityKind"];
  record_id: string;
  record_json: string;
  recorded_at: string;
};

function query(sql: string, params: unknown[] = []): LocalQuery {
  return { sql, params, mode: "all" };
}

function responseBody(
  url: URL,
  deviceKey: string,
  body: string,
): Promise<string> {
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          [clinicSyncDeviceKeyHeader]: deviceKey,
        },
        timeout: requestTimeoutMs,
      },
      (response) => {
        let received = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          received += chunk;
          if (received.length > 1_000_000) request.destroy();
        });
        response.on("end", () => {
          if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) {
            reject(new Error(`The Cloud copy returned ${response.statusCode}.`));
            return;
          }
          resolve(received);
        });
      },
    );
    request.on("timeout", () => request.destroy());
    request.on("error", reject);
    request.end(body);
  });
}

function isConfirmation(value: unknown): value is ConfirmedClinicRecordChange {
  if (!value || typeof value !== "object") return false;
  const confirmation = value as Partial<ConfirmedClinicRecordChange>;
  return (
    typeof confirmation.entityKind === "string" &&
    typeof confirmation.recordId === "string" &&
    typeof confirmation.recordedAt === "string"
  );
}

function isPhoneIssuedRecord(value: unknown): value is PhoneIssuedRecord {
  if (!value || typeof value !== "object") return false;
  const phoneRecord = value as Partial<PhoneIssuedRecord>;
  return (
    (phoneRecord.entityKind === "patient" ||
      phoneRecord.entityKind === "prescription" ||
      phoneRecord.entityKind === "medical-certificate") &&
    typeof phoneRecord.recordId === "string" &&
    Boolean(phoneRecord.recordId) &&
    typeof phoneRecord.issuedAt === "string" &&
    Boolean(phoneRecord.record) &&
    typeof phoneRecord.record === "object" &&
    !Array.isArray(phoneRecord.record) &&
    phoneRecord.record.id === phoneRecord.recordId
  );
}

function recordValue(record: PhoneIssuedRecord, key: string) {
  const value = record.record[key];
  if (typeof value !== "string") {
    throw new TypeError(`Phone-issued ${record.entityKind} has no ${key}.`);
  }
  return value;
}

export class ClinicSync {
  private running = false;
  private stopped = true;
  private timer: NodeJS.Timeout | null = null;
  private readonly cloudAddress = process.env.CLINIC_CLOUD_URL?.trim() ?? "";
  private readonly deviceKey = process.env.CLINIC_SYNC_DEVICE_KEY ?? "";

  constructor(private readonly database: LocalDatabase) {}

  start() {
    this.stopped = false;
    const configuredInterval = Number(process.env.CLINIC_SYNC_INTERVAL_MS);
    const interval =
      Number.isSafeInteger(configuredInterval) && configuredInterval >= 50
        ? configuredInterval
        : defaultIntervalMs;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), interval);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  status(): ClinicSyncStatus {
    const countRow = this.database.query(
      query("SELECT COUNT(*) AS count FROM clinic_sync_outbox WHERE sent_at IS NULL"),
    ).rows[0] as { count?: number } | undefined;
    const state = this.database.query(
      query(
        "SELECT last_succeeded_at, last_failed_at FROM clinic_sync_state WHERE singleton = 1",
      ),
    ).rows[0] as
      | { last_succeeded_at: string | null; last_failed_at: string | null }
      | undefined;
    const setupIssue = !this.cloudAddress
      ? "cloud-address"
      : !this.deviceKey
        ? "device-key"
        : null;
    return {
      configured: setupIssue === null,
      setupIssue,
      pendingCount: Number(countRow?.count ?? 0),
      lastSucceededAt: state?.last_succeeded_at ?? null,
      lastFailedAt: state?.last_failed_at ?? null,
    };
  }

  private pendingChanges() {
    const result = this.database.query(
      query(
        `SELECT entity_kind, record_id, record_json, recorded_at
         FROM clinic_sync_outbox
         WHERE sent_at IS NULL
         ORDER BY recorded_at ASC, entity_kind ASC, record_id ASC
         LIMIT ?`,
        [clinicSyncBatchLimit],
      ),
    );
    return (result.rows as OutboxRow[]).map((row): ClinicRecordChange => ({
      entityKind: row.entity_kind,
      recordId: row.record_id,
      record: JSON.parse(row.record_json) as Record<string, unknown>,
      recordedAt: row.recorded_at,
    }));
  }

  private ensurePhoneCollectionTables() {
    this.database.query(query(patientRecordsTableSql));
    const patientColumns = this.database.query(
      query("PRAGMA table_info(patient_records)"),
    ).rows as { name: string }[];
    const names = new Set(patientColumns.map((column) => column.name));
    for (const column of patientRecordUpgradeColumns) {
      if (!names.has(column.name)) this.database.query(query(column.sql));
    }
    for (const sql of patientRecordIndexesSql) this.database.query(query(sql));
    this.database.query(query(consultationDraftsTableSql));
    this.database.query(query(medicalCertificatesTableSql));
    for (const sql of medicalCertificateIndexesSql) {
      this.database.query(query(sql));
    }
    this.database.query(query(phoneCollectionsTableSql));
  }

  private collectionStart(
    record: PhoneIssuedRecord,
    collectedAt: string,
    available: string,
    availableParams: unknown[],
  ) {
    return query(
      `INSERT OR IGNORE INTO clinic_phone_collections
         (entity_kind, record_id, issued_at, collected_at)
       SELECT ?, ?, ?, ? WHERE ${available}`,
      [
        record.entityKind,
        record.recordId,
        record.issuedAt,
        collectedAt,
        ...availableParams,
      ],
    );
  }

  private wasCollected(record: PhoneIssuedRecord) {
    return this.database.query(
      query(
        `SELECT 1 FROM clinic_phone_collections
         WHERE entity_kind = ? AND record_id = ? AND issued_at = ?`,
        [record.entityKind, record.recordId, record.issuedAt],
      ),
    ).rows.length > 0;
  }

  private collectPatient(record: PhoneIssuedRecord, collectedAt: string) {
    const value = record.record;
    const phone = recordValue(record, "phone").trim();
    const sameMobile = `replace(replace(replace(replace(trim(phone), ' ', ''), '-', ''), '(', ''), ')', '') =
      replace(replace(replace(replace(?, ' ', ''), '-', ''), '(', ''), ')', '')`;
    const [collection] = this.database.batch([
      this.collectionStart(
        record,
        collectedAt,
        "NOT EXISTS (SELECT 1 FROM patient_records WHERE id = ?)",
        [record.recordId],
      ),
      query(
        `INSERT OR IGNORE INTO patient_records
           (id, patient_number, name, name_normalized, date_of_birth,
            date_of_birth_estimated, sex, phone, source_draft_id,
            phone_issued, possible_duplicate, created_at, updated_at)
         SELECT ?, (SELECT COALESCE(MAX(patient_number) + 1, 1) FROM patient_records),
           ?, ?, ?, ?, ?, ?, ?, 1,
           CASE WHEN EXISTS (
             SELECT 1 FROM patient_records
             WHERE name_normalized = ? AND ? != '' AND ${sameMobile}
           ) THEN 1 ELSE 0 END,
           ?, ?
         WHERE changes() = 1`,
        [
          record.recordId,
          recordValue(record, "name"),
          recordValue(record, "nameNormalized"),
          recordValue(record, "dateOfBirth"),
          value.dateOfBirthEstimated ? 1 : 0,
          recordValue(record, "sex"),
          phone,
          typeof value.sourceDraftId === "string" ? value.sourceDraftId : null,
          recordValue(record, "nameNormalized"),
          phone,
          phone,
          recordValue(record, "createdAt"),
          recordValue(record, "updatedAt"),
        ],
      ),
      query(
        `UPDATE patient_records SET possible_duplicate = 1
         WHERE changes() = 1 AND id != ? AND name_normalized = ?
           AND ? != '' AND ${sameMobile}`,
        [
          record.recordId,
          recordValue(record, "nameNormalized"),
          phone,
          phone,
        ],
      ),
    ]);
    return collection.changes > 0;
  }

  private collectPrescription(record: PhoneIssuedRecord, collectedAt: string) {
    const value = record.record;
    const consultation = value.consultation;
    if (!consultation || typeof consultation !== "object" || Array.isArray(consultation)) {
      throw new TypeError("Phone-issued prescription has no consultation.");
    }
    const patient = (consultation as Record<string, unknown>).patient;
    if (!patient || typeof patient !== "object" || Array.isArray(patient)) {
      throw new TypeError("Phone-issued prescription has no Patient.");
    }
    const patientId = (patient as Record<string, unknown>).patientId;
    if (typeof patientId !== "string" || !patientId) {
      throw new TypeError("Phone-issued prescription has no Patient link.");
    }
    const snapshotJson = JSON.stringify(value);
    const consultationJson = JSON.stringify(consultation);
    const [collection] = this.database.batch([
      this.collectionStart(
        record,
        collectedAt,
        `NOT EXISTS (SELECT 1 FROM consultation_drafts WHERE id = ?)
          AND NOT EXISTS (
            SELECT 1 FROM consultation_drafts
            WHERE json_extract(completed_snapshot_json, '$.id') = ?
          )`,
        [recordValue(record, "draftId"), record.recordId],
      ),
      query(
        `INSERT INTO consultation_drafts
           (id, revision, consultation_json, lifecycle_status,
            completed_snapshot_json, created_at, updated_at)
         SELECT ?, ?,
           json_set(json(?), '$.patient.patientNumber',
             (SELECT patient_number FROM patient_records WHERE id = ?)),
           'completed',
           json_set(json(?), '$.consultation.patient.patientNumber',
             (SELECT patient_number FROM patient_records WHERE id = ?)),
           ?, ?
         WHERE changes() = 1
           AND NOT EXISTS (SELECT 1 FROM consultation_drafts WHERE id = ?)
           AND NOT EXISTS (
             SELECT 1 FROM consultation_drafts
             WHERE json_extract(completed_snapshot_json, '$.id') = ?
           )`,
        [
          recordValue(record, "draftId"),
          value.sourceRevision,
          consultationJson,
          patientId,
          snapshotJson,
          patientId,
          recordValue(record, "completedAt"),
          recordValue(record, "completedAt"),
          recordValue(record, "draftId"),
          record.recordId,
        ],
      ),
    ]);
    return collection.changes > 0;
  }

  private collectMedicalCertificate(
    record: PhoneIssuedRecord,
    collectedAt: string,
  ) {
    const value = record.record;
    const patient = value.patient;
    const doctor = value.doctor;
    if (!patient || typeof patient !== "object" || Array.isArray(patient)) {
      throw new TypeError("Phone-issued Medical certificate has no Patient.");
    }
    if (!doctor || typeof doctor !== "object" || Array.isArray(doctor)) {
      throw new TypeError("Phone-issued Medical certificate has no Author.");
    }
    const patientId = (patient as Record<string, unknown>).id;
    const doctorName = (doctor as Record<string, unknown>).name;
    if (typeof patientId !== "string" || typeof doctorName !== "string") {
      throw new TypeError("Phone-issued Medical certificate links are invalid.");
    }
    const [collection] = this.database.batch([
      this.collectionStart(
        record,
        collectedAt,
        "NOT EXISTS (SELECT 1 FROM medical_certificates WHERE id = ?)",
        [record.recordId],
      ),
      query(
        `INSERT INTO medical_certificates
           (id, patient_id, doctor_name, issued_on, snapshot_json, created_at)
         SELECT ?, ?, ?, ?,
           json_set(json(?), '$.patient.number',
             (SELECT patient_number FROM patient_records WHERE id = ?)),
           ?
         WHERE changes() = 1
           AND NOT EXISTS (SELECT 1 FROM medical_certificates WHERE id = ?)`,
        [
          record.recordId,
          patientId,
          doctorName,
          recordValue(record, "issuedOn"),
          JSON.stringify(value),
          patientId,
          recordValue(record, "createdAt"),
          record.recordId,
        ],
      ),
    ]);
    return collection.changes > 0;
  }

  private collectPhoneIssuedRecord(record: PhoneIssuedRecord) {
    const collectedAt = new Date().toISOString();
    let newlyCollected = false;
    switch (record.entityKind) {
      case "patient":
        newlyCollected = this.collectPatient(record, collectedAt);
        break;
      case "prescription":
        newlyCollected = this.collectPrescription(record, collectedAt);
        break;
      case "medical-certificate":
        newlyCollected = this.collectMedicalCertificate(record, collectedAt);
        break;
    }
    if (!this.wasCollected(record)) return null;
    return {
      confirmation: {
        entityKind: record.entityKind,
        recordId: record.recordId,
        issuedAt: record.issuedAt,
      } satisfies ConfirmedPhoneIssuedRecord,
      newlyCollected,
    };
  }

  private parseSyncResponse(raw: string) {
    const parsed = JSON.parse(raw) as {
      accepted?: unknown;
      collected?: unknown;
      phoneIssued?: unknown;
    };
    if (!Array.isArray(parsed.accepted) || !parsed.accepted.every(isConfirmation)) {
      throw new Error("The Cloud copy did not confirm the batch.");
    }
    const phoneIssued = parsed.phoneIssued ?? [];
    if (!Array.isArray(phoneIssued) || !phoneIssued.every(isPhoneIssuedRecord)) {
      throw new Error("The Cloud copy returned invalid Phone-issued records.");
    }
    return { accepted: parsed.accepted, collected: parsed.collected, phoneIssued };
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      this.dropOldSentRows();
      if (!this.cloudAddress || !this.deviceKey) return;
      const changes = this.pendingChanges();
      const endpoint = new URL("/api/sync", this.cloudAddress);
      const raw = await responseBody(
        endpoint,
        this.deviceKey,
        JSON.stringify({ changes, collected: [] }),
      );
      const parsed = this.parseSyncResponse(raw);
      if (this.stopped) return;
      const expected = new Set(
        changes.map(
          (change) =>
            `${change.entityKind}\u0000${change.recordId}\u0000${change.recordedAt}`,
        ),
      );
      const confirmed = parsed.accepted.filter((change) => {
        const key = `${change.entityKind}\u0000${change.recordId}\u0000${change.recordedAt}`;
        return expected.has(key);
      });
      const confirmedKeys = new Set(
        confirmed.map(
          (change) =>
            `${change.entityKind}\u0000${change.recordId}\u0000${change.recordedAt}`,
        ),
      );
      if (
        confirmedKeys.size !== changes.length ||
        [...expected].some((key) => !confirmedKeys.has(key))
      ) {
        throw new Error("The Cloud copy did not confirm every change.");
      }
      this.ensurePhoneCollectionTables();
      const collectionResults = parsed.phoneIssued
        .map((record) => this.collectPhoneIssuedRecord(record))
        .filter((record): record is NonNullable<typeof record> => record !== null);
      const collected = collectionResults.map((record) => record.confirmation);
      if (collected.length) {
        const confirmationRaw = await responseBody(
          endpoint,
          this.deviceKey,
          JSON.stringify({ changes: [], collected }),
        );
        const confirmation = this.parseSyncResponse(confirmationRaw);
        const returned = confirmation.collected;
        if (!Array.isArray(returned)) {
          throw new Error("The Cloud copy did not confirm collected records.");
        }
        const expectedCollected = new Set(
          collected.map(
            (record) =>
              `${record.entityKind}\u0000${record.recordId}\u0000${record.issuedAt}`,
          ),
        );
        const returnedCollected = new Set(
          returned.map((value) => {
            if (!value || typeof value !== "object") return "";
            const record = value as Partial<ConfirmedPhoneIssuedRecord>;
            return `${record.entityKind}\u0000${record.recordId}\u0000${record.issuedAt}`;
          }),
        );
        if (
          returnedCollected.size !== expectedCollected.size ||
          [...expectedCollected].some((key) => !returnedCollected.has(key))
        ) {
          throw new Error("The Cloud copy did not confirm collected records.");
        }
      }
      if (
        confirmed.length > 0 ||
        collectionResults.some((record) => record.newlyCollected)
      ) {
        const succeededAt = new Date().toISOString();
        this.database.batch([
          ...confirmed.map((change) =>
            query(
              `UPDATE clinic_sync_outbox SET sent_at = ?
               WHERE entity_kind = ? AND record_id = ? AND recorded_at = ?
                 AND sent_at IS NULL`,
              [succeededAt, change.entityKind, change.recordId, change.recordedAt],
            ),
          ),
          query(
            `UPDATE clinic_sync_state
             SET last_succeeded_at = ?, last_failed_at = NULL
             WHERE singleton = 1`,
            [succeededAt],
          ),
        ]);
      }
    } catch {
      if (this.stopped) return;
      const failedAt = new Date().toISOString();
      this.database.query(
        query(
          `UPDATE clinic_sync_state
           SET last_failed_at = COALESCE(last_failed_at, ?)
           WHERE singleton = 1`,
          [failedAt],
        ),
      );
    } finally {
      this.running = false;
    }
  }

  private dropOldSentRows() {
    this.database.query(
      query(
        `DELETE FROM clinic_sync_outbox
         WHERE sent_at IS NOT NULL
           AND julianday(sent_at) < julianday('now', ?)`,
        [`-${sentRetentionDays} days`],
      ),
    );
  }
}
