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

export const clinicSyncDeviceKeyHeader = "X-Clinic-Device-Key";
export const clinicSyncBatchLimit = 50;
