import http from "node:http";
import https from "node:https";

import {
  clinicSyncBatchLimit,
  clinicSyncDeviceKeyHeader,
  type ClinicRecordChange,
  type ConfirmedClinicRecordChange,
} from "../../app/sync-model";
import type { ClinicSyncStatus } from "../../app/clinic-pc";
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

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      this.dropOldSentRows();
      if (!this.cloudAddress || !this.deviceKey) return;
      const changes = this.pendingChanges();
      if (!changes.length) return;
      const endpoint = new URL("/api/sync", this.cloudAddress);
      const raw = await responseBody(
        endpoint,
        this.deviceKey,
        JSON.stringify({ changes }),
      );
      const parsed = JSON.parse(raw) as { accepted?: unknown };
      if (this.stopped) return;
      if (!Array.isArray(parsed.accepted) || !parsed.accepted.every(isConfirmation)) {
        throw new Error("The Cloud copy did not confirm the batch.");
      }
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
