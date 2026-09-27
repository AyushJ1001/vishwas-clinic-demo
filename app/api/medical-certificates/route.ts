import { NextResponse } from "next/server";

import { clinicDoctors } from "../../clinic-facts";
import type { ConsultationPatient } from "../../consultation-model";
import { certificateTitles } from "../../issued-document-model";
import {
  getMedicalCertificate,
  issueMedicalCertificate,
  listRecentMedicalCertificates,
} from "../../../db/issued-documents";
import { isPhoneIssuedRequest } from "../../phone-issued-request";

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9-]{8,120}$/.test(value);
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validPatient(value: unknown): value is ConsultationPatient {
  if (!value || typeof value !== "object") return false;
  const patient = value as Partial<ConsultationPatient>;
  return (
    typeof patient.patientId === "string" &&
    (patient.patientNumber === null || Number.isSafeInteger(patient.patientNumber)) &&
    typeof patient.name === "string" &&
    Boolean(patient.name.trim()) &&
    typeof patient.age === "string" &&
    typeof patient.dateOfBirth === "string" &&
    (patient.sex === "Female" || patient.sex === "Male" || patient.sex === "Other") &&
    typeof patient.phone === "string"
  );
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const certificate = await getMedicalCertificate(id);
    return certificate
      ? NextResponse.json({ certificate })
      : NextResponse.json({ error: "Medical certificate not found" }, { status: 404 });
  }
  return NextResponse.json({ certificates: await listRecentMedicalCertificates() });
}

export async function POST(request: Request) {
  const phoneIssued = isPhoneIssuedRequest(request);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const doctorName = body?.doctorName;
  const title = body?.title;
  if (
    !body ||
    !validId(body.id) ||
    !validPatient(body.patient) ||
    !(body.patient as ConsultationPatient).age.trim() ||
    typeof doctorName !== "string" ||
    !(doctorName in clinicDoctors) ||
    !validDate(body.issuedOn) ||
    typeof title !== "string" ||
    !certificateTitles.includes(title as (typeof certificateTitles)[number]) ||
    typeof body.diagnosis !== "string" ||
    !body.diagnosis.trim() ||
    !validDate(body.treatmentSince) ||
    !Number.isSafeInteger(body.restDays) ||
    (body.restDays as number) < 0 ||
    typeof body.fitToResume !== "boolean" ||
    !validDate(body.resumeFrom)
  ) {
    return NextResponse.json(
      { error: "Complete patient, diagnosis, treatment, rest, and fitness details are required" },
      { status: 400 },
    );
  }
  const certificate = await issueMedicalCertificate({
    id: body.id,
    patient: body.patient,
    doctorName: doctorName as keyof typeof clinicDoctors,
    issuedOn: body.issuedOn,
    title: title as (typeof certificateTitles)[number],
    diagnosis: body.diagnosis.trim(),
    treatmentSince: body.treatmentSince,
    restDays: body.restDays as number,
    fitToResume: body.fitToResume,
    resumeFrom: body.resumeFrom,
    phoneIssued,
  });
  return NextResponse.json({ certificate }, { status: 201 });
}
