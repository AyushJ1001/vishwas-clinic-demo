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
  // Batches keep this position so a server problem can name the original row.
  sourceRow?: number;
};

export type PatientParseProblem = {
  source: string;
  message: string;
};

export type PatientParseResult = {
  rows: ParsedPatientRow[];
  problems: PatientParseProblem[];
};

type PatientImportField =
  | "number"
  | "name"
  | "phone"
  | "sex"
  | "dateOfBirth"
  | "age";

type RawPatientRow = Record<string, unknown>;
type CanonicalPatientRow = Partial<Record<PatientImportField, unknown>>;

const patientSexes = new Set(["Female", "Male", "Other"]);

const headerAliases: Record<string, PatientImportField> = Object.fromEntries(
  (Object.entries({
    number: [
      "regno",
      "registrationno",
      "registrationnumber",
      "regnumber",
      "caseno",
      "casenumber",
      "fileno",
      "opdno",
      "patientno",
      "patientnumber",
      "patientid",
      "uhid",
      "mrn",
      "no",
      "number",
      "id",
    ],
    name: [
      "name",
      "patientname",
      "patientsname",
      "nameofpatient",
      "patient",
      "fullname",
    ],
    phone: [
      "phone",
      "phoneno",
      "phonenumber",
      "mobile",
      "mobileno",
      "mobilenumber",
      "mob",
      "mobno",
      "contact",
      "contactno",
      "contactnumber",
      "cell",
      "cellno",
      "tel",
      "telephone",
    ],
    sex: ["sex", "gender", "mf"],
    dateOfBirth: ["dateofbirth", "dob", "birthdate", "born"],
    age: ["age", "ageyears", "ageyrs", "ageinyears", "years"],
  } satisfies Record<PatientImportField, string[]>) as [
    PatientImportField,
    string[],
  ][]).flatMap(([field, aliases]) =>
    aliases.map((alias) => [alias, field] as const),
  ),
);

export function normalizePatientName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/gu, " ");
}

export function normalizePatientSex(value: unknown): PatientSex | "" {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  if (["f", "female", "femail", "woman", "w", "स्त्री"].includes(text)) {
    return "Female";
  }
  if (["m", "male", "man", "पुरुष"].includes(text)) return "Male";
  if (["o", "other", "nonbinary", "non-binary"].includes(text)) return "Other";
  return "";
}

function normalizeAge(value: unknown) {
  const text = String(value ?? "").trim();
  const match = /^(\d+)\s*(?:(y|yr|yrs|year|years)|(m|month|months))?$/iu.exec(
    text,
  );
  if (!match) return "";
  const amount = Number(match[1]);
  const years = match[3] ? Math.floor(amount / 12) : amount;
  return Number.isSafeInteger(years) && years >= 0 && years <= 130
    ? String(years)
    : "";
}

