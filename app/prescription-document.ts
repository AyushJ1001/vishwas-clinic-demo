import type {
  ClinicIdentitySnapshot,
  CompletedMedicineSnapshot,
  CompletedPrescriptionSnapshot,
  Consultation,
  DoctorIdentitySnapshot,
} from "./consultation-model";
import { formatConsultationDate } from "./consultation-model";

export const prescriptionFooter = [
  "No substitutes · Bring the prescription at the next visit",
  "Prescription is valid for the given person and duration only",
] as const;

// Shared by the on-screen preview and the PDF so both render the same A5 sheet.
// All measurements are in points (1pt = 1/72 inch).
export const prescriptionTypography = {
  pageMargin: 24,
  fontSize: 9,
  lineHeight: 12,
  titleSize: 16,
  registrationSize: 7,
  ruleThickness: 0.75,
  ruleGap: 5,
} as const;

export const emptyPrescriptionValue = "—";
export const emptyPrescriptionList = "None entered";

export function formatPrescriptionVitals(vitals: Consultation["vitals"]) {
  return [
    `Weight ${vitals.weight || emptyPrescriptionValue} kg`,
    `Temperature ${vitals.temperature || emptyPrescriptionValue} °F`,
    `Pulse ${vitals.pulse || emptyPrescriptionValue} /min`,
    `BP ${vitals.systolic || emptyPrescriptionValue}/${vitals.diastolic || emptyPrescriptionValue} mmHg`,
    `SpO₂ ${vitals.spo2 || emptyPrescriptionValue}%`,
  ] as const;
}

export function formatMedicineDirections(
  medicine: Pick<CompletedMedicineSnapshot, "dose" | "method" | "duration">,
) {
  return `${medicine.dose || "Dose not set"} · ${medicine.method || "Method not set"} · ${medicine.duration || "Duration not set"}`;
}

export type PrescriptionTextLine = {
  text: string;
  tone: "normal" | "muted" | "strong";
};

export type PrescriptionClinicalChunk = {
  key: "complaints" | "examination" | "diagnosis";
  label: string;
  continued: boolean;
  lines: readonly PrescriptionTextLine[];
};

export type PrescriptionListChunk = {
  key: string;
  continued: boolean;
  lines: readonly PrescriptionTextLine[];
};

export type PrescriptionListSection = {
  key: "advice" | "investigations";
  title: "Advice" | "Investigations";
  chunks: readonly PrescriptionListChunk[];
};

export type PrescriptionMedicineChunk = {
  key: string;
  medicineNumber: number;
  continued: boolean;
  lines: readonly PrescriptionTextLine[];
};

export type PrescriptionDocumentPage = {
  number: number;
  count: number;
  clinic: ClinicIdentitySnapshot;
  doctor: DoctorIdentitySnapshot;
  patient: Consultation["patient"];
  consultationDate: string;
  vitals: Consultation["vitals"];
  clinical: readonly PrescriptionClinicalChunk[];
  leftColumn: readonly PrescriptionListSection[];
  medicines: readonly PrescriptionMedicineChunk[];
  footer: typeof prescriptionFooter;
};

export type PrescriptionDocumentSource = {
  clinic: ClinicIdentitySnapshot;
  doctor: DoctorIdentitySnapshot;
  patient: Consultation["patient"];
  consultationDate: string;
  vitals: Consultation["vitals"];
  complaints: readonly string[];
  examinationFindings: readonly string[];
  provisionalDiagnosis: string;
  advice: readonly string[];
  investigations: readonly string[];
  medicines: readonly CompletedMedicineSnapshot[];
  footer: typeof prescriptionFooter;
};

export type CompletedPrescriptionDocument = {
  snapshotId: string;
  draftId: string;
  fileName: string;
  documentVersion: CompletedPrescriptionSnapshot["documentVersion"];
  layout: {
    version: CompletedPrescriptionSnapshot["layoutVersion"];
    pageSize: "A5";
    orientation: "portrait";
  };
  pages: readonly PrescriptionDocumentPage[];
};

const a5ContentBudget = {
  linesPerColumn: 23,
  fullWidthEm: 36,
  leftColumnEm: 7.5,
  medicineColumnEm: 22,
} as const;

