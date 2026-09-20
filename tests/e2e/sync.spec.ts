import { expect, test } from "@playwright/test";

import { uniqueSuffix } from "./fixtures";

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