function normalizePatientNumber(value: unknown) {
  const text = String(value ?? "")
    .trim()
    .replace(/^#\s*/u, "");
  if (!/^\d+$/u.test(text)) return "";
  const number = Number(text);
  return Number.isSafeInteger(number) && number > 0 && number <= 999_999_999
    ? String(number)
    : "";
}

function isRealBirthDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const today = new Date();
  const currentYear = today.getFullYear();
  const todayUtc = Date.UTC(
    currentYear,
    today.getMonth(),
    today.getDate(),
  );
  return (
    year >= 1900 &&
    year <= currentYear &&
    date.getTime() <= todayUtc &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function fullBirthYear(year: string) {
  if (year.length === 4) return Number(year);
  const currentYear = new Date().getFullYear();
  const currentCentury = Math.floor(currentYear / 100) * 100;
  const thisCentury = currentCentury + Number(year);
  return thisCentury <= currentYear ? thisCentury : thisCentury - 100;
}

const birthMonths: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

// Registers in India write dates day first. ISO dates remain accepted because
// the import API also receives already-normalised rows from the preview.
export function normalizeDateOfBirth(value: unknown) {
  const text = String(value ?? "").trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/u.exec(text);
  const dayFirst = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/u.exec(text);
  const named = /^(\d{1,2})[\s-]+([a-z]+)[\s-]+(\d{2}|\d{4})$/iu.exec(text);

  let year = 0;
  let month = 0;
  let day = 0;
  if (iso) {
    [year, month, day] = [iso[1], iso[2], iso[3]].map(Number);
  } else if (dayFirst) {
    year = fullBirthYear(dayFirst[3]);
    month = Number(dayFirst[2]);
    day = Number(dayFirst[1]);
  } else if (named) {
    year = fullBirthYear(named[3]);
    month = birthMonths[named[2].toLowerCase()] ?? 0;
    day = Number(named[1]);
  }
  if (!isRealBirthDate(year, month, day)) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

type NormalizedPhone = {
  value: string;
  leftOut: string;
};

function normalizePhone(value: unknown): NormalizedPhone {
  const original = String(value ?? "").trim();
  const parts = original.split(/\s*(?:\/|,|\bor\b)\s*/iu);
  const first = parts.length > 1 && parts[0] && parts[1] ? parts[0] : original;
  const leftOut = first === original ? "" : parts.slice(1).join(" / ");
  const withoutPandasDecimal = /^\d+\.0$/u.test(first)
    ? first.slice(0, -2)
    : first;

  // A displayed scientific-notation number has already lost digits, so
  // guessing would risk attaching the wrong phone number to a Patient.
  if (/^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/iu.test(withoutPandasDecimal)) {
    return { value: "", leftOut };
  }
  const digits = withoutPandasDecimal.replace(/\D/gu, "");
  const valid =
    /^\+?[0-9 ()-]+$/u.test(withoutPandasDecimal) &&
    digits.length >= 4 &&
    digits.length <= 15 &&
    withoutPandasDecimal.length <= 20;
  return { value: valid ? withoutPandasDecimal : "", leftOut };
}

function normalizeHeader(cell: string) {
  return cell.trim().toLowerCase().replace(/[\s_.\-/():#]+/gu, "");
}

function canonicalRow(row: RawPatientRow) {
  const canonical: CanonicalPatientRow = {};
  for (const [key, value] of Object.entries(row)) {
    const field = headerAliases[normalizeHeader(key)];
    if (
      field &&
      String(value ?? "").trim() &&
      !String(canonical[field] ?? "").trim()
    ) {
      canonical[field] = value;
    }
  }
  return canonical;
}

function quoted(value: unknown) {
  return JSON.stringify(String(value ?? "").trim());
}

function rowFromObject(
  value: unknown,
  source: string,
  sourceRow: number,
  problems: PatientParseProblem[],
): ParsedPatientRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    problems.push({
      source,
      message: source.startsWith("Item ")
        ? "Name is missing, so the item was skipped."
        : "Name is missing, so the row was skipped.",
    });
    return null;
  }
  const row = canonicalRow(value as RawPatientRow);
  const name = String(row.name ?? "").trim();
  if (!normalizePatientName(name)) {
    problems.push({
      source,
      message: source.startsWith("Item ")
        ? "Name is missing, so the item was skipped."
        : "Name is missing, so the row was skipped.",
    });
    return null;
  }

  const reportUnrecognised = (
    field: PatientImportField,
    label: string,
    normalized: string,
  ) => {
    const raw = row[field];
    if (String(raw ?? "").trim() && !normalized) {
      // Excel shows long numbers this way in a narrow column, and copying
      // takes what it shows, so the doctor needs the way to get the digits.
      const shortenedByExcel = /^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/iu.test(
        String(raw).trim(),
      );
      problems.push({
        source,
        message: shortenedByExcel
          ? `${label} ${quoted(raw)} was shortened by Excel, so it was left blank. Widen the column or format it as Text, then copy it again.`
          : `${label} ${quoted(raw)} was not understood, so it was left blank.`,
      });
    }
  };

  const number = normalizePatientNumber(row.number);
  const age = normalizeAge(row.age);
  const dateOfBirth = normalizeDateOfBirth(row.dateOfBirth);
  const sex = normalizePatientSex(row.sex);
  const phone = normalizePhone(row.phone);
  reportUnrecognised("number", "Patient number", number);
  reportUnrecognised("age", "Age", age);
  reportUnrecognised("dateOfBirth", "Date of birth", dateOfBirth);
  reportUnrecognised("sex", "Sex", sex);
  reportUnrecognised("phone", "Phone", phone.value);
  if (phone.leftOut) {
    problems.push({
      source,
      message: `Phone ${quoted(phone.leftOut)} was left out; ${quoted(phone.value)} was kept.`,
    });
  }

  return {
    number,
    name,
    age,
    dateOfBirth,
    sex,
    phone: phone.value,
    sourceRow,
  };
}

function detectDelimiter(headerLine: string) {
  const candidates = ["\t", ";", ","] as const;
  for (const candidate of candidates) {
    let quotedCell = false;
    for (let index = 0; index < headerLine.length; index += 1) {
      if (headerLine[index] === '"') {
        if (quotedCell && headerLine[index + 1] === '"') index += 1;
        else quotedCell = !quotedCell;
      } else if (!quotedCell && headerLine[index] === candidate) {
        return candidate;
      }
    }
  }
  return ",";
}

type DelimitedRow = {
  cells: string[];
  sourceRow: number;
};

function splitDelimitedRows(text: string, delimiter: string) {
  const rows: DelimitedRow[] = [];
  let cells: string[] = [];
  let cell = "";
  let quotedCell = false;
  let sourceRow = 1;
  let line = 1;

  const finishRow = () => {
    cells.push(cell.trim());
    if (cells.length > 1 || cells[0]) rows.push({ cells, sourceRow });
    cells = [];
    cell = "";
    sourceRow = line + 1;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quotedCell && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quotedCell = !quotedCell;
      }
    } else if (!quotedCell && character === delimiter) {
      cells.push(cell.trim());
      cell = "";
    } else if (!quotedCell && (character === "\n" || character === "\r")) {
      finishRow();
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      line += 1;
    } else {
      cell += character;
      if (character === "\n") line += 1;
    }
  }
  if (cell || cells.length > 0) finishRow();
  return rows;
}

type NumberOrigin = { source: string; sourceRow: number };

function addIfNumberIsUnique(
  row: ParsedPatientRow,
  source: string,
  rows: ParsedPatientRow[],
  problems: PatientParseProblem[],
  numberOrigins: Map<string, NumberOrigin>,
) {
  if (row.number) {
    const first = numberOrigins.get(row.number);
    if (first) {
      problems.push({
        source,
        message: `Patient number ${row.number} also appears in ${first.source}. ${source} was skipped.`,
      });
      return;
    }
    numberOrigins.set(row.number, { source, sourceRow: row.sourceRow ?? 0 });
  }
  rows.push(row);
}

function rowsFromDelimitedText(text: string, problems: PatientParseProblem[]) {
  const headerLine = text.split(/\r?\n/u).find((line) => line.trim()) ?? "";
  const delimiter = detectDelimiter(headerLine);
  const sourceRows = splitDelimitedRows(text, delimiter);
  if (!sourceRows.length) return [];
  const firstRow = sourceRows[0];
  const fields = firstRow.cells.map((cell) => headerAliases[normalizeHeader(cell)]);
  const hasHeader = fields.some(Boolean);
  const columns: (PatientImportField | undefined)[] = hasHeader
    ? fields
    : ["name", "age", "sex", "phone"];
  const dataRows = hasHeader ? sourceRows.slice(1) : sourceRows;
  const rows: ParsedPatientRow[] = [];
  const numberOrigins = new Map<string, NumberOrigin>();

  for (const dataRow of dataRows) {
    const record: RawPatientRow = {};
    columns.forEach((field, columnIndex) => {
      if (field && !String(record[field] ?? "").trim()) {
        record[field] = dataRow.cells[columnIndex] ?? "";
      }
    });
    const source = `Row ${dataRow.sourceRow}`;
    const row = rowFromObject(record, source, dataRow.sourceRow, problems);
    if (row) {
      addIfNumberIsUnique(row, source, rows, problems, numberOrigins);
    }
  }
  return rows;
}

export function parsePatientImportText(text: string): PatientParseResult {
  const rows: ParsedPatientRow[] = [];
  const problems: PatientParseProblem[] = [];
  const withoutBom = text.replace(/^\uFEFF/u, "");
  const trimmed = withoutBom.trim();
  if (!trimmed) return { rows, problems };
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return {
        rows,
        problems: [{ source: "JSON", message: "The text is not valid JSON." }],
      };
    }
    const list = Array.isArray(parsed)
      ? parsed
      : parsed &&
          typeof parsed === "object" &&
          Array.isArray((parsed as RawPatientRow).patients)
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
    const numberOrigins = new Map<string, NumberOrigin>();
    list.forEach((entry, index) => {
      const source = `Item ${index + 1}`;
      const row = rowFromObject(entry, source, index + 1, problems);
      if (row) addIfNumberIsUnique(row, source, rows, problems, numberOrigins);
    });
    return { rows, problems };
  }
  return { rows: rowsFromDelimitedText(withoutBom, problems), problems };
}

export function isValidPatientInput(value: unknown): value is ParsedPatientRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<ParsedPatientRow>;
  return Boolean(
    typeof row.number === "string" &&
      (row.number === "" || normalizePatientNumber(row.number) === row.number) &&
      typeof row.dateOfBirth === "string" &&
      (row.dateOfBirth === "" || normalizeDateOfBirth(row.dateOfBirth) === row.dateOfBirth) &&
      typeof row.name === "string" &&
      normalizePatientName(row.name).length > 0 &&
      row.name.trim().length <= 120 &&
      typeof row.age === "string" &&
      (row.age === "" || normalizeAge(row.age) === row.age) &&
      typeof row.sex === "string" &&
      (row.sex === "" || patientSexes.has(row.sex)) &&
      typeof row.phone === "string" &&
      normalizePhone(row.phone).value === row.phone &&
      row.phone.length <= 20 &&
      (row.sourceRow === undefined ||
        (Number.isSafeInteger(row.sourceRow) && row.sourceRow > 0)),
  );
}
