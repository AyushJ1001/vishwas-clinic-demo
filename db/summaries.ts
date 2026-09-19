import { env } from "cloudflare:workers";

import { clinicDoctors } from "../app/clinic-facts";
import type { ClinicDoctorName } from "../app/consultation-model";
import type { DoctorSummary, MonthlySummary } from "../app/issued-document-model";
import { getConsultationDraft } from "./consultation-drafts";
import {
  listRecentMedicalCertificates,
  listRecentReceipts,
} from "./issued-documents";
import { searchPatients } from "./patients";

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  return {
    start: `${String(year).padStart(4, "0")}-${String(monthNumber).padStart(2, "0")}-01`,
    end: `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`,
  };
}

async function scalar(sql: string, ...bindings: unknown[]) {
  const row = await env.DB.prepare(sql)
    .bind(...bindings)
    .first<{ value: number | null }>();
  return Number(row?.value ?? 0);
}

async function summaryForDoctor(
  doctorName: ClinicDoctorName,
  start: string,
  end: string,
): Promise<DoctorSummary> {
  const prescriptionWhere = `lifecycle_status = 'completed'
    AND json_extract(completed_snapshot_json, '$.consultation.consultationDate') >= ?
    AND json_extract(completed_snapshot_json, '$.consultation.consultationDate') < ?
    AND json_extract(completed_snapshot_json, '$.doctor.name') = ?`;
  const patientsSeen = await scalar(
    `SELECT COUNT(DISTINCT json_extract(completed_snapshot_json,
       '$.consultation.patient.patientId')) AS value
     FROM consultation_drafts WHERE ${prescriptionWhere}`,
    start,
    end,
    doctorName,
  );
  const prescriptionsNew = await scalar(
    `SELECT COUNT(*) AS value FROM consultation_drafts WHERE ${prescriptionWhere}
       AND json_extract(completed_snapshot_json, '$.consultation.visitType') = 'new'`,
    start,
    end,
    doctorName,
  );
  const prescriptionsFollowUp = await scalar(
    `SELECT COUNT(*) AS value FROM consultation_drafts WHERE ${prescriptionWhere}
       AND json_extract(completed_snapshot_json, '$.consultation.visitType') = 'followup'`,
    start,
    end,
    doctorName,
  );
  const prescriptionsTotal = await scalar(
    `SELECT COUNT(*) AS value FROM consultation_drafts WHERE ${prescriptionWhere}`,
    start,
    end,
    doctorName,
  );
  const receiptsIssued = await scalar(
    `SELECT COUNT(*) AS value FROM receipts
     WHERE issued_on >= ? AND issued_on < ? AND doctor_name = ?`,
    start,
    end,
    doctorName,
  );
  const amountReceivedPaise = await scalar(
    `SELECT COALESCE(SUM(amount_paise), 0) AS value FROM receipts
     WHERE issued_on >= ? AND issued_on < ? AND doctor_name = ?`,
    start,
    end,
    doctorName,
  );
  const medicalCertificatesIssued = await scalar(
    `SELECT COUNT(*) AS value FROM medical_certificates
     WHERE issued_on >= ? AND issued_on < ? AND doctor_name = ?`,
    start,
    end,
    doctorName,
  );
  // Patient records do not carry an Author. Attribute a newly registered
  // Patient to the Author of the document whose id registered them.
  const newPatients = await scalar(
    `SELECT COUNT(*) AS value FROM patient_records p
     WHERE substr(p.created_at, 1, 10) >= ? AND substr(p.created_at, 1, 10) < ?
       AND (
         EXISTS (
           SELECT 1 FROM consultation_drafts c
           WHERE c.id = p.source_draft_id AND c.lifecycle_status = 'completed'
             AND json_extract(c.completed_snapshot_json, '$.doctor.name') = ?
         )
         OR EXISTS (SELECT 1 FROM receipts r WHERE r.id = p.source_draft_id AND r.doctor_name = ?)
         OR EXISTS (SELECT 1 FROM medical_certificates m WHERE m.id = p.source_draft_id AND m.doctor_name = ?)
       )`,
    start,
    end,
    doctorName,
    doctorName,
    doctorName,
  );
  return {
    patientsSeen,
    newPatients,
    prescriptionsNew,
    prescriptionsFollowUp,
    prescriptionsTotal,
    receiptsIssued,
    amountReceivedPaise,
    medicalCertificatesIssued,
  };
}

export async function getMonthlySummary(month: string): Promise<MonthlySummary> {
  // Runtime table creation keeps both D1 and a fresh Clinic PC usable before
  // migration tooling has run.
  await getConsultationDraft("summary-table-check");
  await searchPatients("", 1);
  await listRecentReceipts(1);
  await listRecentMedicalCertificates(1);
  const { start, end } = monthRange(month);
  const doctorNames = Object.keys(clinicDoctors) as ClinicDoctorName[];
  const values = await Promise.all(
    doctorNames.map((doctor) => summaryForDoctor(doctor, start, end)),
  );
  const doctors = Object.fromEntries(
    doctorNames.map((doctor, index) => [doctor, values[index]]),
  ) as Record<ClinicDoctorName, DoctorSummary>;
  const total: DoctorSummary = {
    patientsSeen: await scalar(
      `SELECT COUNT(DISTINCT json_extract(completed_snapshot_json,
         '$.consultation.patient.patientId')) AS value
       FROM consultation_drafts
       WHERE lifecycle_status = 'completed'
         AND json_extract(completed_snapshot_json, '$.consultation.consultationDate') >= ?
         AND json_extract(completed_snapshot_json, '$.consultation.consultationDate') < ?`,
      start,
      end,
    ),
    newPatients: await scalar(
      `SELECT COUNT(*) AS value FROM patient_records
       WHERE substr(created_at, 1, 10) >= ? AND substr(created_at, 1, 10) < ?`,
      start,
      end,
    ),
    prescriptionsNew: values.reduce((sum, value) => sum + value.prescriptionsNew, 0),
    prescriptionsFollowUp: values.reduce(
      (sum, value) => sum + value.prescriptionsFollowUp,
      0,
    ),
    prescriptionsTotal: values.reduce(
      (sum, value) => sum + value.prescriptionsTotal,
      0,
    ),
    receiptsIssued: values.reduce((sum, value) => sum + value.receiptsIssued, 0),
    amountReceivedPaise: values.reduce(
      (sum, value) => sum + value.amountReceivedPaise,
      0,
    ),
    medicalCertificatesIssued: values.reduce(
      (sum, value) => sum + value.medicalCertificatesIssued,
      0,
    ),
  };
  return { month, doctors, total };
}