type PendingChunk = {
  key: string;
  label?: string;
  lines: PrescriptionTextLine[];
  cursor: number;
};

type PendingListChunk = PendingChunk & {
  section: PrescriptionListSection["key"];
  title: PrescriptionListSection["title"];
};

type PendingMedicineChunk = PendingChunk & {
  medicineNumber: number;
};

type MutableListSection = Omit<PrescriptionListSection, "chunks"> & {
  chunks: PrescriptionListChunk[];
};

function glyphMeasure(character: string) {
  if (/\p{Mark}/u.test(character)) return 0;
  if (/\s/u.test(character)) return 0.34;
  if (/[ijl.,'’:·]/u.test(character)) return 0.27;
  if (character === "-") return 0.33;
  if (character === "–") return 0.5;
  if (/[mwMW]/u.test(character)) return 0.94;
  if (/[a-z]/u.test(character)) return 0.63;
  if (character === "I") return 0.34;
  if (character === "J") return 0.28;
  if (/[A-Z]/u.test(character)) return 0.79;
  if (/[0-9]/u.test(character)) return 0.58;
  return 1;
}

function measuredWidth(text: string) {
  return Array.from(text).reduce(
    (width, character) => width + glyphMeasure(character),
    0,
  );
}

function splitToken(token: string, measure: number) {
  const pieces: string[] = [];
  let piece = "";
  for (const character of Array.from(token)) {
    if (piece && measuredWidth(`${piece}${character}`) > measure) {
      pieces.push(piece);
      piece = character;
    } else {
      piece += character;
    }
  }
  if (piece) pieces.push(piece);
  return pieces;
}

function wrapMeasuredText(text: string, measure: number) {
  const normalized = text.trim() || emptyPrescriptionValue;
  const lines: string[] = [];
  let line = "";
  for (const word of normalized.split(/\s+/u)) {
    const pieces =
      measuredWidth(word) > measure ? splitToken(word, measure) : [word];
    for (const [pieceIndex, piece] of pieces.entries()) {
      const separator = line && pieceIndex === 0 ? " " : "";
      const candidate = `${line}${separator}${piece}`;
      if (!line || measuredWidth(candidate) <= measure) {
        line = candidate;
      } else {
        lines.push(line);
        line = piece;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textLines(
  text: string,
  measure: number,
  tone: PrescriptionTextLine["tone"] = "normal",
) {
  return wrapMeasuredText(text, measure).map((line) => ({ text: line, tone }));
}

function patientContextLines(source: PrescriptionDocumentSource) {
  const patientLines = wrapMeasuredText(
    `Name: ${source.patient.name || emptyPrescriptionValue}`,
    a5ContentBudget.fullWidthEm,
  ).length;
  return Math.max(0, patientLines - 1);
}

function takePendingChunk<TPending extends PendingChunk>(
  pending: TPending,
  available: number,
  maximum: number,
  overhead: number,
) {
  const remainingLines = pending.lines.length - pending.cursor;
  const wholeCost = remainingLines + overhead;
  if (wholeCost <= available) {
    const lines = pending.lines.slice(pending.cursor);
    pending.cursor = pending.lines.length;
    return { lines, used: wholeCost };
  }
  if (wholeCost <= maximum || available <= overhead) return null;
  const lineCount = Math.max(1, available - overhead);
  const lines = pending.lines.slice(pending.cursor, pending.cursor + lineCount);
  pending.cursor += lines.length;
  return { lines, used: lines.length + overhead };
}

function hasPending(entries: readonly PendingChunk[]) {
  return entries.some((entry) => entry.cursor < entry.lines.length);
}

function paginateClinical(
  queue: PendingChunk[],
  available: number,
  maximum: number,
) {
  const chunks: PrescriptionClinicalChunk[] = [];
  let used = 0;
  for (const pending of queue) {
    if (pending.cursor >= pending.lines.length) continue;
    const continued = pending.cursor > 0;
    const result = takePendingChunk(pending, available - used, maximum, 2);
    if (!result) break;
    chunks.push({
      key: pending.key as PrescriptionClinicalChunk["key"],
      label: pending.label!,
      continued,
      lines: result.lines,
    });
    used += result.used;
    if (pending.cursor < pending.lines.length) break;
  }
  return { chunks, used };
}

function paginateLeftColumn(
  queue: PendingListChunk[],
  available: number,
  maximum: number,
) {
  const sections: MutableListSection[] = [];
  let used = 0;
  let activeSection: MutableListSection | undefined;
  for (const pending of queue) {
    if (pending.cursor >= pending.lines.length) continue;
    const continued = pending.cursor > 0;
    const sectionOverhead = activeSection?.key === pending.section ? 0 : 2;
    const result = takePendingChunk(
      pending,
      available - used,
      maximum - sectionOverhead,
      1 + sectionOverhead,
    );
    if (!result) break;
    if (!activeSection || activeSection.key !== pending.section) {
      activeSection = {
        key: pending.section,
        title: pending.title,
        chunks: [],
      };
      sections.push(activeSection);
    }
    activeSection.chunks.push({
      key: pending.key,
      continued,
      lines: result.lines,
    });
    used += result.used;
    if (pending.cursor < pending.lines.length) break;
  }
  return { sections, used };
}

function paginateMedicines(
  queue: PendingMedicineChunk[],
  available: number,
  maximum: number,
) {
  const chunks: PrescriptionMedicineChunk[] = [];
  let used = 0;
  for (const pending of queue) {
    if (pending.cursor >= pending.lines.length) continue;
    const continued = pending.cursor > 0;
    const headingCost = chunks.length ? 0 : 2;
    const continuationCost = pending.cursor > 0 ? 1 : 0;
    const result = takePendingChunk(
      pending,
      available - used,
      maximum - headingCost,
      1 + continuationCost + headingCost,
    );
    if (!result) break;
    chunks.push({
      key: `${pending.key}-${pending.cursor}`,
      medicineNumber: pending.medicineNumber,
      continued,
      lines: result.lines,
    });
    used += result.used;
    if (pending.cursor < pending.lines.length) break;
  }
  return { chunks, used };
}

function buildQueues(source: PrescriptionDocumentSource) {
  const clinical: PendingChunk[] = [
    {
      key: "complaints",
      label: "Major complaints",
      lines: textLines(
        source.complaints.join(", "),
        a5ContentBudget.fullWidthEm,
      ),
      cursor: 0,
    },
    {
      key: "examination",
      label: "Examination findings",
      lines: textLines(
        source.examinationFindings.join(", "),
        a5ContentBudget.fullWidthEm,
      ),
      cursor: 0,
    },
    {
      key: "diagnosis",
      label: "Provisional diagnosis",
      lines: textLines(
        source.provisionalDiagnosis,
        a5ContentBudget.fullWidthEm,
      ),
      cursor: 0,
    },
  ];
  const left: PendingListChunk[] = [];
  const addList = (
    section: PendingListChunk["section"],
    title: PendingListChunk["title"],
    items: readonly string[],
  ) => {
    (items.length ? items : [emptyPrescriptionList]).forEach((item, index) => {
      left.push({
        key: `${section}-${index}`,
        section,
        title,
        lines: textLines(item, a5ContentBudget.leftColumnEm),
        cursor: 0,
      });
    });
  };
  addList("advice", "Advice", source.advice);
  addList("investigations", "Investigations", source.investigations);

  const medicines: PendingMedicineChunk[] = source.medicines.map(
    (medicine, index) => ({
      key: `medicine-${index}`,
      medicineNumber: index + 1,
      lines: [
        ...textLines(
          `${index + 1}. ${medicine.name}`,
          a5ContentBudget.medicineColumnEm,
          "strong",
        ),
        ...textLines(
          medicine.composition,
          a5ContentBudget.medicineColumnEm,
          "muted",
        ),
        ...textLines(
          formatMedicineDirections(medicine),
          a5ContentBudget.medicineColumnEm,
        ),
      ],
      cursor: 0,
    }),
  );
  return { clinical, left, medicines };
}

export function createPrescriptionDocumentPages(
  source: PrescriptionDocumentSource,
): readonly PrescriptionDocumentPage[] {
  const queues = buildQueues(source);
  const capacity = Math.max(
    12,
    a5ContentBudget.linesPerColumn - patientContextLines(source),
  );
  const pageContents: Array<
    Pick<PrescriptionDocumentPage, "clinical" | "leftColumn" | "medicines">
  > = [];

  do {
    const clinical = paginateClinical(queues.clinical, capacity, capacity);
    const remainingAfterClinical = hasPending(queues.clinical)
      ? 0
      : capacity - clinical.used;
    const columnsAvailable =
      remainingAfterClinical >= 6 ? remainingAfterClinical : 0;
    const left = paginateLeftColumn(queues.left, columnsAvailable, capacity);
    const medicines = paginateMedicines(
      queues.medicines,
      columnsAvailable,
      capacity,
    );
    const madeProgress =
      clinical.used > 0 || left.used > 0 || medicines.used > 0;
    if (!madeProgress && pageContents.length > 0) {
      throw new Error("Prescription pagination could not make progress.");
    }
    pageContents.push({
      clinical: clinical.chunks,
      leftColumn: left.sections,
      medicines: medicines.chunks,
    });
  } while (
    hasPending(queues.clinical) ||
    hasPending(queues.left) ||
    hasPending(queues.medicines)
  );

  const count = pageContents.length;
  return pageContents.map((content, index) => ({
    number: index + 1,
    count,
    clinic: source.clinic,
    doctor: source.doctor,
    patient: source.patient,
    consultationDate: source.consultationDate,
    vitals: source.vitals,
    ...content,
    footer: source.footer,
  }));
}

function prescriptionFileName(snapshot: CompletedPrescriptionSnapshot) {
  const patient = snapshot.consultation.patient.name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `vishwas-prescription-${patient || snapshot.id}.pdf`;
}

function freezeChunk<T extends { lines: readonly PrescriptionTextLine[] }>(
  chunk: T,
) {
  chunk.lines.forEach((line) => Object.freeze(line));
  Object.freeze(chunk.lines);
  return Object.freeze(chunk);
}

function freezePage(page: PrescriptionDocumentPage) {
  Object.freeze(page.clinic);
  Object.freeze(page.doctor);
  Object.freeze(page.patient);
  Object.freeze(page.vitals);
  page.clinical.forEach(freezeChunk);
  page.leftColumn.forEach((section) => {
    section.chunks.forEach(freezeChunk);
    Object.freeze(section.chunks);
    Object.freeze(section);
  });
  page.medicines.forEach(freezeChunk);
  Object.freeze(page.clinical);
  Object.freeze(page.leftColumn);
  Object.freeze(page.medicines);
  Object.freeze(page.footer);
  return Object.freeze(page);
}

export function createCompletedPrescriptionDocument(
  snapshot: CompletedPrescriptionSnapshot,
): CompletedPrescriptionDocument {
  const consultation = structuredClone(snapshot.consultation);
  const source: PrescriptionDocumentSource = {
    clinic: { ...snapshot.clinic },
    doctor: { ...snapshot.doctor },
    patient: { ...consultation.patient },
    consultationDate: formatConsultationDate(consultation.consultationDate),
    vitals: { ...consultation.vitals },
    complaints: [...consultation.complaints],
    examinationFindings: [...consultation.examinationFindings],
    provisionalDiagnosis: consultation.provisionalDiagnosis,
    advice: [...consultation.advice],
    investigations: [...consultation.investigations],
    medicines: snapshot.medicines.map((medicine) => ({ ...medicine })),
    footer: prescriptionFooter,
  };
  const pages = createPrescriptionDocumentPages(source).map(freezePage);
  const document = {
    snapshotId: snapshot.id,
    draftId: snapshot.draftId,
    fileName: prescriptionFileName(snapshot),
    documentVersion: snapshot.documentVersion,
    layout: Object.freeze({
      version: snapshot.layoutVersion,
      pageSize: "A5" as const,
      orientation: "portrait" as const,
    }),
    pages: Object.freeze(pages),
  };
  return Object.freeze(document);
}
