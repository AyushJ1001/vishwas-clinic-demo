import type { PatientSex } from "./consultation-model";

export type ParsedPatientRow = {
  name: string;
  age: string;
  sex: PatientSex;
  phone: string;
};

export type PatientParseProblem = {
  source: string;
  message: string;
};

export type PatientParseResult = {
  rows: ParsedPatientRow[];
  problems: PatientParseProblem[];
};

const patientSexes = new Set(["Female", "Male", "Other"]);

export function normalizePatientName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/gu, " ");
}

export function normalizePatientSex(value: unknown): PatientSex {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  if (["f", "female", "femail", "woman", "w"].includes(text)) return "Female";
  if (["m", "male", "man"].includes(text)) return "Male";
  if (["o", "other", "nonbinary", "non-binary", "unknown"].includes(text))
    return "Other";
  return "Other";
}

function normalizeAge(value: unknown) {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? text : "";
}

function normalizePhone(value: unknown) {
  const text = String(value ?? "").trim();
  return /^[+0-9 ()-]{4,20}$/.test(text) ? text : "";
}

type RawPatientRow = Record<string, unknown>;

function pickValue(row: RawPatientRow, keys: string[]) {
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = key.trim().toLowerCase().replace(/[\s_-]+/gu, "");
    if (keys.includes(normalizedKey) && String(value ?? "").trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function rowFromObject(value: unknown): ParsedPatientRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as RawPatientRow;
  const name = pickValue(row, ["name", "patientname", "patient", "fullname"]);
  if (!name) return null;
  return {
    name: normalizePatientName(name) ? name.trim() : "",
    age: normalizeAge(pickValue(row, ["age", "ageyears", "years"])),
    sex: normalizePatientSex(pickValue(row, ["sex", "gender"])),
    phone: normalizePhone(pickValue(row, ["phone", "mobile", "phonenumber", "contact", "contactnumber"])),
  };
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        current += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      cells.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current.trim());
  return cells;
}

const csvHeaderKeys: Record<string, string> = {
  name: "name",
  patient: "name",
  patientname: "name",
  "patient name": "name",
  fullname: "name",
  age: "age",
  ageyears: "age",
  years: "age",
  sex: "sex",
  gender: "sex",
  phone: "phone",
  mobile: "phone",
  phonenumber: "phone",
  contact: "phone",
  contactnumber: "phone",
};

function rowsFromCsv(text: string, problems: PatientParseProblem[]) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (!lines.length) return [];
  const headerCells = splitCsvLine(lines[0]).map((cell) =>
    cell.toLowerCase().replace(/[\s_-]+/gu, " ").trim(),
  );
  const hasHeader = headerCells.some((cell) => cell in csvHeaderKeys);
  const columns = hasHeader
    ? headerCells.map((cell) => csvHeaderKeys[cell] ?? "")
    : ["name", "age", "sex", "phone"];
  if (hasHeader) lines.shift();
  const rows: ParsedPatientRow[] = [];
  lines.forEach((line, index) => {
    const cells = splitCsvLine(line);
    const record: RawPatientRow = {};
    columns.forEach((column, columnIndex) => {
      if (column) record[column] = cells[columnIndex] ?? "";
    });
    const row = rowFromObject(record);
    if (!row || !normalizePatientName(row.name)) {
      problems.push({
        source: `Row ${index + (hasHeader ? 2 : 1)}`,
        message: "Name is missing, so the row was skipped.",
      });
      return;
    }
    rows.push(row);
  });
  return rows;
}

export function parsePatientImportText(text: string): PatientParseResult {
  const rows: ParsedPatientRow[] = [];
  const problems: PatientParseProblem[] = [];
  const trimmed = text.trim();
  if (!trimmed) return { rows, problems };
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return {
        rows,
        problems: [
          { source: "JSON", message: "The text is not valid JSON." },
        ],
      };
    }
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as RawPatientRow).patients)
        ? ((parsed as RawPatientRow).patients as unknown[])
        : null;
    if (!list) {
      return {
        rows,
        problems: [
          {
            source: "JSON",
            message: "Expected a JSON array of patient objects.",
          },
        ],
      };
    }
    list.forEach((entry, index) => {
      const row = rowFromObject(entry);
      if (!row || !normalizePatientName(row.name)) {
        problems.push({
          source: `Item ${index + 1}`,
          message: "Name is missing, so the item was skipped.",
        });
        return;
      }
      rows.push(row);
    });
    return { rows, problems };
  }
  return { rows: rowsFromCsv(trimmed, problems), problems };
}

export function isValidPatientInput(value: unknown): value is ParsedPatientRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<ParsedPatientRow>;
  return Boolean(
    typeof row.name === "string" &&
      normalizePatientName(row.name).length > 0 &&
      row.name.trim().length <= 120 &&
      typeof row.age === "string" &&
      /^\d*$/.test(row.age) &&
      typeof row.sex === "string" &&
      patientSexes.has(row.sex) &&
      typeof row.phone === "string" &&
      row.phone.length <= 20,
  );
}
