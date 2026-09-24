import { expect, test } from "@playwright/test";

import {
  emptyConsultationPatient,
  type Consultation,
} from "../../app/consultation-model";
import { sampleConsultation, todayInIndia, uniqueSuffix } from "./fixtures";

const deviceKey = "clinic-sync-e2e-device-key";
const deviceKeyHeader = { "X-Clinic-Device-Key": deviceKey };

function patientChange(
  id: string,
  name: string,
  recordedAt: string,
) {
  return {
    entityKind: "patient",
    recordId: id,
    recordedAt,
    record: {
      id,
      patientNumber: 910_000_000 + Math.floor(Math.random() * 9_000_000),
      name,
      nameNormalized: name.toLocaleLowerCase(),
      dateOfBirth: "1985-02-03",
      dateOfBirthEstimated: false,
      sex: "Female",
      phone: "98765 43210",
      sourceDraftId: null,
      createdAt: "2026-09-20T10:00:00.000Z",
      updatedAt: recordedAt,
    },
  };
}

test("the Clinic PC sync endpoint accepts a batch and applying it twice is idempotent", async ({
  request,
}) => {
  const suffix = uniqueSuffix();
  const id = `sync-patient-${suffix}`;
  const name = `Sync Patient ${suffix}`;
  const body = {
    changes: [patientChange(id, name, "2026-09-20T10:01:00.000Z")],
  };

  const first = await request.post("/api/sync", {
    headers: deviceKeyHeader,
    data: body,
  });
  expect(first.ok(), await first.text()).toBe(true);

  const retry = await request.post("/api/sync", {
    headers: deviceKeyHeader,
    data: body,
  });
  expect(retry.ok(), await retry.text()).toBe(true);

  const found = await request.get(`/api/patients?q=${encodeURIComponent(name)}`);
  const patients = (await found.json()) as { patients: { id: string; name: string }[] };
  expect(patients.patients.filter((patient) => patient.id === id)).toEqual([
    expect.objectContaining({ id, name }),
  ]);
});

test("the Clinic PC sync endpoint rejects a wrong device key without applying changes", async ({
  request,
}) => {
  const suffix = uniqueSuffix();
  const id = `wrong-key-${suffix}`;
  const name = `Wrong Key ${suffix}`;
  const response = await request.post("/api/sync", {
    headers: { "X-Clinic-Device-Key": "not-the-device-key" },
    data: {
      changes: [patientChange(id, name, "2026-09-20T10:02:00.000Z")],
    },
  });

  expect(response.status()).toBe(401);
  const found = await request.get(`/api/patients?q=${encodeURIComponent(name)}`);
  expect(((await found.json()) as { patients: unknown[] }).patients).toEqual([]);
});

test("the Clinic PC sync endpoint rejects an oversized batch", async ({ request }) => {
  const suffix = uniqueSuffix();
  const response = await request.post("/api/sync", {
    headers: deviceKeyHeader,
    data: {
      changes: Array.from({ length: 51 }, (_, index) =>
        patientChange(
          `too-many-${suffix}-${index}`,
          `Too Many ${suffix} ${index}`,
          "2026-09-20T10:03:00.000Z",
        ),
      ),
    },
  });

  expect(response.status()).toBe(413);
});

test("the Cloud copy never replaces a newer Clinic record with an older change", async ({
  request,
}) => {
  const suffix = uniqueSuffix();
  const id = `ordered-${suffix}`;
  const newerName = `Newer Clinic Record ${suffix}`;
  const newer = patientChange(id, newerName, "2026-09-20T10:05:00.000Z");
  const older = patientChange(
    id,
    `Older Clinic Record ${suffix}`,
    "2026-09-20T10:04:00.000Z",
  );

  for (const change of [newer, older]) {
    const response = await request.post("/api/sync", {
      headers: deviceKeyHeader,
      data: { changes: [change] },
    });
    expect(response.ok(), await response.text()).toBe(true);
  }

  const found = await request.get(
    `/api/patients?q=${encodeURIComponent(newerName)}`,
  );
  expect(((await found.json()) as { patients: { id: string; name: string }[] }).patients).toEqual([
    expect.objectContaining({ id, name: newerName }),
  ]);
});

