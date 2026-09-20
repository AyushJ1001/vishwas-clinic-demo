import Database from "better-sqlite3";
import { renameSync, rmSync } from "node:fs";
import type {
  LocalQuery,
  LocalQueryMode,
  LocalQueryResult,
} from "../shared/local-database-protocol";

type SqliteValue = string | number | bigint | Buffer | null;

function toSqliteValue(value: unknown): SqliteValue {
  if (value === undefined) {
    throw new TypeError("D1 does not accept undefined bind parameters.");
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return value as SqliteValue;
}

/**
 * The Clinic PC's master copy of Clinic records: one SQLite file on disk,
 * answered in the same result shapes Cloudflare D1 uses so the shared
 * `db/*` modules run unchanged on both sides.
 */
export class LocalDatabase {
  private db: Database.Database;

  private readonly installedOutboxTriggers = new Set<string>();

  constructor(readonly filePath: string) {
    this.db = LocalDatabase.open(filePath);
    this.installSyncOutbox();
  }

  private static open(filePath: string) {
    const db = new Database(filePath);
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = FULL");
    db.pragma("foreign_keys = ON");
    return db;
  }

  /** Writes a consistent copy of the live database to `destination`. */
  async backupTo(destination: string) {
    await this.db.backup(destination);
  }

  /**
   * Swaps the live database for `replacement`, a checked SQLite file.
   * The replacement file is moved, not copied.
   */
  replaceWith(replacement: string) {
    this.db.close();
    for (const suffix of ["-wal", "-shm"]) {
      rmSync(this.filePath + suffix, { force: true });
    }
    renameSync(replacement, this.filePath);
    this.db = LocalDatabase.open(this.filePath);
    this.installedOutboxTriggers.clear();
    this.installSyncOutbox();
  }

  query({ sql, params, mode }: LocalQuery): LocalQueryResult {
    const statement = this.db.prepare(sql);
    const values = params.map(toSqliteValue);
    const result = statement.reader
      ? this.read(statement, values, mode)
      : this.write(statement, values);
    if (createsTable.test(sql)) this.installSyncOutboxTriggers();
    return result;
  }

  batch(queries: LocalQuery[]): LocalQueryResult[] {
    return this.db.transaction(() =>
      queries.map((query) => this.query(query)),
    )();
  }

  close() {
    this.db.close();
  }

  private installSyncOutbox() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS clinic_sync_outbox (
        entity_kind TEXT NOT NULL,
        record_id TEXT NOT NULL,
        record_json TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        sent_at TEXT,
        PRIMARY KEY (entity_kind, record_id)
      );
      CREATE INDEX IF NOT EXISTS idx_clinic_sync_outbox_pending
        ON clinic_sync_outbox (sent_at, recorded_at);
      CREATE TABLE IF NOT EXISTS clinic_sync_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        last_succeeded_at TEXT,
        last_failed_at TEXT
      );
      INSERT OR IGNORE INTO clinic_sync_state (singleton) VALUES (1);
    `);
    this.installSyncOutboxTriggers();
  }

  /**
   * The Clinic record tables are created by the app itself, on first use, so
   * their shape is defined in one place only (`db/`). The triggers are put on
   * whichever of them exist now, and again after the app creates another.
   */
  private installSyncOutboxTriggers() {
    for (const source of syncOutboxSources) {
      if (this.installedOutboxTriggers.has(source.table)) continue;
      const exists = this.db
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(source.table);
      if (!exists) continue;
      try {
        this.db.exec(source.triggers);
        // An upgraded Clinic PC sends its current master copy, not only the
        // records changed after the upgrade was installed.
        this.db.exec(source.backfill);
      } catch {
        // A table made by an older Clinic PC gains its newer columns a moment
        // after it is opened, so this is tried again on the next write.
        continue;
      }
      this.installedOutboxTriggers.add(source.table);
    }
  }

  private read(
    statement: Database.Statement,
    values: SqliteValue[],
    mode: LocalQueryMode,
  ): LocalQueryResult {
    if (mode === "raw") {
      return {
        columns: statement.columns().map((column) => column.name),
        rows: statement.raw(true).all(...values) as unknown[][],
        changes: 0,
        lastRowId: 0,
      };
    }
    return {
      rows: statement.all(...values) as Record<string, unknown>[],
      changes: 0,
      lastRowId: 0,
    };
  }

  private write(
    statement: Database.Statement,
    values: SqliteValue[],
  ): LocalQueryResult {
    const info = statement.run(...values);
    return {
      rows: [],
      changes: info.changes,
      lastRowId: Number(info.lastInsertRowid),
    };
  }
}

const createsTable = /create\s+table/iu;

/** Where Clinic records are written, and how each reaches the outbox. */
const syncOutboxSources = [
  {
    table: 'patient_records',
    triggers: `CREATE TRIGGER IF NOT EXISTS clinic_sync_patient_insert
      AFTER INSERT ON patient_records BEGIN
        INSERT INTO clinic_sync_outbox
          (entity_kind, record_id, record_json, recorded_at, sent_at)
        VALUES (
          'patient', NEW.id,
          json_object(
            'id', NEW.id,
            'patientNumber', NEW.patient_number,
            'name', NEW.name,
            'nameNormalized', NEW.name_normalized,
            'dateOfBirth', NEW.date_of_birth,
            'dateOfBirthEstimated',
              CASE WHEN NEW.date_of_birth_estimated = 1 THEN json('true') ELSE json('false') END,
            'sex', NEW.sex,
            'phone', NEW.phone,
            'sourceDraftId', NEW.source_draft_id,
            'createdAt', NEW.created_at,
            'updatedAt', NEW.updated_at
          ),
          NEW.updated_at, NULL
        )
        ON CONFLICT(entity_kind, record_id) DO UPDATE SET
          record_json = excluded.record_json,
          recorded_at = CASE
            WHEN excluded.recorded_at > clinic_sync_outbox.recorded_at
              THEN excluded.recorded_at
            ELSE strftime(
              '%Y-%m-%dT%H:%M:%fZ',
              clinic_sync_outbox.recorded_at,
              '+0.001 seconds'
            )
          END,
          sent_at = NULL;
      END;

      CREATE TRIGGER IF NOT EXISTS clinic_sync_patient_update
      AFTER UPDATE ON patient_records BEGIN
        INSERT INTO clinic_sync_outbox
          (entity_kind, record_id, record_json, recorded_at, sent_at)
        VALUES (
          'patient', NEW.id,
          json_object(
            'id', NEW.id,
            'patientNumber', NEW.patient_number,
            'name', NEW.name,
            'nameNormalized', NEW.name_normalized,
            'dateOfBirth', NEW.date_of_birth,
            'dateOfBirthEstimated',
              CASE WHEN NEW.date_of_birth_estimated = 1 THEN json('true') ELSE json('false') END,
            'sex', NEW.sex,
            'phone', NEW.phone,
            'sourceDraftId', NEW.source_draft_id,
            'createdAt', NEW.created_at,
            'updatedAt', NEW.updated_at
          ),
          NEW.updated_at, NULL
        )
        ON CONFLICT(entity_kind, record_id) DO UPDATE SET
          record_json = excluded.record_json,
          recorded_at = CASE
            WHEN excluded.recorded_at > clinic_sync_outbox.recorded_at
              THEN excluded.recorded_at
            ELSE strftime(
              '%Y-%m-%dT%H:%M:%fZ',
              clinic_sync_outbox.recorded_at,
              '+0.001 seconds'
            )
          END,
          sent_at = NULL;
      END;`,
    backfill: `INSERT OR IGNORE INTO clinic_sync_outbox
        (entity_kind, record_id, record_json, recorded_at, sent_at)
      SELECT 'patient', id,
        json_object(
          'id', id,
          'patientNumber', patient_number,
          'name', name,
          'nameNormalized', name_normalized,
          'dateOfBirth', date_of_birth,
          'dateOfBirthEstimated',
            CASE WHEN date_of_birth_estimated = 1 THEN json('true') ELSE json('false') END,
          'sex', sex,
          'phone', phone,
          'sourceDraftId', source_draft_id,
          'createdAt', created_at,
          'updatedAt', updated_at
        ), updated_at, NULL
      FROM patient_records;`,
  },
  {
    table: 'consultation_drafts',
    triggers: `CREATE TRIGGER IF NOT EXISTS clinic_sync_prescription_update
      AFTER UPDATE OF lifecycle_status, completed_snapshot_json ON consultation_drafts
      WHEN NEW.lifecycle_status = 'completed' AND NEW.completed_snapshot_json IS NOT NULL
      BEGIN
        INSERT INTO clinic_sync_outbox
          (entity_kind, record_id, record_json, recorded_at, sent_at)
        VALUES (
          'prescription', json_extract(NEW.completed_snapshot_json, '$.id'),
          NEW.completed_snapshot_json, NEW.updated_at, NULL
        )
        ON CONFLICT(entity_kind, record_id) DO UPDATE SET
          record_json = excluded.record_json,
          recorded_at = excluded.recorded_at,
          sent_at = NULL;
      END;`,
    backfill: `INSERT OR IGNORE INTO clinic_sync_outbox
        (entity_kind, record_id, record_json, recorded_at, sent_at)
      SELECT 'prescription', json_extract(completed_snapshot_json, '$.id'),
        completed_snapshot_json, updated_at, NULL
      FROM consultation_drafts
      WHERE lifecycle_status = 'completed' AND completed_snapshot_json IS NOT NULL;`,
  },
  {
    table: 'receipts',
    triggers: `CREATE TRIGGER IF NOT EXISTS clinic_sync_receipt_insert
      AFTER INSERT ON receipts BEGIN
        INSERT INTO clinic_sync_outbox
          (entity_kind, record_id, record_json, recorded_at, sent_at)
        VALUES ('receipt', NEW.id, NEW.snapshot_json, NEW.created_at, NULL)
        ON CONFLICT(entity_kind, record_id) DO UPDATE SET
          record_json = excluded.record_json,
          recorded_at = excluded.recorded_at,
          sent_at = NULL;
      END;`,
    backfill: `INSERT OR IGNORE INTO clinic_sync_outbox
        (entity_kind, record_id, record_json, recorded_at, sent_at)
      SELECT 'receipt', id, snapshot_json, created_at, NULL FROM receipts;`,
  },
  {
    table: 'medical_certificates',
    triggers: `CREATE TRIGGER IF NOT EXISTS clinic_sync_certificate_insert
      AFTER INSERT ON medical_certificates BEGIN
        INSERT INTO clinic_sync_outbox
          (entity_kind, record_id, record_json, recorded_at, sent_at)
        VALUES ('medical-certificate', NEW.id, NEW.snapshot_json, NEW.created_at, NULL)
        ON CONFLICT(entity_kind, record_id) DO UPDATE SET
          record_json = excluded.record_json,
          recorded_at = excluded.recorded_at,
          sent_at = NULL;
      END;`,
    backfill: `INSERT OR IGNORE INTO clinic_sync_outbox
        (entity_kind, record_id, record_json, recorded_at, sent_at)
      SELECT 'medical-certificate', id, snapshot_json, created_at, NULL
      FROM medical_certificates;`,
  },
  {
    table: 'catalog_entries',
    triggers: `CREATE TRIGGER IF NOT EXISTS clinic_sync_catalog_insert
      AFTER INSERT ON catalog_entries BEGIN
        INSERT INTO clinic_sync_outbox
          (entity_kind, record_id, record_json, recorded_at, sent_at)
        VALUES (
          'catalog-entry', NEW.record_id,
          json_object(
            'id', NEW.record_id,
            'catalog', NEW.catalog,
            'groupName', NEW.group_name,
            'itemName', NEW.item_name,
            'createdAt', NEW.created_at
          ),
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL
        )
        ON CONFLICT(entity_kind, record_id) DO UPDATE SET
          record_json = excluded.record_json,
          recorded_at = excluded.recorded_at,
          sent_at = NULL;
      END;`,
    backfill: `INSERT OR IGNORE INTO clinic_sync_outbox
        (entity_kind, record_id, record_json, recorded_at, sent_at)
      SELECT 'catalog-entry', record_id,
        json_object(
          'id', record_id,
          'catalog', catalog,
          'groupName', group_name,
          'itemName', item_name,
          'createdAt', created_at
        ), strftime('%Y-%m-%dT%H:%M:%fZ', created_at), NULL
      FROM catalog_entries;`,
  },
];
