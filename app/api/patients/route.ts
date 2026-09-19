import { NextResponse } from "next/server";
import { searchPatients } from "../../../db/patients";

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
