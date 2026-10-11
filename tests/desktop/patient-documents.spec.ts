import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { launchClinicPc, openPage } from "./clinic-pc";

let dataDirectory: string;

test.beforeEach(() => {
  dataDirectory = mkdtempSync(path.join(tmpdir(), "clinic-documents-"));
});

test.afterEach(() => {
  rmSync(dataDirectory, { recursive: true, force: true });
});

// A PDF large enough to be stored in three pieces, and the smallest valid PNG.
const report = Buffer.concat([
  Buffer.from("%PDF-1.4\n"),
  Buffer.alloc(2_400_000, "report "),
]);
const scan = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

async function launch(env: Record<string, string> = {}) {
  const app = await launchClinicPc(dataDirectory, env);
  // Records what would be handed to Windows instead of starting a viewer.
  await app.evaluate(({ shell }) => {
    const opened: string[] = [];
    (globalThis as typeof globalThis & { __openedPaths?: string[] }).__openedPaths =
      opened;
    shell.openPath = async (file: string) => {
      opened.push(file);
      return "";
    };
  });
  return app;
}

test("the Clinic PC keeps a patient's documents, opens them in Windows, and removes them", async () => {
  let app = await launch();
  let window = await openPage(app, "/patients");
  const patientId = await window.evaluate(async () => {
    await fetch("/api/patients/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patients: [
          { number: "41", name: "Desktop Document Asha", age: "52", dateOfBirth: "", sex: "Female", phone: "" },
        ],
      }),
    });
    const found = await fetch("/api/patients?q=Desktop%20Document%20Asha");
    const { patients } = (await found.json()) as { patients: { id: string }[] };
    return patients[0].id;
  });

  await window.getByRole("searchbox").fill("Desktop Document");
  await window.getByRole("link", { name: "Desktop Document Asha" }).click();
  await expect(
    window.getByRole("heading", { level: 1, name: "Desktop Document Asha" }),
  ).toBeVisible();
  let documents = window.getByRole("region", { name: "Documents" });
  await window.getByLabel("Choose documents to add").setInputFiles([
    { name: "blood report.pdf", mimeType: "application/pdf", buffer: report },
    { name: "CON.png", mimeType: "image/png", buffer: scan },
  ]);
  await expect(documents.getByRole("status")).toHaveText("2 documents added.");

  const openedPaths = () =>
    app.evaluate(
      () =>
        (globalThis as typeof globalThis & { __openedPaths?: string[] })
          .__openedPaths ?? [],
    );
  await documents.getByRole("button", { name: "Open blood report.pdf" }).click();
  await expect.poll(openedPaths).toHaveLength(1);
  await documents.getByRole("button", { name: "Open CON.png" }).click();
  await expect.poll(openedPaths).toHaveLength(2);
  const [openedReport, openedScan] = await openedPaths();
  const openedDirectory = path.join(dataDirectory, "opened-documents");
  expect(path.basename(openedReport)).toBe("blood report.pdf");
  expect(openedReport.startsWith(openedDirectory + path.sep)).toBe(true);
  expect(readFileSync(openedReport).equals(report)).toBe(true);
  // Windows would refuse a file called CON, whatever its extension.
  expect(path.basename(openedScan)).toBe("document CON.png");
  expect(readFileSync(openedScan).equals(scan)).toBe(true);
  await expect(documents.getByRole("alert")).toHaveCount(0);

  // After a restart the documents are still there and the copies are gone.
  await app.close();
  expect(existsSync(openedDirectory) ? readdirSync(openedDirectory) : []).toEqual([]);
  app = await launch();
  window = await openPage(app, `/patients?patient=${patientId}`);
  documents = window.getByRole("region", { name: "Documents" });
  await expect(documents.getByRole("row", { name: /blood report\.pdf PDF 2\.3 MB/ })).toBeVisible();

  window.once("dialog", (dialog) => void dialog.accept());
  await documents.getByRole("button", { name: "Remove blood report.pdf" }).click();
  await expect(documents.getByRole("status")).toHaveText("blood report.pdf removed.");
  await expect(documents.getByRole("row", { name: /blood report\.pdf/ })).toHaveCount(0);
  await expect(documents.getByRole("row", { name: /CON\.png/ })).toBeVisible();
  await app.close();
});

