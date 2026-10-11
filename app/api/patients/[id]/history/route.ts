import { NextResponse } from "next/server";

import {
  listMedicalCertificatesForPatient,
  listReceiptsForPatient,
} from "../../../../../db/issued-documents";
import { listPriorVisits } from "../../../../../db/prior-visits";

type RouteContext = { params: Promise<{ id: string }> };

/** Everything the clinic has issued to this patient, for their record. */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const [visits, receipts, certificates] = await Promise.all([
    listPriorVisits(id),
    listReceiptsForPatient(id),
    listMedicalCertificatesForPatient(id),
  ]);
  return NextResponse.json({ visits, receipts, certificates });
}
