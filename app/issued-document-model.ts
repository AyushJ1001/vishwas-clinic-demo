import type {
  ClinicDoctorName,
  ClinicIdentitySnapshot,
  DoctorIdentitySnapshot,
  PatientSex,
} from "./consultation-model";

export const receiptTitles = ["Mr.", "Mrs.", "Ms.", "Miss", "Master", "Smt.", ""] as const;
export const certificateTitles = ["Mr.", "Mrs.", "Miss", "Master", "Smt.", ""] as const;

export type ReceiptTitle = (typeof receiptTitles)[number];
export type CertificateTitle = (typeof certificateTitles)[number];

export type IssuedDocumentPatient = {
  id: string;
  number: number | null;
  name: string;
  age: string;
  sex: PatientSex;
};

type IssuedDocumentBase = {
  id: string;
  issuedOn: string;
  createdAt: string;
  clinic: ClinicIdentitySnapshot;
  doctor: DoctorIdentitySnapshot;
  patient: IssuedDocumentPatient;
};

export type ReceiptSnapshot = IssuedDocumentBase & {
  documentVersion: "receipt-v1";
  layoutVersion: "a5-v1";
  receiptNumber: number;
  title: ReceiptTitle;
  amountPaise: number;
};

export type MedicalCertificateSnapshot = IssuedDocumentBase & {
  documentVersion: "medical-certificate-v1";
  layoutVersion: "a5-v1";
  title: CertificateTitle;
  diagnosis: string;
  treatmentSince: string;
  restDays: number;
  fitToResume: boolean;
  resumeFrom: string;
};

export type DoctorSummary = {
  patientsSeen: number;
  newPatients: number;
  prescriptionsNew: number;
  prescriptionsFollowUp: number;
  prescriptionsTotal: number;
  receiptsIssued: number;
  amountReceivedPaise: number;
  medicalCertificatesIssued: number;
};

export type MonthlySummary = {
  month: string;
  doctors: Record<ClinicDoctorName, DoctorSummary>;
  total: DoctorSummary;
};

export function defaultTitleForSex(sex: PatientSex): ReceiptTitle {
  if (sex === "Male") return "Mr.";
  if (sex === "Female") return "Mrs.";
  return "";
}

export function titledName(title: string, name: string) {
  return [title, name.trim()].filter(Boolean).join(" ") || "—";
}

export function formatDocumentDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : "—";
}

const smallNumbers = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowThousand(value: number): string {
  if (value < 20) return smallNumbers[value];
  if (value < 100)
    return [tens[Math.floor(value / 10)], value % 10 ? smallNumbers[value % 10] : ""]
      .filter(Boolean)
      .join(" ");
  return [
    `${smallNumbers[Math.floor(value / 100)]} Hundred`,
    value % 100 ? belowThousand(value % 100) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Whole rupees in the Indian crore/lakh/thousand numbering system. */
export function rupeesInWords(rupees: number) {
  if (!Number.isSafeInteger(rupees) || rupees < 0 || rupees > 9_999_999_999)
    return "";
  if (rupees === 0) return "Rupees Zero only";
  const parts: string[] = [];
  const groups: [number, string][] = [
    [10_000_000, "Crore"],
    [100_000, "Lakh"],
    [1_000, "Thousand"],
  ];
  let remainder = rupees;
  for (const [size, label] of groups) {
    const count = Math.floor(remainder / size);
    if (count) {
      parts.push(`${belowThousand(count)} ${label}`);
      remainder %= size;
    }
  }
  if (remainder) parts.push(belowThousand(remainder));
  return `Rupees ${parts.join(" ")} only`;
}
