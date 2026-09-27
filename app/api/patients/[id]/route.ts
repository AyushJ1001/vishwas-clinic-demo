import { NextResponse } from "next/server";

import { getPatient } from "../../../../db/patients";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const patient = await getPatient(id);
  return patient
    ? NextResponse.json({ patient })
    : NextResponse.json({ error: "Patient not found" }, { status: 404 });
}
