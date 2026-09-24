export const clinicRecordKinds = [
  "patient",
  "prescription",
  "receipt",
  "medical-certificate",
  "catalog-entry",
] as const;

export type ClinicRecordKind = (typeof clinicRecordKinds)[number];

export type ClinicRecordChange = {
  entityKind: ClinicRecordKind;
  recordId: string;
  record: Record<string, unknown>;
  recordedAt: string;
};

export type ConfirmedClinicRecordChange = Pick<
  ClinicRecordChange,
  "entityKind" | "recordId" | "recordedAt"
>;

export const phoneIssuedRecordKinds = [
  "patient",
  "prescription",
  "medical-certificate",
] as const;

export type PhoneIssuedRecordKind = (typeof phoneIssuedRecordKinds)[number];

export type PhoneIssuedRecord = {
  entityKind: PhoneIssuedRecordKind;
  recordId: string;
  record: Record<string, unknown>;
  issuedAt: string;
};

export type ConfirmedPhoneIssuedRecord = Pick<
  PhoneIssuedRecord,
  "entityKind" | "recordId" | "issuedAt"
>;

export const clinicSyncDeviceKeyHeader = "X-Clinic-Device-Key";
export const phoneIssuedHeader = "X-Clinic-Phone-Issued";
export const clinicSyncBatchLimit = 50;
