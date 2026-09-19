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
  pageWidth: 419.53,
  pageHeight: 595.28,
  pageMargin: 24,
  titleSize: 16,
  ruleThickness: 0.75,
  leftColumnShare: 0.32,
  headerIconWidth: 18,
} as const;

export type PrescriptionTextScale = {
  fontSize: number;
  lineHeight: number;
  ruleGap: number;
  registrationSize: number;
};

// One text size is used for the whole prescription. It starts at 9pt and
// steps down together with line and rule spacing only when that keeps the
// prescription on a single page (up to about eight medicines).
export const prescriptionTextScales: readonly PrescriptionTextScale[] = [
  { fontSize: 9, lineHeight: 12, ruleGap: 5, registrationSize: 7 },
  { fontSize: 8.5, lineHeight: 11, ruleGap: 4.5, registrationSize: 6.75 },
  { fontSize: 8, lineHeight: 10, ruleGap: 4, registrationSize: 6.5 },
  { fontSize: 7.5, lineHeight: 9.5, ruleGap: 3.5, registrationSize: 6 },
];

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
  text: PrescriptionTextScale;
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

const {
  pageWidth,
  pageHeight,
  pageMargin,
  titleSize,
  ruleThickness,
  leftColumnShare,
  headerIconWidth,
} = prescriptionTypography;

const contentWidth = pageWidth - pageMargin * 2;
// Glyph widths are rounded up and bold is measured separately; this extra
// margin keeps planned lines from ever re-wrapping in the browser or
// overflowing in the PDF.
const wrapSafety = 0.95;

type PageLayout = ReturnType<typeof createPageLayout>;

function createPageLayout(text: PrescriptionTextScale) {
  const { fontSize, lineHeight, ruleGap } = text;
  const columnMeasure = (width: number) => (width * wrapSafety) / fontSize;
  return {
    text,
    lineHeight,
    ruleGap,
    measures: {
      fullWidth: columnMeasure(contentWidth),
      doctor: columnMeasure(contentWidth - headerIconWidth - ruleGap),
      // The bullet indent is one em.
      leftColumn: columnMeasure(
        contentWidth * leftColumnShare - ruleGap - fontSize,
      ),
      medicineColumn: columnMeasure(
        contentWidth * (1 - leftColumnShare) - ruleGap * 2,
      ),
    },
    // Vertical costs, in points, matching how the preview and PDF draw them.
    ruledBlockCost: ruleGap * 2 + ruleThickness,
    minimumColumnsHeight: lineHeight * 6,
  };
}

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

type FontWeight = "regular" | "bold";

// Noto Sans advance widths in hundredths of an em, rounded up, for the
// characters below. Other characters fall back to their unaccented base
// letter, or to a full em.
const measuredGlyphs = Array.from(
  "!\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~·–—°₂’‘“”×µ•",
);
const glyphWidthsByWeight = {
  regular: [
    27, 41, 65, 58, 84, 74, 23, 30, 30, 56, 58, 27, 33, 27, 38, 58, 58, 58, 58,
    58, 58, 58, 58, 58, 58, 27, 27, 58, 58, 58, 44, 90, 64, 65, 64, 73, 56, 52,
    73, 75, 34, 28, 62, 53, 91, 76, 79, 61, 79, 63, 55, 56, 74, 60, 93, 59, 57,
    58, 33, 38, 33, 58, 45, 29, 57, 62, 48, 62, 57, 35, 62, 62, 26, 26, 54, 26,
    94, 62, 61, 62, 62, 42, 48, 37, 62, 51, 79, 53, 51, 47, 38, 56, 38, 58, 27,
    50, 100, 43, 35, 18, 18, 36, 36, 58, 63, 38,
  ],
  bold: [
    29, 48, 65, 58, 91, 75, 27, 34, 34, 55, 58, 29, 32, 29, 42, 58, 58, 58, 58,
    58, 58, 58, 58, 58, 58, 29, 29, 58, 58, 58, 48, 90, 70, 67, 65, 74, 57, 55,
    73, 77, 39, 34, 67, 56, 95, 82, 80, 63, 80, 66, 56, 58, 76, 65, 97, 67, 63,
    58, 34, 42, 34, 58, 42, 37, 60, 64, 52, 64, 60, 39, 64, 65, 30, 30, 62, 30,
    98, 65, 63, 64, 64, 45, 51, 44, 65, 58, 86, 58, 58, 50, 40, 56, 40, 58, 29,
    50, 100, 43, 38, 22, 22, 45, 45, 58, 66, 38,
  ],
};
const glyphWidths = Object.fromEntries(
  Object.entries(glyphWidthsByWeight).map(([weight, widths]) => [
    weight,
    new Map(measuredGlyphs.map((glyph, index) => [glyph, widths[index] / 100])),
  ]),
) as Record<FontWeight, Map<string, number>>;

