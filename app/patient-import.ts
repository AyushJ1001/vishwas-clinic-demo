import type { PatientSex } from "./consultation-model";

export type ParsedPatientRow = {
  // The Patient number from the old system; blank to assign the next one.
  number: string;
  name: string;
  age: string;
  // YYYY-MM-DD, or blank when not given.
  dateOfBirth: string;
  // Blank means "not given", so an import never overwrites a known value.
  sex: PatientSex | "";
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

export function normalizePatientSex(value: unknown): PatientSex | "" {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  if (["f", "female", "femail", "woman", "w"].includes(text)) return "Female";
  if (["m", "male", "man"].includes(text)) return "Male";
  if (["o", "other", "nonbinary", "non-binary"].includes(text)) return "Other";
  return "";
}

function normalizeAge(value: unknown) {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? text : "";
}

function normalizePatientNumber(value: unknown) {
  const text = String(value ?? "").trim().replace(/^#/u, "");
  return /^\d{1,9}$/.test(text) && Number(text) > 0 ? String(Number(text)) : "";
}

function isRealBirthDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 1900 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

// Registers in India write dates day first: 31/12/1980, 31-12-1980 or
// 31.12.1980. ISO dates (1980-12-31) are accepted too.
export function normalizeDateOfBirth(value: unknown) {
  const text = String(value ?? "").trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/u.exec(text);
  const dayFirst = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/u.exec(text);
  const [year, month, day] = iso
    ? [iso[1], iso[2], iso[3]].map(Number)
    : dayFirst
      ? [dayFirst[3], dayFirst[2], dayFirst[1]].map(Number)
      : [0, 0, 0];
  if (!isRealBirthDate(year, month, day)) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizePhone(value: unknown) {
  const text = String(value ?? "").trim();
  return /^[+0-9 ()-]{4,20}$/.test(text) ? text : "";
}

type RawPatientRow = Record<string, unknown>;

function pickValue(row: RawPatientRow, keys: string[]) {
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = key.trim().toLowerCase().replace(/[\s_.-]+/gu, "");
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
    number: normalizePatientNumber(
      pickValue(row, ["number", "patientnumber", "patientno", "no", "patientid", "id", "regno"]),
    ),
    name: normalizePatientName(name) ? name.trim() : "",
    age: normalizeAge(pickValue(row, ["age", "ageyears", "years"])),
    dateOfBirth: normalizeDateOfBirth(
      pickValue(row, ["dateofbirth", "dob", "birthdate", "born"]),
    ),
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
  number: "number",
  patientnumber: "number",
  patientno: "number",
  no: "number",
  patientid: "number",
  id: "number",
  regno: "number",
  dateofbirth: "dob",
  dob: "dob",
  birthdate: "dob",
  born: "dob",
  name: "name",
  patient: "name",
  patientname: "name",
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

function normalizeHeader(cell: string) {
  return cell.toLowerCase().replace(/[\s_.-]+/gu, "");
}

function rowsFromCsv(text: string, problems: PatientParseProblem[]) {
  // Keep each line's position in the pasted text so problems point at the
  // row the doctor actually sees, even when blank lines are skipped.
  const lines = text
    .split(/\r?\n/)
    .map((line, index) => ({ text: line.trim(), number: index + 1 }))
    .filter((line) => line.text.length > 0);
  if (!lines.length) return [];
  const headerCells = splitCsvLine(lines[0].text).map(normalizeHeader);
  const hasHeader = headerCells.some((cell) => Object.hasOwn(csvHeaderKeys, cell));
  const columns = hasHeader
    ? headerCells.map((cell) =>
        Object.hasOwn(csvHeaderKeys, cell) ? csvHeaderKeys[cell] : "",
      )
    : ["name", "age", "sex", "phone"];
  if (hasHeader) lines.shift();
  const rows: ParsedPatientRow[] = [];
  lines.forEach((line) => {
    const cells = splitCsvLine(line.text);
    const record: RawPatientRow = {};
    columns.forEach((column, columnIndex) => {
      if (column) record[column] = cells[columnIndex] ?? "";
    });
    const row = rowFromObject(record);
    if (!row || !normalizePatientName(row.name)) {
      problems.push({
        source: `Row ${line.number}`,
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
    typeof row.number === "string" &&
      /^\d{0,9}$/.test(row.number) &&
      typeof row.dateOfBirth === "string" &&
      (row.dateOfBirth === "" || normalizeDateOfBirth(row.dateOfBirth) === row.dateOfBirth) &&
      typeof row.name === "string" &&
      normalizePatientName(row.name).length > 0 &&
      row.name.trim().length <= 120 &&
      typeof row.age === "string" &&
      /^\d*$/.test(row.age) &&
      typeof row.sex === "string" &&
      (row.sex === "" || patientSexes.has(row.sex)) &&
      typeof row.phone === "string" &&
      row.phone.length <= 20,
  );
}
