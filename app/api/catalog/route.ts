import { NextResponse } from "next/server";
import { addCatalogEntry, listCatalogEntries } from "../../../db/catalog";

const catalogNames = new Set([
  "symptoms",
  "findings",
  "diagnoses",
  "medicines",
  "advice",
  "investigations",
]);

export async function GET(request: Request) {
  const catalog = new URL(request.url).searchParams.get("catalog") || "";
  if (!catalogNames.has(catalog))
    return NextResponse.json({ error: "Unknown catalog" }, { status: 400 });
  return NextResponse.json({ entries: await listCatalogEntries(catalog) });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    catalog?: string;
    groupName?: string;
    itemName?: string;
  };
  const catalog = body.catalog?.trim() || "";
  const groupName = body.groupName?.trim() || "";
  const itemName = body.itemName?.trim() || "";
  if (!catalogNames.has(catalog) || !groupName || !itemName)
    return NextResponse.json(
      { error: "Catalog, category, and item are required" },
      { status: 400 },
    );
  const entry = await addCatalogEntry(catalog, groupName, itemName);
  return NextResponse.json({ entry }, { status: 201 });
}
