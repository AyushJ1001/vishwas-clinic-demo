import "regenerator-runtime/runtime";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  PageSizes,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { notoSansBoldUrl, notoSansRegularUrl } from "./prescription-fonts";
import type {
  CompletedPrescriptionDocument,
  PrescriptionDocumentPage,
} from "./prescription-document";
import {
  formatPrescriptionPatientLine,
  formatPrescriptionVitals,
  prescriptionTypography,
  type PrescriptionTextScale,
} from "./prescription-document";

const ink = rgb(0.125, 0.173, 0.161);
const mutedInk = rgb(0.36, 0.43, 0.41);

type PdfFonts = {
  regular: PDFFont;
  bold: PDFFont;
  devanagari?: PDFFont;
  cjk?: PDFFont;
};

const characterSets = new WeakMap<PDFFont, Set<number>>();

function supportsText(font: PDFFont, text: string) {
  let characters = characterSets.get(font);
  if (!characters) {
    characters = new Set(font.getCharacterSet());
    characterSets.set(font, characters);
  }
  return Array.from(text).every((character) =>
    characters.has(character.codePointAt(0)!),
  );
}

function fontForText(text: string, preferred: PDFFont, fonts: PdfFonts) {
  return [preferred, fonts.devanagari, fonts.cjk].find(
    (font): font is PDFFont => Boolean(font && supportsText(font, text)),
  );
}

function textRuns(text: string, preferred: PDFFont, fonts: PdfFonts) {
  const wholeTextFont = fontForText(text, preferred, fonts);
  if (wholeTextFont) return [{ text, font: wholeTextFont }];

  const runs: Array<{ text: string; font: PDFFont }> = [];
  Array.from(text).forEach((character) => {
    const font = fontForText(character, preferred, fonts);
    if (!font) {
      throw new Error(
        `The prescription PDF font set does not support U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}.`,
      );
    }
    const previous = runs.at(-1);
    if (previous && previous.font === font) previous.text += character;
    else runs.push({ text: character, font });
  });
  return runs;
}

function textWidth(
  text: string,
  preferred: PDFFont,
  fonts: PdfFonts,
  size: number,
) {
  return textRuns(text, preferred, fonts).reduce(
    (width, run) => width + run.font.widthOfTextAtSize(run.text, size),
    0,
  );
}

function splitWord(
  word: string,
  preferred: PDFFont,
  fonts: PdfFonts,
  size: number,
  maxWidth: number,
) {
  const pieces: string[] = [];
  let piece = "";
  Array.from(word).forEach((character) => {
    const candidate = `${piece}${character}`;
    if (piece && textWidth(candidate, preferred, fonts, size) > maxWidth) {
      pieces.push(piece);
      piece = character;
    } else {
      piece = candidate;
    }
  });
  if (piece) pieces.push(piece);
  return pieces;
}