function glyphMeasure(character: string, weight: FontWeight) {
  if (/\p{Mark}/u.test(character)) return 0;
  if (/\s/u.test(character)) return 0.26;
  const widths = glyphWidths[weight];
  return (
    widths.get(character) ?? widths.get(character.normalize("NFD")[0]) ?? 1
  );
}

function measuredWidth(text: string, weight: FontWeight) {
  return Array.from(text).reduce(
    (width, character) => width + glyphMeasure(character, weight),
    0,
  );
}

function splitToken(token: string, measure: number, weight: FontWeight) {
  const pieces: string[] = [];
  let piece = "";
  for (const character of Array.from(token)) {
    if (piece && measuredWidth(`${piece}${character}`, weight) > measure) {
      pieces.push(piece);
      piece = character;
    } else {
      piece += character;
    }
  }
  if (piece) pieces.push(piece);
  return pieces;
}

// `prefixWidth` reserves room on the first line for text drawn separately,
// such as a bold label. If nothing fits beside it, the first line is empty.
function wrapMeasuredText(
  text: string,
  measure: number,
  weight: FontWeight = "regular",
  prefixWidth = 0,
) {
  const normalized = text.trim() || emptyPrescriptionValue;
  const lines: string[] = [];
  let line = "";
  const fits = (candidate: string) =>
    measuredWidth(candidate, weight) + (lines.length ? 0 : prefixWidth) <=
    measure;
  const lineIsEmpty = () => !line && (lines.length > 0 || prefixWidth === 0);
  for (const word of normalized.split(/\s+/u)) {
    const pieces =
      measuredWidth(word, weight) > measure
        ? splitToken(word, measure, weight)
        : [word];
    for (const [pieceIndex, piece] of pieces.entries()) {
      const separator = line && pieceIndex === 0 ? " " : "";
      const candidate = `${line}${separator}${piece}`;
      if (lineIsEmpty() || fits(candidate)) {
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
  const weight = tone === "strong" ? "bold" : "regular";
  return wrapMeasuredText(text, measure, weight).map((line) => ({
    text: line,
    tone,
  }));
}

function wrappedLineCount(
  text: string,
  measure: number,
  weight: FontWeight = "regular",
) {
  return text.trim() ? wrapMeasuredText(text, measure, weight).length : 0;
}

// The letterhead, patient details, and footer repeat on every page; whatever
// height remains is the space available for clinical notes and the columns.
function pageBodyCapacity(
  source: PrescriptionDocumentSource,
  layout: PageLayout,
) {
  const { lineHeight, ruleGap, measures, ruledBlockCost } = layout;
  const doctorLines =
    2 +
    (source.doctor.mobile ? 1 : 0) +
    wrappedLineCount(source.doctor.specialty, measures.doctor);
  const clinicLines = [
    source.clinic.address,
    source.clinic.hours,
    source.clinic.services,
  ].reduce(
    (lines, text) => lines + wrappedLineCount(text, measures.fullWidth),
    0,
  );
  const patientLines =
    wrappedLineCount(
      `Name: ${source.patient.name || emptyPrescriptionValue}`,
      measures.fullWidth,
      "bold",
    ) +
    1 +
    wrappedLineCount(
      formatPrescriptionVitals(source.vitals).join(" · "),
      measures.fullWidth,
    );
  const header =
    titleSize * 1.2 +
    ruleGap +
    (doctorLines + clinicLines + patientLines) * lineHeight +
    ruledBlockCost * 3;
  const footer =
    ruleThickness + ruleGap + (source.footer.length + 1) * lineHeight;
  // Leave a little room for the browser rounding points to device pixels.
  return pageHeight - pageMargin * 2 - header - footer - ruleGap;
}

function takePendingChunk<TPending extends PendingChunk>(
  pending: TPending,
  available: number,
  maximum: number,
  overhead: number,
  lineHeight: number,
) {
  const remainingLines = pending.lines.length - pending.cursor;
  const wholeCost = remainingLines * lineHeight + overhead;
  if (wholeCost <= available) {
    const lines = pending.lines.slice(pending.cursor);
    pending.cursor = pending.lines.length;
    return { lines, used: wholeCost };
  }
  // Keep an item whole when it fits on a fresh page; split only items that
  // are taller than a page, and never below one line.
  if (wholeCost <= maximum || available < overhead + lineHeight) return null;
  const lineCount = Math.floor((available - overhead) / lineHeight);
  const lines = pending.lines.slice(pending.cursor, pending.cursor + lineCount);
  pending.cursor += lines.length;
  return { lines, used: lines.length * lineHeight + overhead };
}

function hasPending(entries: readonly PendingChunk[]) {
  return entries.some((entry) => entry.cursor < entry.lines.length);
}

function paginateClinical(
  queue: PendingChunk[],
  available: number,
  maximum: number,
  { lineHeight, ruleGap, ruledBlockCost }: PageLayout,
) {
  const chunks: PrescriptionClinicalChunk[] = [];
  let used = 0;
  for (const pending of queue) {
    if (pending.cursor >= pending.lines.length) continue;
    const continued = pending.cursor > 0;
    // A continued section repeats its label on a line of its own.
    const overhead =
      (continued ? lineHeight : 0) + (chunks.length ? ruleGap : ruledBlockCost);
    const result = takePendingChunk(
      pending,
      available - used,
      maximum,
      overhead,
      lineHeight,
    );
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
  { lineHeight, ruleGap }: PageLayout,
) {
  const sections: MutableListSection[] = [];
  let used = 0;
  let activeSection: MutableListSection | undefined;
  for (const pending of queue) {
    if (pending.cursor >= pending.lines.length) continue;
    const continued = pending.cursor > 0;
    const sectionOverhead =
      activeSection?.key === pending.section
        ? 0
        : lineHeight + (sections.length ? ruleGap : 0);
    const result = takePendingChunk(
      pending,
      available - used,
      maximum,
      sectionOverhead,
      lineHeight,
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
  { lineHeight, ruleGap }: PageLayout,
) {
  const chunks: PrescriptionMedicineChunk[] = [];
  let used = 0;
  const headingCost = lineHeight * 2;
  for (const pending of queue) {
    if (pending.cursor >= pending.lines.length) continue;
    const continued = pending.cursor > 0;
    const overhead =
      (chunks.length ? ruleGap : headingCost) + (continued ? lineHeight : 0);
    const result = takePendingChunk(
      pending,
      available - used,
      maximum,
      overhead,
      lineHeight,
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

// The bold label sits at the start of the first line, so that line is wrapped
// with room reserved for it.
function clinicalQueueEntry(
  key: PrescriptionClinicalChunk["key"],
  label: string,
  text: string,
  measure: number,
): PendingChunk {
  const lines = wrapMeasuredText(
    text,
    measure,
    "regular",
    measuredWidth(`${label}: `, "bold"),
  ).map((line) => ({ text: line, tone: "normal" as const }));
  return { key, label, lines, cursor: 0 };
}

function buildQueues(source: PrescriptionDocumentSource, layout: PageLayout) {
  const { measures } = layout;
  const clinical: PendingChunk[] = [
    clinicalQueueEntry(
      "complaints",
      "Major complaints",
      source.complaints.join(", "),
      measures.fullWidth,
    ),
    clinicalQueueEntry(
      "examination",
      "Examination findings",
      source.examinationFindings.join(", "),
      measures.fullWidth,
    ),
    clinicalQueueEntry(
      "diagnosis",
      "Provisional diagnosis",
      source.provisionalDiagnosis,
      measures.fullWidth,
    ),
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
        lines: textLines(item, measures.leftColumn),
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
          measures.medicineColumn,
          "strong",
        ),
        ...textLines(medicine.composition, measures.medicineColumn, "muted"),
        ...textLines(
          formatMedicineDirections(medicine),
          measures.medicineColumn,
        ),
      ],
      cursor: 0,
    }),
  );
  return { clinical, left, medicines };
}

function paginate(source: PrescriptionDocumentSource, layout: PageLayout) {
  const queues = buildQueues(source, layout);
  const capacity = Math.max(
    layout.minimumColumnsHeight * 2,
    pageBodyCapacity(source, layout),
  );
  const pageContents: Array<
    Pick<PrescriptionDocumentPage, "clinical" | "leftColumn" | "medicines">
  > = [];

  do {
    const clinical = paginateClinical(
      queues.clinical,
      capacity,
      capacity,
      layout,
    );
    const remainingAfterClinical = hasPending(queues.clinical)
      ? 0
      : capacity - clinical.used;
    const columnsAvailable =
      remainingAfterClinical >= layout.minimumColumnsHeight
        ? remainingAfterClinical
        : 0;
    const left = paginateLeftColumn(
      queues.left,
      columnsAvailable,
      capacity,
      layout,
    );
    const medicines = paginateMedicines(
      queues.medicines,
      columnsAvailable,
      capacity,
      layout,
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
  return pageContents;
}

export function createPrescriptionDocumentPages(
  source: PrescriptionDocumentSource,
): readonly PrescriptionDocumentPage[] {
  // Use the largest text that fits everything on one page. Content too long
  // for one page even at the smallest step stays at full size and paginates.
  const [fullSize] = prescriptionTextScales;
  let text = fullSize;
  let pageContents = paginate(source, createPageLayout(fullSize));
  for (const scale of prescriptionTextScales.slice(1)) {
    if (pageContents.length === 1) break;
    const candidate = paginate(source, createPageLayout(scale));
    if (candidate.length === 1) {
      text = scale;
      pageContents = candidate;
    }
  }
  if (pageContents.length > 1 && text !== fullSize) {
    pageContents = paginate(source, createPageLayout(fullSize));
  }

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
    text,
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
  Object.freeze(page.text);
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
