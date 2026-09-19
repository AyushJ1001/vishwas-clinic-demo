import { NextResponse } from "next/server";

import { clinicDoctors } from "../../clinic-facts";
import type { ConsultationPatient } from "../../consultation-model";
import { receiptTitles } from "../../issued-document-model";
import {
  getReceipt,
  issueReceipt,
  listRecentReceipts,
  nextReceiptNumber,
} from "../../../db/issued-documents";

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
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  if (id) {
    const receipt = await getReceipt(id);
    return receipt
      ? NextResponse.json({ receipt })
      : NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }
  return NextResponse.json({
    nextNumber: await nextReceiptNumber(),
    receipts: await listRecentReceipts(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const amountPaise = body?.amountPaise;
  const doctorName = body?.doctorName;
  const title = body?.title;
  if (
    !body ||
    !validId(body.id) ||
    !validPatient(body.patient) ||
    typeof doctorName !== "string" ||
    !(doctorName in clinicDoctors) ||
    !validDate(body.issuedOn) ||
    typeof title !== "string" ||
    !receiptTitles.includes(title as (typeof receiptTitles)[number]) ||
    !Number.isSafeInteger(amountPaise) ||
    (amountPaise as number) <= 0 ||
    (amountPaise as number) % 100 !== 0
  ) {
    return NextResponse.json(
      { error: "Patient, date, title, and a positive whole-rupee amount are required" },
      { status: 400 },
    );
  }
  const receipt = await issueReceipt({
    id: body.id,
    patient: body.patient,
    doctorName: doctorName as keyof typeof clinicDoctors,
    issuedOn: body.issuedOn,
    title: title as (typeof receiptTitles)[number],
    amountPaise: amountPaise as number,
  });
  return NextResponse.json({ receipt }, { status: 201 });
}
