import { NextResponse } from "next/server";

import { getMonthlySummary } from "../../../db/summaries";

export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("month") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json(
      { error: "Month must use YYYY-MM" },
      { status: 400 },
    );
  }
  return NextResponse.json({ summary: await getMonthlySummary(month) });
}
