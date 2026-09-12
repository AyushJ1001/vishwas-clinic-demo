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
import { formatPrescriptionVitals } from "./prescription-document";

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

function drawWrappedText({
  page,
  text,
  x,
  y,
  width,
  font,
  fonts,
  size,
  lineHeight = size * 1.35,
  color = ink,
}: {
  page: PDFPage;
  text: string;
  x: number;
  y: number;
  width: number;
  font: PDFFont;
  fonts: PdfFonts;
  size: number;
  lineHeight?: number;
  color?: ReturnType<typeof rgb>;
}) {
  const lines = wrapText(text, font, fonts, size, width);
  lines.forEach((line, index) => {
    drawText(page, line, x, y - index * lineHeight, size, font, fonts, color);
  });
  return y - lines.length * lineHeight;
}

function drawPlannedLines(
  page: PDFPage,
  lines: PrescriptionDocumentPage["clinical"][number]["lines"],
  x: number,
  y: number,
  fonts: PdfFonts,
) {
  const lineHeight = 9.5;
  lines.forEach((line, index) => {
    const preferred = line.tone === "strong" ? fonts.bold : fonts.regular;
    const size = line.tone === "muted" ? 6.5 : 7.2;
    drawText(
      page,
      line.text,
      x,
      y - index * lineHeight,
      size,
      preferred,
      fonts,
      line.tone === "muted" ? mutedInk : ink,
    );
  });
  return y - lines.length * lineHeight;
}

function drawPage(
  pdfPage: PDFPage,
  documentPage: PrescriptionDocumentPage,
  font: PDFFont,
  bold: PDFFont,
  fonts: PdfFonts,
) {
  const [pageWidth] = PageSizes.A5;
  let y = 570;
  const titleSize = 15;
  const titleWidth = bold.widthOfTextAtSize(
    documentPage.clinic.name,
    titleSize,
  );
  pdfPage.drawText(documentPage.clinic.name, {
    x: (pageWidth - titleWidth) / 2,
    y,
    size: titleSize,
    font: bold,
    color: ink,
  });
  y -= 22;
  pdfPage.drawText(documentPage.doctor.name, {
    x: 24,
    y,
    size: 9,
    font: bold,
    color: ink,
  });
  y -= 11;
  pdfPage.drawText(
    `${documentPage.doctor.qualifications} · ${documentPage.doctor.registration}`,
    { x: 24, y, size: 7, font, color: ink },
  );
  if (documentPage.doctor.mobile) {
    pdfPage.drawText(`Mobile: ${documentPage.doctor.mobile}`, {
      x: 300,
      y: y + 11,
      size: 7,
      font: bold,
      color: ink,
    });
  }
  if (documentPage.doctor.specialty) {
    y = drawWrappedText({
      page: pdfPage,
      text: documentPage.doctor.specialty,
      x: 24,
      y: y - 10,
      width: 371,
      font,
      fonts,
      size: 6.5,
    });
  } else {
    y -= 11;
  }
  y = drawWrappedText({
    page: pdfPage,
    text: documentPage.clinic.address,
    x: 24,
    y,
    width: 371,
    font,
    fonts,
    size: 6.5,
  });
  y = drawWrappedText({
    page: pdfPage,
    text: documentPage.clinic.hours,
    x: 24,
    y,
    width: 371,
    font,
    fonts,
    size: 6.5,
  });
  y = drawWrappedText({
    page: pdfPage,
    text: documentPage.clinic.services,
    x: 24,
    y,
    width: 371,
    font,
    fonts,
    size: 6.5,
  });
  y -= 2;
  pdfPage.drawLine({
    start: { x: 24, y },
    end: { x: 395, y },
    thickness: 1.2,
    color: ink,
  });

  y -= 15;
  y = drawWrappedText({
    page: pdfPage,
    text: `Name: ${documentPage.patient.name || "—"}`,
    x: 24,
    y,
    width: 371,
    font,
    fonts,
    size: 7.2,
  });
  y -= 2;
  const demographics = `Age/Sex: ${documentPage.patient.age || "—"}/${documentPage.patient.sex || "—"}`;
  drawText(pdfPage, demographics, 24, y, 7.2, font, fonts, ink);
  const date = `Date: ${documentPage.consultationDate}`;
  drawText(
    pdfPage,
    date,
    395 - textWidth(date, font, fonts, 7.2),
    y,
    7.2,
    font,
    fonts,
    ink,
  );
  y -= 16;
  y = drawWrappedText({
    page: pdfPage,
    text: formatPrescriptionVitals(documentPage.vitals).join(" · "),
    x: 24,
    y,
    width: 371,
    font,
    fonts,
    size: 7,
  });
  y -= 5;
  documentPage.clinical.forEach((chunk) => {
    const label = `${chunk.label}${chunk.continued ? " (continued)" : ""}:`;
    drawText(pdfPage, label, 24, y, 7.2, bold, fonts, ink);
    y = drawPlannedLines(pdfPage, chunk.lines, 24, y - 9.5, fonts) - 9.5;
  });
  pdfPage.drawLine({
    start: { x: 24, y },
    end: { x: 395, y },
    thickness: 0.7,
    color: ink,
  });

  const columnsTop = y - 14;
  let leftY = columnsTop;
  documentPage.leftColumn.forEach((section) => {
    drawText(pdfPage, section.title, 24, leftY, 8, bold, fonts, ink);
    leftY -= 12;
    section.chunks.forEach((chunk) => {
      chunk.lines.forEach((line, lineIndex) => {
        drawText(
          pdfPage,
          `${lineIndex === 0 ? "• " : "  "}${line.text}`,
          24,
          leftY,
          7,
          font,
          fonts,
          ink,
        );
        leftY -= 9.5;
      });
      leftY -= 9.5;
    });
  });

  pdfPage.drawLine({
    start: { x: 153, y: columnsTop + 8 },
    end: { x: 153, y: 58 },
    thickness: 0.5,
    color: mutedInk,
  });
  if (documentPage.medicines.length) {
    drawText(pdfPage, "Rx  Medicines", 166, columnsTop, 9, bold, fonts, ink);
  }
  let medicineY = columnsTop - 16;
  documentPage.medicines.forEach((medicine) => {
    if (medicine.continued) {
      drawText(
        pdfPage,
        `${medicine.medicineNumber}. Medicine continued`,
        166,
        medicineY,
        7.2,
        bold,
        fonts,
        ink,
      );
      medicineY -= 9.5;
    }
    medicineY = drawPlannedLines(
      pdfPage,
      medicine.lines,
      166,
      medicineY,
      fonts,
    );
    medicineY -= 9.5;
  });

  pdfPage.drawLine({
    start: { x: 24, y: 51 },
    end: { x: 395, y: 51 },
    thickness: 0.7,
    color: ink,
  });
  documentPage.footer.forEach((line, index) => {
    const size = 6;
    const width = font.widthOfTextAtSize(line, size);
    pdfPage.drawText(line, {
      x: (pageWidth - width) / 2,
      y: 40 - index * 8,
      size,
      font,
      color: ink,
    });
  });
  const pageLabel = `Page ${documentPage.number} of ${documentPage.count}`;
  pdfPage.drawText(pageLabel, {
    x: 395 - font.widthOfTextAtSize(pageLabel, 5.5),
    y: 18,
    size: 5.5,
    font,
    color: mutedInk,
  });
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
    drawPage(page, documentPage, fonts.regular, fonts.bold, fonts);
  });
  return pdf.save({ useObjectStreams: false });
}