type SyncedChange = {
  entityKind: string;
  recordId: string;
  record: Record<string, unknown>;
};

/** A stand-in Cloud copy that refuses the second piece of a document once. */
async function startCloudCopy() {
  const events: string[] = [];
  const pieces = new Map<number, Buffer>();
  const changes: SyncedChange[] = [];
  let refusals = 1;
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://cloud.test");
    const received: Buffer[] = [];
    request.on("data", (chunk: Buffer) => received.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(received);
      if (url.pathname === "/api/sync/patient-documents") {
        const index = Number(url.searchParams.get("chunk"));
        if (index === 1 && refusals > 0) {
          refusals -= 1;
          events.push("refused piece 1");
          response.writeHead(503).end();
          return;
        }
        events.push(`piece ${index}`);
        pieces.set(index, body);
        response.writeHead(200, { "Content-Type": "application/json" }).end("{}");
        return;
      }
      const payload = JSON.parse(body.toString()) as { changes: SyncedChange[] };
      for (const change of payload.changes) {
        changes.push(change);
        events.push(
          change.entityKind === "patient-document"
            ? change.record.removedAt === null
              ? "document announced"
              : "document removed"
            : change.entityKind,
        );
      }
      response.writeHead(200, { "Content-Type": "application/json" }).end(
        JSON.stringify({
          accepted: payload.changes,
          collected: [],
          phoneIssued: [],
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    address: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    events,
    pieces,
    changes,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("Sync sends a patient's documents to the Cloud copy, resumes a broken upload, and sends removals", async () => {
  const cloud = await startCloudCopy();
  const app = await launch({
    CLINIC_CLOUD_URL: cloud.address,
    CLINIC_SYNC_DEVICE_KEY: "desktop-documents-device-key",
    CLINIC_SYNC_INTERVAL_MS: "100",
  });
  const window = await openPage(app, "/patients");
  const patientId = await window.evaluate(async () => {
    await fetch("/api/patients/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patients: [
          { number: "", name: "Desktop Sync Bhavin", age: "40", dateOfBirth: "", sex: "Male", phone: "" },
        ],
      }),
    });
    const found = await fetch("/api/patients?q=Desktop%20Sync%20Bhavin");
    const { patients } = (await found.json()) as { patients: { id: string }[] };
    return patients[0].id;
  });
  await openPage(app, `/patients?patient=${patientId}`);
  await window.getByLabel("Choose documents to add").setInputFiles([
    { name: "blood report.pdf", mimeType: "application/pdf", buffer: report },
  ]);
  const documents = window.getByRole("region", { name: "Documents" });
  await expect(documents.getByRole("status")).toHaveText("1 document added.");

  await expect.poll(() => cloud.events).toContain("document announced");
  // The patient was not held back by the refused piece, the pieces already
  // sent were not sent again, and the document was announced only after all
  // of its bytes had arrived.
  expect(cloud.events).toEqual([
    "patient",
    "piece 0",
    "refused piece 1",
    "piece 1",
    "piece 2",
    "document announced",
  ]);
  expect(
    Buffer.concat([cloud.pieces.get(0)!, cloud.pieces.get(1)!, cloud.pieces.get(2)!]).equals(
      report,
    ),
  ).toBe(true);
  const announced = cloud.changes.find(
    (change) => change.entityKind === "patient-document",
  )!;
  expect(announced.record).toMatchObject({
    patientId,
    name: "blood report.pdf",
    contentType: "application/pdf",
    byteSize: report.length,
    removedAt: null,
  });

  window.once("dialog", (dialog) => void dialog.accept());
  await documents.getByRole("button", { name: "Remove blood report.pdf" }).click();
  await expect.poll(() => cloud.events).toContain("document removed");
  const removed = cloud.changes[cloud.changes.length - 1];
  expect(removed.recordId).toBe(announced.recordId);
  expect(removed.record.removedAt).toEqual(expect.any(String));

  await app.close();
  await cloud.close();
});
