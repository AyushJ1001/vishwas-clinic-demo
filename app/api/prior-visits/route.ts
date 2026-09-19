import { NextResponse } from "next/server";
import { listPriorVisits } from "../../../db/prior-visits";

export async function GET(request: Request) {
  const patientId = new URL(request.url).searchParams.get("patientId") ?? "";
  return NextResponse.json({ visits: await listPriorVisits(patientId) });
}
