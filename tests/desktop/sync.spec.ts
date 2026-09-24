import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { PhoneIssuedRecord } from "../../app/sync-model";
import { launchClinicPc, openPage } from "./clinic-pc";

type ReceivedChange = {
  entityKind: string;
  recordId: string;
  recordedAt: string;
  record: Record<string, unknown>;
};

const deviceKey = "desktop-sync-device-key";
let dataDirectory: string;

test.beforeEach(() => {
  dataDirectory = mkdtempSync(path.join(tmpdir(), "clinic-sync-"));
});

test.afterEach(() => {
  rmSync(dataDirectory, { recursive: true, force: true });
});

async function startCloudCopy(
  port = 0,
  phoneIssued: PhoneIssuedRecord[] = [],
  repeatCollected = false,
) {
  const received: ReceivedChange[] = [];
  const collected = new Set<string>();
  const server = createServer((request, response) => {
    if (request.headers["x-clinic-device-key"] !== deviceKey) {
      response.writeHead(401).end();
      return;
    }
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const payload = JSON.parse(body) as {
        changes: ReceivedChange[];
        collected?: Array<{
          entityKind: string;
          recordId: string;
          issuedAt: string;
        }>;
      };
      const changes = payload.changes;
      received.push(...changes);
      for (const record of payload.collected ?? []) {
        collected.add(`${record.entityKind}\u0000${record.recordId}`);
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          accepted: changes.map(({ entityKind, recordId, recordedAt }) => ({
            entityKind,
            recordId,
            recordedAt,
          })),
          collected: payload.collected ?? [],
          phoneIssued: phoneIssued.filter(
            (record) =>
              repeatCollected ||
              !collected.has(`${record.entityKind}\u0000${record.recordId}`),
          ),
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test server port");
  return {
    server,
    received,
    collected,
    url: `http://127.0.0.1:${address.port}`,
    port: address.port,
  };
}

async function stop(server: Server) {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

async function completePrescription(
  window: Awaited<ReturnType<typeof openPage>>,
  name: string,
  phone = "",
) {
  await window.getByRole("radio", { name: "New prescription" }).check();
  await window.getByLabel("Patient name").fill(name);
  await window.keyboard.press("Escape");
  await window.getByLabel("Age", { exact: true }).fill("41");
  if (phone) await window.getByLabel("Phone").fill(phone);
  for (const [field, item] of [
    ["Major complaints", "Dry cough"],
    ["Examination findings", "Throat congestion"],
    ["Provisional diagnosis", "Viral upper respiratory tract infection"],
    ["Medicines", "Paracetamol 500 mg tablet"],
  ]) {
    await window.getByRole("combobox", { name: field, exact: true }).click();
    await window.getByPlaceholder(`Search ${field.toLowerCase()}`).fill(item);
    await window.getByRole("option", { name: item, exact: true }).click();
    await window.keyboard.press("Escape");
  }
  await window.getByLabel("Paracetamol 500 mg tablet dose").selectOption("1–0–1");
  await window.getByLabel("Paracetamol 500 mg tablet duration").selectOption("5 days");
  await window.getByLabel("Paracetamol 500 mg tablet method").selectOption("After food");
  await window.getByRole("button", { name: "Review prescription" }).click();
  await window
    .getByRole("dialog", { name: "Review prescription" })
    .getByRole("button", { name: "Complete prescription" })
    .click();
  await expect(
    window.getByRole("status", { name: "Prescription completed" }),
  ).toBeVisible();
}

async function localJson<T>(
  window: Awaited<ReturnType<typeof openPage>>,
  url: string,
) {
  return window.evaluate(async (address) => {
    const response = await fetch(address);
    if (!response.ok) throw new Error(`Local request failed: ${response.status}`);
    return response.json();
  }, url) as Promise<T>;
}

function phoneRecords(
  patientId: string,
  prescriptionId: string,
  draftId: string,
  name: string,
  phone: string,
): PhoneIssuedRecord[] {
  const patientCreatedAt = "2026-09-20T10:00:00.000Z";
  const completedAt = "2026-09-20T10:01:00.000Z";
  const patient = {
    id: patientId,
    patientNumber: null,
    name,
    nameNormalized: name.toLocaleLowerCase(),
    dateOfBirth: "1985-02-03",
    dateOfBirthEstimated: false,
    sex: "Female",
    phone,
    sourceDraftId: draftId,
    phoneIssued: true,
    possibleDuplicate: false,
    createdAt: patientCreatedAt,
    updatedAt: patientCreatedAt,
  };
  const consultation = {
    visitType: "new",
    linkedPriorVisit: null,
    doctorName: "Dr. Makarand Vishwas Apte",
    patient: {
      patientId,
      patientNumber: null,
      name,
      age: "41",
      dateOfBirth: "1985-02-03",
      sex: "Female",
      phone,
    },
    consultationDate: "2026-09-20",
    vitals: {
      weight: "",
      temperature: "",
      pulse: "",
      systolic: "",
      diastolic: "",
      spo2: "",
    },
    complaints: ["Dry cough"],
    examinationFindings: ["Throat congestion"],
    pastMedicalHistory: "",
    provisionalDiagnosis: "Viral upper respiratory tract infection",
    advice: [],
    investigations: [],
    nextVisit: "",
    medicines: [
      {
        name: "Paracetamol 500 mg tablet",
        dose: "1–0–1",
        duration: "5 days",
        method: "After food",
      },
    ],
  };
  return [
    {
      entityKind: "patient",
      recordId: patientId,
      record: patient,
      issuedAt: patientCreatedAt,
    },
    {
      entityKind: "prescription",
      recordId: prescriptionId,
      issuedAt: completedAt,
      record: {
        id: prescriptionId,
        draftId,
        sourceRevision: 1,
        completedAt,
        documentVersion: "prescription-v1",
        layoutVersion: "a5-v1",
        clinic: {},
        doctor: { name: "Dr. Makarand Vishwas Apte" },
        consultation,
        medicines: [],
      },
    },
  ];
}

function syncEnvironment(url: string) {
  return {
    CLINIC_CLOUD_URL: url,
    CLINIC_SYNC_DEVICE_KEY: deviceKey,
    CLINIC_SYNC_INTERVAL_MS: "100",
  };
}

test("a completed prescription and its registered patient reach the Cloud copy once", async () => {
  const cloud = await startCloudCopy();
  const app = await launchClinicPc(dataDirectory, syncEnvironment(cloud.url));
  const window = await app.firstWindow();
  await expect(window.getByRole("status")).toContainText("Saved", {
    timeout: 15_000,
  });

  await completePrescription(window, `Sync Patient ${Date.now().toString(36)}`);
  await expect
    .poll(() => cloud.received.map((change) => change.entityKind).sort())
    .toEqual(["patient", "prescription"]);

  await new Promise((resolve) => setTimeout(resolve, 500));
  expect(cloud.received.map((change) => change.entityKind).sort()).toEqual([
    "patient",
    "prescription",
  ]);
  await app.close();
  await stop(cloud.server);
});

test("offline work stays pending and goes through when the Cloud copy is reachable", async () => {
  const portHolder = await startCloudCopy();
  const port = portHolder.port;
  await stop(portHolder.server);
  const app = await launchClinicPc(
    dataDirectory,
    syncEnvironment(`http://127.0.0.1:${port}`),
  );
  const window = await app.firstWindow();
  await expect(window.getByRole("status")).toContainText("Saved", {
    timeout: 15_000,
  });

  await completePrescription(window, `Offline Patient ${Date.now().toString(36)}`);
  const settings = await openPage(app, "/settings");
  await expect(settings.getByText("2 changes waiting", { exact: false })).toBeVisible();

  const cloud = await startCloudCopy(port);
  await expect
    .poll(() => cloud.received.map((change) => change.entityKind).sort())
    .toEqual(["patient", "prescription"]);
  await expect(settings.getByText("All changes sent", { exact: false })).toBeVisible();

  await new Promise((resolve) => setTimeout(resolve, 500));
  expect(cloud.received).toHaveLength(2);
  await app.close();
  await stop(cloud.server);
});

test("Phone-issued records become Clinic records once and possible duplicates stay separate", async () => {
  const portHolder = await startCloudCopy();
  const port = portHolder.port;
  await stop(portHolder.server);
  const app = await launchClinicPc(
    dataDirectory,
    syncEnvironment(`http://127.0.0.1:${port}`),
  );
  const window = await app.firstWindow();
  await expect(window.getByRole("status")).toContainText("Saved", {
    timeout: 15_000,
  });

  const suffix = Date.now().toString(36);
  const name = `Possible Duplicate ${suffix}`;
  const phone = "98765 40123";
  await completePrescription(window, name, phone);
  const before = await localJson<{
    patients: Array<{ id: string; number: number; name: string }>;
  }>(window, `/api/patients?q=${encodeURIComponent(name)}&limit=25`);
  expect(before.patients).toHaveLength(1);

  const patientId = `phone-patient-${suffix}`;
  const prescriptionId = `phone-prescription-${suffix}`;
  const draftId = `phone-draft-${suffix}`;
  const waiting = phoneRecords(
    patientId,
    prescriptionId,
    draftId,
    name,
    phone,
  );
  const cloud = await startCloudCopy(port, waiting, true);

  await expect
    .poll(async () => {
      const result = await localJson<{
        patients: Array<{
          id: string;
          number: number;
          phoneIssued: boolean;
          possibleDuplicate: boolean;
        }>;
      }>(window, `/api/patients?q=${encodeURIComponent(name)}&limit=25`);
      return result.patients;
    })
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: before.patients[0].id,
          number: before.patients[0].number,
          phoneIssued: false,
          possibleDuplicate: true,
        }),
        expect.objectContaining({
          id: patientId,
          number: before.patients[0].number + 1,
          phoneIssued: true,
          possibleDuplicate: true,
        }),
      ]),
    );

  const visits = await localJson<{
    visits: Array<{ id: string; patientId: string; consultationDate: string }>;
  }>(window, `/api/prior-visits?patientId=${encodeURIComponent(patientId)}`);
  expect(visits.visits).toEqual([
    expect.objectContaining({
      id: prescriptionId,
      patientId,
      consultationDate: "2026-09-20",
    }),
  ]);

  const firstState = await localJson<{
    patients: unknown[];
  }>(window, `/api/patients?q=${encodeURIComponent(name)}&limit=25`);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const repeatedState = await localJson<{
    patients: unknown[];
  }>(window, `/api/patients?q=${encodeURIComponent(name)}&limit=25`);
  const repeatedVisits = await localJson<{ visits: unknown[] }>(
    window,
    `/api/prior-visits?patientId=${encodeURIComponent(patientId)}`,
  );
  expect(repeatedState).toEqual(firstState);
  expect(repeatedVisits.visits).toHaveLength(1);
  expect(cloud.collected).toEqual(
    new Set([
      `patient\u0000${patientId}`,
      `prescription\u0000${prescriptionId}`,
    ]),
  );

  const patientsPage = await openPage(app, "/patients");
  const directory = patientsPage.getByRole("article", {
    name: "Saved patient records",
  });
  await directory.getByRole("searchbox").fill(name);
  const phoneRow = directory.getByRole("row").filter({ hasText: "Phone-issued" });
  await expect(phoneRow).toContainText(name);
  await expect(phoneRow).toContainText("Possible duplicate");

  await app.close();
  await stop(cloud.server);
});
