import { NextResponse } from "next/server";
import { searchPatients, upsertPatient } from "../../../db/patients";
import { isValidPatientInput } from "../../patient-import";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const limitParam = Number(new URL(request.url).searchParams.get("limit"));
  const limit = Number.isSafeInteger(limitParam) && limitParam > 0
    ? Math.min(limitParam, 25)
    : undefined;
  return NextResponse.json({
    patients: await searchPatients(query, limit),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown;
  if (!isValidPatientInput(body)) {
    return NextResponse.json(
      { error: "A patient name is required, and age must be a whole number." },
      { status: 400 },
    );
  }
  const { record, created } = await upsertPatient(body);
  return NextResponse.json({ patient: record, created }, { status: created ? 201 : 200 });
}
