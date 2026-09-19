"use client";

import { ReceiptPage } from "./workspace/receipt-page";
import { PatientsPage } from "./workspace/patients-page";
import { CertificatePage } from "./workspace/certificate-page";
import { SummaryPage } from "./workspace/summary-page";
import { PrescriptionPage } from "./workspace/prescription-page";
import { BackupsPage } from "./workspace/backups-page";
import type { RouteName } from "./workspace/shell";

export type { RouteName };

export default function ClinicApp({ route }: { route: RouteName }) {
  if (route === "backups") return <BackupsPage />;
  if (route === "receipts") return <ReceiptPage />;
  if (route === "patients") return <PatientsPage />;
  if (route === "certificate") return <CertificatePage />;
  if (route === "summaries") return <SummaryPage />;
  return <PrescriptionPage />;
}
