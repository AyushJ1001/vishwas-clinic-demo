import { env } from "cloudflare:workers";

import { clinicSyncDeviceKeyHeader } from "../../sync-model";

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

/** Whether this request carries the Clinic PC's device key (ADR 0004). */
export async function fromClinicPc(request: Request) {
  const expected =
    env.CLINIC_SYNC_DEVICE_KEY ?? process.env.CLINIC_SYNC_DEVICE_KEY;
  const provided = request.headers.get(clinicSyncDeviceKeyHeader) ?? "";
  if (!expected) return false;
  return constantTimeEqual(provided, expected);
}
