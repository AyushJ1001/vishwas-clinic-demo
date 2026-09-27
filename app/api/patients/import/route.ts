import { NextResponse } from "next/server";
import { importPatients } from "../../../../db/patients";
import { parsePatientImportText } from "../../../patient-import";
import { isPhoneIssuedRequest } from "../../../phone-issued-request";

const maxImportRows = 500;

export async function POST(request: Request) {
  if (isPhoneIssuedRequest(request)) {
    return NextResponse.json(
      { error: "Patients can only be imported on the Clinic PC" },
      { status: 403 },
    );
  }
  const body = (await request.json().catch(() => null)) as {
    patients?: unknown[];
    text?: string;
  } | null;
  if (!body) {
    return NextResponse.json(
      { error: "Send { patients: [...] } or { text: \"...\" } to import." },
      { status: 400 },
    );
  }
  let rows = body.patients;
  if (!Array.isArray(rows)) {
    rows = body.text ? parsePatientImportText(body.text).rows : [];
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json(
      { error: "No patient rows were found to import." },
      { status: 400 },
    );
  }
  if (rows.length > maxImportRows) {
    return NextResponse.json(
      { error: `Import at most ${maxImportRows} patients per request.` },
      { status: 413 },
    );
  }
  const summary = await importPatients(rows);
  return NextResponse.json({ summary });
}
