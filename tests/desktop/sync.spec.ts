import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

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

async function startCloudCopy(port = 0) {
  const received: ReceivedChange[] = [];
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
      const changes = (JSON.parse(body) as { changes: ReceivedChange[] }).changes;
      received.push(...changes);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          accepted: changes.map(({ entityKind, recordId, recordedAt }) => ({
            entityKind,
            recordId,
            recordedAt,
          })),
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
    url: `http://127.0.0.1:${address.port}`,
    port: address.port,
  };
}

async function stop(server: Server) {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

async function completePrescription(window: Awaited<ReturnType<typeof openPage>>, name: string) {
  await window.getByRole("radio", { name: "New prescription" }).check();
  await window.getByLabel("Patient name").fill(name);
  await window.keyboard.press("Escape");
  await window.getByLabel("Age", { exact: true }).fill("41");
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