test("the Cloud copy hands over Phone-issued records until the Clinic PC confirms them", async ({
  request,
}) => {
  const suffix = uniqueSuffix();
  const draftId = `phone-handover-${suffix}`;
  const consultation: Consultation = {
    ...sampleConsultation(),
    visitType: "new",
    consultationDate: todayInIndia(),
    patient: {
      ...emptyConsultationPatient(),
      name: `Phone Handover ${suffix}`,
      age: "37",
      sex: "Female",
      phone: "98888 77665",
    },
    medicines: [
      {
        name: "Paracetamol 500 mg tablet",
        dose: "1–0–1",
        duration: "5 days",
        method: "After food",
      },
    ],
  };
  const saved = await request.put(`/api/consultation-drafts/${draftId}`, {
    data: { consultation, revision: 1 },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  const issued = await request.post(
    `/api/consultation-drafts/${draftId}/complete`,
    {
      headers: { "X-Clinic-Phone-Issued": "1" },
      data: { revision: 1, expectedConsultation: consultation },
    },
  );
  expect(issued.ok(), await issued.text()).toBe(true);
  const snapshot = (await issued.json()) as {
    snapshot: { id: string; consultation: { patient: { patientId: string } } };
  };
  const ids = new Set([
    snapshot.snapshot.id,
    snapshot.snapshot.consultation.patient.patientId,
  ]);

  const collect = () =>
    request.post("/api/sync", {
      headers: deviceKeyHeader,
      data: { changes: [], collected: [] },
    });
  const first = await collect();
  expect(first.ok(), await first.text()).toBe(true);
  const firstBody = (await first.json()) as {
    phoneIssued: Array<{
      entityKind: string;
      recordId: string;
      issuedAt: string;
      record: Record<string, unknown>;
    }>;
  };
  const handedOver = firstBody.phoneIssued.filter((record) => ids.has(record.recordId));
  expect(handedOver.map((record) => record.entityKind).sort()).toEqual([
    "patient",
    "prescription",
  ]);
  expect(
    (handedOver.find((record) => record.entityKind === "patient")?.record as {
      patientNumber?: unknown;
    }).patientNumber,
  ).toBeNull();

  const retry = await collect();
  expect(retry.ok(), await retry.text()).toBe(true);
  const retryBody = (await retry.json()) as typeof firstBody;
  expect(retryBody.phoneIssued.filter((record) => ids.has(record.recordId))).toEqual(
    handedOver,
  );

  const wrongKey = await request.post("/api/sync", {
    headers: { "X-Clinic-Device-Key": "wrong-device-key" },
    data: {
      changes: [],
      collected: handedOver.map(({ entityKind, recordId, issuedAt }) => ({
        entityKind,
        recordId,
        issuedAt,
      })),
    },
  });
  expect(wrongKey.status()).toBe(401);

  const confirmation = handedOver.map(({ entityKind, recordId, issuedAt }) => ({
    entityKind,
    recordId,
    issuedAt,
  }));
  const confirmed = await request.post("/api/sync", {
    headers: deviceKeyHeader,
    data: { changes: [], collected: confirmation },
  });
  expect(confirmed.ok(), await confirmed.text()).toBe(true);
  const confirmedBody = (await confirmed.json()) as typeof firstBody & {
    collected: typeof confirmation;
  };
  expect(confirmedBody.collected).toEqual(confirmation);
  expect(confirmedBody.phoneIssued.filter((record) => ids.has(record.recordId))).toEqual(
    [],
  );

  const afterConfirmation = await collect();
  const afterBody = (await afterConfirmation.json()) as typeof firstBody;
  expect(afterBody.phoneIssued.filter((record) => ids.has(record.recordId))).toEqual(
    [],
  );
});
