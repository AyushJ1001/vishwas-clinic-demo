import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import type { PatientDocument } from "../../app/patient-document-model";
import { phoneIssuedHeader } from "../../app/sync-model";
import { patientWithEarlierPrescription, uniqueSuffix } from "./fixtures";

// The smallest valid PNG, and a PDF large enough to be stored in three pieces.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
const largePdf = Buffer.concat([
  Buffer.from("%PDF-1.4\n"),
  Buffer.alloc(2_400_000, "report "),
]);

async function openRecord(page: Page, name: string) {
  await page.goto("/patients");
  const directory = page.getByRole("article", { name: "Saved patient records" });
  // The directory only loads after hydration; typing before then is lost.
  await expect(directory).not.toContainText("Loading patient records…", {
    timeout: 15_000,
  });
  await directory.getByRole("searchbox").fill(name);
  await directory.getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

async function addFiles(
  page: Page,
  files: { name: string; mimeType: string; buffer: Buffer }[],
) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add documents" }).click();
  await (await chooser).setFiles(files);
}

async function listDocuments(page: Page, patientId: string) {
  const response = await page.request.get(`/api/patients/${patientId}/documents`);
  expect(response.ok(), await response.text()).toBe(true);
  return (
    (await response.json()) as { documents: PatientDocument[] }
  ).documents;
}

test("a patient's record shows their details, what was issued, and documents a doctor adds and removes", async ({
  page,
}) => {
  const name = `Record Meera ${uniqueSuffix()}`;
  const { patient } = await patientWithEarlierPrescription(page, name);
  await openRecord(page, name);

  const details = page.getByRole("region", { name: "Patient details" });
  await expect(details).toContainText(`Patient no.${patient.number}`);
  await expect(details).toContainText("Age44");
  await expect(details).toContainText("GenderFemale");
  const issued = page.getByRole("region", { name: "Issued by the clinic" });
  await expect(
    issued.getByRole("row", { name: /18\/08\/2026 Prescription Thyroid review/ }),
  ).toBeVisible();

  const documents = page.getByRole("region", { name: "Documents" });
  await expect(documents).toContainText("No documents added for this patient yet.");

  await addFiles(page, [
    { name: "x-ray chest.png", mimeType: "image/png", buffer: png },
    { name: "thyroid report.pdf", mimeType: "application/pdf", buffer: largePdf },
  ]);
  await expect(documents.getByRole("status")).toHaveText("2 documents added.");
  await expect(
    documents.getByRole("row", { name: /x-ray chest\.png PNG image 68 bytes/ }),
  ).toBeVisible();
  await expect(
    documents.getByRole("row", { name: /thyroid report\.pdf PDF 2\.3 MB/ }),
  ).toBeVisible();

  // What is opened is exactly what was added, piece for piece.
  const link = documents.getByRole("link", { name: "Open thyroid report.pdf" });
  const opened = await page.request.get((await link.getAttribute("href"))!);
  expect(opened.headers()["content-type"]).toBe("application/pdf");
  expect((await opened.body()).equals(largePdf)).toBe(true);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);

  // A file of another kind is refused, and says why.
  await addFiles(page, [
    { name: "notes.docx", mimeType: "application/msword", buffer: Buffer.from("PK notes") },
  ]);
  await expect(documents.getByRole("alert")).toHaveText(
    "notes.docx was not added: only PDF, JPG and PNG files can be added.",
  );
  expect(await listDocuments(page, patient.id)).toHaveLength(2);

  // Back to the directory with the search still there, and in again.
  await page.getByRole("button", { name: "All patients" }).click();
  const directory = page.getByRole("article", { name: "Saved patient records" });
  await expect(directory.getByRole("searchbox")).toHaveValue(name);
  await directory.getByRole("link", { name }).click();

  // The record stays open across a reload, with its documents.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible({
    timeout: 15_000,
  });
  await expect(documents.getByRole("row", { name: /x-ray chest\.png/ })).toBeVisible();

  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("Remove x-ray chest.png");
    void dialog.accept();
  });
  await documents.getByRole("button", { name: "Remove x-ray chest.png" }).click();
  await expect(documents.getByRole("status")).toHaveText("x-ray chest.png removed.");
  await expect(documents.getByRole("row", { name: /x-ray chest\.png/ })).toHaveCount(0);
  await expect(documents.getByRole("row", { name: /thyroid report\.pdf/ })).toBeVisible();
  expect((await listDocuments(page, patient.id)).map((entry) => entry.name)).toEqual([
    "thyroid report.pdf",
  ]);

  await page.getByRole("button", { name: "All patients" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Patients" })).toBeVisible();
});

