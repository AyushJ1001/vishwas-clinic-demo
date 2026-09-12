import type { CompletedPrescriptionDocument } from "./prescription-document";

const preparedPdfs = new Map<string, Promise<File>>();

export function preparePrescriptionPdf(
  document: CompletedPrescriptionDocument,
) {
  const cached = preparedPdfs.get(document.snapshotId);
  if (cached) return cached;
  const preparation = import("./prescription-pdf")
    .then(({ generatePrescriptionPdf }) => generatePrescriptionPdf(document))
    .then(
      (bytes) =>
        new File([bytes as BlobPart], document.fileName, {
          type: "application/pdf",
        }),
    )
    .catch((error) => {
      preparedPdfs.delete(document.snapshotId);
      throw error;
    });
  preparedPdfs.set(document.snapshotId, preparation);
  return preparation;
}

export function retryPrescriptionPdf(document: CompletedPrescriptionDocument) {
  preparedPdfs.delete(document.snapshotId);
  return preparePrescriptionPdf(document);
}

export function downloadPrescriptionPdf(file: File) {
  const url = URL.createObjectURL(file);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
