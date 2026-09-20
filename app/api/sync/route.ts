import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";

import {
  clinicSyncBatchLimit,
  clinicSyncDeviceKeyHeader,
  type ClinicRecordChange,
} from "../../sync-model";
import { applyClinicRecordChanges, isClinicRecordChange } from "../../../db/sync";

const maxRequestBytes = 1_000_000;

async function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

async function authenticated(request: Request) {
  const expected =
    env.CLINIC_SYNC_DEVICE_KEY ?? process.env.CLINIC_SYNC_DEVICE_KEY;
  const provided = request.headers.get(clinicSyncDeviceKeyHeader) ?? "";
  if (!expected) return false;
  return constantTimeEqual(provided, expected);
}

export async function POST(request: Request) {
  if (!(await authenticated(request))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const declaredBytes = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredBytes) && declaredBytes > maxRequestBytes) {
    return NextResponse.json({ error: "Sync batch is too large" }, { status: 413 });
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxRequestBytes) {
    return NextResponse.json({ error: "Sync batch is too large" }, { status: 413 });
  }
  let body: { changes?: unknown } | null;
  try {
    body = JSON.parse(text || "null") as { changes?: unknown } | null;
  } catch {
    return NextResponse.json({ error: "The Sync batch is invalid" }, { status: 400 });
  }
  if (!body || !Array.isArray(body.changes) || body.changes.length === 0) {
    return NextResponse.json({ error: "Send a non-empty Sync batch" }, { status: 400 });
  }
  if (body.changes.length > clinicSyncBatchLimit) {
    return NextResponse.json(
      { error: `Sync at most ${clinicSyncBatchLimit} changes per request` },
      { status: 413 },
    );
  }
  if (!body.changes.every(isClinicRecordChange)) {
    return NextResponse.json({ error: "The Sync batch is invalid" }, { status: 400 });
  }
  const changes = body.changes as ClinicRecordChange[];
  await applyClinicRecordChanges(changes);
  return NextResponse.json({
    accepted: changes.map(({ entityKind, recordId, recordedAt }) => ({
      entityKind,
      recordId,
      recordedAt,
    })),
  });
}
