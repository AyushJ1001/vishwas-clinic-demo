// A Patient document is a report, scan or letter from outside the clinic that
// a doctor attaches to a Patient on the Clinic PC (ADR 0005). Unlike an Issued
// document it can be removed again.

export const patientDocumentTypes = {
  "application/pdf": { extension: "pdf", label: "PDF" },
  "image/jpeg": { extension: "jpg", label: "JPG image" },
  "image/png": { extension: "png", label: "PNG image" },
} as const;

export type PatientDocumentType = keyof typeof patientDocumentTypes;

export type PatientDocument = {
  id: string;
  patientId: string;
  name: string;
  contentType: PatientDocumentType;
  byteSize: number;
  addedAt: string;
};

export type OpenPatientDocumentResult =
  | { status: "opened" }
  | { status: "failed"; message: string };

export const patientDocumentMaxBytes = 10 * 1024 * 1024;
// A document is stored, and sent to the Cloud copy, in pieces of this size:
// D1 refuses a row larger than 2 MB.
export const patientDocumentChunkBytes = 1024 * 1024;

export function patientDocumentChunkCount(byteSize: number) {
  return Math.ceil(byteSize / patientDocumentChunkBytes);
}

/** What Sync carries for a Patient document; its bytes are sent beforehand. */
export type PatientDocumentSyncRecord = PatientDocument & {
  removedAt: string | null;
};
export const patientDocumentNameMaxLength = 120;
export const patientDocumentAccept =
  ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
export const patientDocumentTypesHint = "PDF, JPG or PNG, up to 10 MB each.";

const signatures: { type: PatientDocumentType; bytes: number[] }[] = [
  { type: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  {
    type: "image/png",
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
];

export const patientDocumentSignatureLength = 8;

/**
 * The kind of file these bytes really are, whatever it was named. Only these
 * kinds are kept, because the Clinic PC hands a document to Windows to open.
 */
export function patientDocumentTypeOf(
  bytes: Uint8Array,
): PatientDocumentType | null {
  const match = signatures.find((signature) =>
    signature.bytes.every((byte, index) => bytes[index] === byte),
  );
  return match?.type ?? null;
}

export function isPatientDocumentType(
  value: unknown,
): value is PatientDocumentType {
  return typeof value === "string" && value in patientDocumentTypes;
}

/** The name a document is listed under: the file's own name, tidied. */
export function patientDocumentName(fileName: string) {
  return fileName
    .replace(/[\u0000-\u001f\u007f]/gu, "")
    .split(/[\\/]/u)
    .pop()!
    .trim()
    .slice(0, patientDocumentNameMaxLength)
    .trim();
}

const windowsReservedName = /^(con|prn|aux|nul|com\d|lpt\d)$/iu;

/** A file name Windows accepts, ending in the extension of the real type. */
export function patientDocumentFileName(
  name: string,
  contentType: PatientDocumentType,
) {
  const base = name
    .replace(/\.(pdf|jpe?g|png)$/iu, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .replace(/^[. ]+|[. ]+$/gu, "");
  const safeBase = !base || windowsReservedName.test(base) ? `document ${base}`.trim() : base;
  return `${safeBase}.${patientDocumentTypes[contentType].extension}`;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