test("patient documents are refused when too large, of another kind, or for nobody", async ({
  page,
}) => {
  const { patient } = await patientWithEarlierPrescription(page);
  const add = (patientId: string, fileName: string, data: Buffer) =>
    page.request.post(
      `/api/patients/${patientId}/documents?name=${encodeURIComponent(fileName)}`,
      { data, headers: { "Content-Type": "application/octet-stream" } },
    );

  const tooLarge = Buffer.concat([
    Buffer.from("%PDF-1.4\n"),
    Buffer.alloc(10 * 1024 * 1024),
  ]);
  expect((await add(patient.id, "huge.pdf", tooLarge)).status()).toBe(413);
  // Named like a PDF, but a Windows program inside.
  expect((await add(patient.id, "report.pdf", Buffer.from("MZ\x90\x00"))).status()).toBe(400);
  expect((await add(patient.id, "", png)).status()).toBe(400);
  expect((await add(`missing-${uniqueSuffix()}`, "scan.png", png)).status()).toBe(404);
  expect(await listDocuments(page, patient.id)).toEqual([]);

  // A document can only be reached through the patient it belongs to.
  const added = await add(patient.id, "scan.png", png);
  expect(added.status()).toBe(201);
  const { document } = (await added.json()) as { document: PatientDocument };
  const { patient: other } = await patientWithEarlierPrescription(page);
  const elsewhere = `/api/patients/${other.id}/documents/${document.id}`;
  expect((await page.request.get(elsewhere)).status()).toBe(404);
  expect((await page.request.delete(elsewhere)).status()).toBe(404);
  expect(await listDocuments(page, patient.id)).toHaveLength(1);
});

const deviceKey = { "X-Clinic-Device-Key": "clinic-sync-e2e-device-key" };

test("Sync brings a patient's documents to the Cloud copy, where a phone opens but cannot change them", async ({
  page,
}) => {
  const name = `Record Phone ${uniqueSuffix()}`;
  const { patient } = await patientWithEarlierPrescription(page, name);
  const documentId = crypto.randomUUID();
  const document = {
    id: documentId,
    patientId: patient.id,
    name: "thyroid report.pdf",
    contentType: "application/pdf",
    byteSize: largePdf.length,
    addedAt: "2026-10-11T09:00:00.000Z",
    removedAt: null as string | null,
  };
  const announce = (recordedAt: string, removedAt: string | null = null) =>
    page.request.post("/api/sync", {
      headers: deviceKey,
      data: {
        changes: [
          {
            entityKind: "patient-document",
            recordId: documentId,
            recordedAt,
            record: { ...document, removedAt },
          },
        ],
      },
    });
  const sendPiece = (index: number, headers: Record<string, string> = deviceKey) =>
    page.request.post(`/api/sync/patient-documents?id=${documentId}&chunk=${index}`, {
      headers: { ...headers, "Content-Type": "application/octet-stream" },
      data: largePdf.subarray(index * 1024 * 1024, (index + 1) * 1024 * 1024),
    });

  // Only the Clinic PC may send bytes, and a document is not listed before
  // every piece of it has arrived.
  expect((await sendPiece(0, {})).status()).toBe(401);
  expect((await sendPiece(0)).status()).toBe(200);
  expect((await sendPiece(1)).status()).toBe(200);
  const early = await announce("2026-10-11T09:00:00.000Z");
  expect(early.status()).toBe(409);
  expect(await listDocuments(page, patient.id)).toEqual([]);
  expect((await sendPiece(2)).status()).toBe(200);
  expect((await announce("2026-10-11T09:00:00.000Z")).status()).toBe(200);

  const asPhone = { headers: { [phoneIssuedHeader]: "1" } };
  const documentPath = `/api/patients/${patient.id}/documents/${documentId}`;
  const opened = await page.request.get(documentPath, asPhone);
  expect(opened.headers()["content-type"]).toBe("application/pdf");
  expect((await opened.body()).equals(largePdf)).toBe(true);
  expect(
    (
      await page.request.post(`/api/patients/${patient.id}/documents?name=scan.png`, {
        data: png,
        headers: { ...asPhone.headers, "Content-Type": "application/octet-stream" },
      })
    ).status(),
  ).toBe(403);
  expect((await page.request.delete(documentPath, asPhone)).status()).toBe(403);

  await page.setExtraHTTPHeaders(asPhone.headers);
  await openRecord(page, name);
  const documents = page.getByRole("region", { name: "Documents" });
  await expect(documents).toContainText("Documents are added and removed on the Clinic PC.");
  await expect(
    documents.getByRole("link", { name: "Open thyroid report.pdf" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add documents" })).toHaveCount(0);
  await expect(documents.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Issued by the clinic" }),
  ).toContainText("Thyroid review");

  // Removing it on the Clinic PC removes it here, bytes and all.
  expect(
    (await announce("2026-10-11T09:05:00.000Z", "2026-10-11T09:05:00.000Z")).status(),
  ).toBe(200);
  expect(await listDocuments(page, patient.id)).toEqual([]);
  expect((await page.request.get(documentPath, asPhone)).status()).toBe(404);
  // With its bytes gone, an older change cannot bring the document back.
  expect((await announce("2026-10-11T09:00:00.000Z")).status()).toBe(409);
});
