import { NextResponse } from "next/server";
import { listCompletedDemoVisits } from "../../../db/prior-visits";

export async function GET() {
  return NextResponse.json({ visits: await listCompletedDemoVisits() });
}