function wrapText(
  text: string,
  preferred: PDFFont,
  fonts: PdfFonts,
  size: number,
  maxWidth: number,
) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return ["—"];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const pieces =
      textWidth(word, preferred, fonts, size) > maxWidth
        ? splitWord(word, preferred, fonts, size, maxWidth)
        : [word];
    for (const piece of pieces) {
      const pieceCandidate = line ? `${line} ${piece}` : piece;
      if (
        !line ||
        textWidth(pieceCandidate, preferred, fonts, size) <= maxWidth
      ) {
        line = pieceCandidate;
        continue;
      }
      lines.push(line);
      line = piece;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Mirrors CSS `text-wrap: balance`: keep the same line count but even out the
// line lengths so a centered block does not end with a single stray word.
function balancedWrapText(
  text: string,
  preferred: PDFFont,
  fonts: PdfFonts,
  size: number,
  maxWidth: number,
) {
  const lineCount = wrapText(text, preferred, fonts, size, maxWidth).length;
  if (lineCount < 2) return wrapText(text, preferred, fonts, size, maxWidth);
  let narrow = 0;
  let wide = maxWidth;
  for (let step = 0; step < 12; step += 1) {
    const width = (narrow + wide) / 2;
    if (wrapText(text, preferred, fonts, size, width).length > lineCount) {
      narrow = width;
    } else {
      wide = width;
    }
  }
  return wrapText(text, preferred, fonts, size, wide);
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  preferred: PDFFont,
  fonts: PdfFonts,
  color: ReturnType<typeof rgb>,
) {
  let cursor = x;
  textRuns(text, preferred, fonts).forEach((run) => {
    page.drawText(run.text, { x: cursor, y, size, font: run.font, color });
    cursor += run.font.widthOfTextAtSize(run.text, size);
  });
}

const {
  pageWidth,
  pageHeight,
  pageMargin: margin,
  titleSize,
  ruleThickness,
  leftColumnShare,
} = prescriptionTypography;

// Noto Sans ascent and descent, in em, used to place a baseline inside a line
// box the same way the browser does for the on-screen preview.
const notoAscent = 1.069;
const notoDescent = 0.293;

function baselineOffset(size: number, boxHeight: number) {
  return (
    (boxHeight - size * (notoAscent + notoDescent)) / 2 + size * notoAscent
  );
}

function drawPlannedLines(
  page: PDFPage,
  lines: PrescriptionDocumentPage["clinical"][number]["lines"],
  x: number,
  top: number,
  fonts: PdfFonts,
  { fontSize, lineHeight }: PrescriptionTextScale,
) {
  lines.forEach((line, index) => {
    drawText(
      page,
      line.text,
      x,
      top - index * lineHeight - baselineOffset(fontSize, lineHeight),
      fontSize,
      line.tone === "strong" ? fonts.bold : fonts.regular,
      fonts,
      line.tone === "muted" ? mutedInk : ink,
    );
  });
  return top - lines.length * lineHeight;
}

function drawPage(
  pdfPage: PDFPage,
  documentPage: PrescriptionDocumentPage,
  fonts: PdfFonts,
) {
  const { text: scale } = documentPage;
  const { fontSize, lineHeight, ruleGap: gap, registrationSize } = scale;
  const bulletIndent = fontSize;
  const left = margin;
  const right = pageWidth - margin;
  const contentWidth = right - left;
  const baseline = baselineOffset(fontSize, lineHeight);
  const { regular, bold } = fonts;
  let top = pageHeight - margin;

  const line = (
    text: string,
    preferred: PDFFont,
    align: "left" | "center" | "right" = "left",
    x: number = left,
    color = ink,
  ) => {
    const width = textWidth(text, preferred, fonts, fontSize);
    const start =
      align === "center"
        ? (pageWidth - width) / 2
        : align === "right"
          ? right - width
          : x;
    drawText(
      pdfPage,
      text,
      start,
      top - baseline,
      fontSize,
      preferred,
      fonts,
      color,
    );
  };
  const wrapped = (
    text: string,
    preferred: PDFFont,
    align: "left" | "center" = "left",
  ) => {
    const wrap = align === "center" ? balancedWrapText : wrapText;
    wrap(text, preferred, fonts, fontSize, contentWidth).forEach((row) => {
      line(row, preferred, align);
      top -= lineHeight;
    });
  };
  const rule = () => {
    top -= gap;
    pdfPage.drawLine({
      start: { x: left, y: top - ruleThickness / 2 },
      end: { x: right, y: top - ruleThickness / 2 },
      thickness: ruleThickness,
      color: ink,
    });
    top -= ruleThickness + gap;
  };

  const titleBox = titleSize * 1.2;
  const titleWidth = bold.widthOfTextAtSize(
    documentPage.clinic.name,
    titleSize,
  );
  pdfPage.drawText(documentPage.clinic.name, {
    x: (pageWidth - titleWidth) / 2,
    y: top - baselineOffset(titleSize, titleBox),
    size: titleSize,
    font: bold,
    color: ink,
  });
  top -= titleBox + gap;

  line(documentPage.doctor.name, bold);
  top -= lineHeight;
  const qualifications = `${documentPage.doctor.qualifications} · `;
  line(qualifications, regular);
  drawText(
    pdfPage,
    documentPage.doctor.registration,
    left + textWidth(qualifications, regular, fonts, fontSize),
    top - baseline,
    registrationSize,
    regular,
    fonts,
    ink,
  );
  top -= lineHeight;
  if (documentPage.doctor.mobile) {
    line(`Mobile: ${documentPage.doctor.mobile}`, bold);
    top -= lineHeight;
  }
  if (documentPage.doctor.specialty) {
    wrapped(documentPage.doctor.specialty, regular);
  }
  rule();

  wrapped(documentPage.clinic.address, regular, "center");
  wrapped(documentPage.clinic.hours, regular, "center");
  wrapped(documentPage.clinic.services, regular, "center");
  rule();

  const nameLabel = "Name: ";
  const nameIndent = textWidth(nameLabel, regular, fonts, fontSize);
  line(nameLabel, regular);
  wrapText(
    documentPage.patient.name || "—",
    bold,
    fonts,
    fontSize,
    contentWidth - nameIndent,
  ).forEach((row) => {
    line(row, bold, "left", left + nameIndent);
    top -= lineHeight;
  });
  line(formatPrescriptionPatientLine(documentPage.patient), regular);
  line(`Date: ${documentPage.consultationDate}`, regular, "right");
  top -= lineHeight;
  wrapped(formatPrescriptionVitals(documentPage.vitals).join(" · "), regular);
  rule();

  if (documentPage.clinical.length) {
    documentPage.clinical.forEach((chunk, index) => {
      if (index > 0) top -= gap;
      let lines = chunk.lines;
      if (chunk.continued) {
        line(`${chunk.label} (continued):`, bold);
        top -= lineHeight;
      } else {
        const label = `${chunk.label}: `;
        line(label, bold);
        line(
          lines[0].text,
          regular,
          "left",
          left + textWidth(label, bold, fonts, fontSize),
        );
        top -= lineHeight;
        lines = lines.slice(1);
      }
      top = drawPlannedLines(pdfPage, lines, left, top, fonts, scale);
    });
    rule();
  }

  const footerRows = [...documentPage.footer];
  const footerTop =
    margin + (footerRows.length + 1) * lineHeight + gap + ruleThickness;
  const columnsTop = top;
  const divider = left + contentWidth * leftColumnShare;

  documentPage.leftColumn.forEach((section, index) => {
    if (index > 0) top -= gap;
    line(section.title, bold);
    top -= lineHeight;
    section.chunks.forEach((chunk) => {
      line("•", regular);
      top = drawPlannedLines(
        pdfPage,
        chunk.lines,
        left + bulletIndent,
        top,
        fonts,
        scale,
      );
    });
  });

  pdfPage.drawLine({
    start: { x: divider, y: columnsTop },
    end: { x: divider, y: footerTop },
    thickness: ruleThickness,
    color: ink,
  });

  const medicineLeft = divider + gap * 2;
  top = columnsTop;
  if (documentPage.medicines.length) {
    line("Rx  Medicines", bold, "left", medicineLeft);
    line("Read the instructions carefully", regular, "right");
    top -= lineHeight * 2;
  }
  documentPage.medicines.forEach((medicine, index) => {
    if (index > 0) top -= gap;
    if (medicine.continued) {
      line(
        `${medicine.medicineNumber}. Medicine continued`,
        bold,
        "left",
        medicineLeft,
      );
      top -= lineHeight;
    }
    top = drawPlannedLines(
      pdfPage,
      medicine.lines,
      medicineLeft,
      top,
      fonts,
      scale,
    );
  });

  top = footerTop;
  pdfPage.drawLine({
    start: { x: left, y: top - ruleThickness / 2 },
    end: { x: right, y: top - ruleThickness / 2 },
    thickness: ruleThickness,
    color: ink,
  });
  top -= ruleThickness + gap;
  footerRows.forEach((row) => {
    line(row, regular, "center");
    top -= lineHeight;
  });
  line(
    `Page ${documentPage.number} of ${documentPage.count}`,
    regular,
    "center",
    left,
    mutedInk,
  );
}

async function fetchFont(url: string) {
  const separator = url.includes("?") ? "&" : "?";
  const response = await fetch(
    `${url}${separator}prescription-font-request=${crypto.randomUUID()}`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error("Prescription font could not be loaded.");
  return response.arrayBuffer();
}

function requiredFallbacks(document: CompletedPrescriptionDocument) {
  const text = JSON.stringify(document.pages);
  return {
    cjk: /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(text),
    devanagari: /[\u0900-\u097f]/u.test(text),
  };
}

export async function generatePrescriptionPdf(
  document: CompletedPrescriptionDocument,
) {
  const fallbacks = requiredFallbacks(document);
  const [regularBytes, boldBytes, devanagariBytes, cjkBytes] =
    await Promise.all([
      fetchFont(notoSansRegularUrl),
      fetchFont(notoSansBoldUrl),
      fallbacks.devanagari
        ? import("./prescription-devanagari-font").then(
            ({ notoSansDevanagariRegularUrl }) =>
              fetchFont(notoSansDevanagariRegularUrl),
          )
        : Promise.resolve(null),
      fallbacks.cjk
        ? import("./prescription-cjk-font").then(({ notoSansScRegularUrl }) =>
            fetchFont(notoSansScRegularUrl),
          )
        : Promise.resolve(null),
    ]);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`Prescription for ${document.pages[0].patient.name}`);
  pdf.setSubject(`Completed prescription ${document.snapshotId}`);
  pdf.setCreator("Vishwas Clinic");
  const fonts: PdfFonts = {
    regular: await pdf.embedFont(regularBytes, { subset: true }),
    bold: await pdf.embedFont(boldBytes, { subset: true }),
    devanagari: devanagariBytes
      ? await pdf.embedFont(devanagariBytes, { subset: true })
      : undefined,
    cjk: cjkBytes ? await pdf.embedFont(cjkBytes, { subset: true }) : undefined,
  };
  document.pages.forEach((documentPage) => {
    const page = pdf.addPage(PageSizes.A5);
    drawPage(page, documentPage, fonts);
  });
  return pdf.save({ useObjectStreams: false });
}
