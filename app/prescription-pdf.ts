import "regenerator-runtime/runtime";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  PageSizes,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import notoSansRegularUrl from "@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf?url";
import notoSansBoldUrl from "@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf?url";
import notoSansDevanagariRegularUrl from "@expo-google-fonts/noto-sans-devanagari/400Regular/NotoSansDevanagari_400Regular.ttf?url";
import notoSansScRegularUrl from "@expo-google-fonts/noto-sans-sc/400Regular/NotoSansSC_400Regular.ttf?url";
import type {
  CompletedPrescriptionDocument,
  PrescriptionDocumentPage,
} from "./prescription-document";
import {
  emptyPrescriptionList,
  formatMedicineDirections,
  formatPrescriptionVitals,
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

function textWidth(text: string, preferred: PDFFont, fonts: PdfFonts, size: number) {
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

function drawLabelValue(
  page: PDFPage,
  label: string,
  value: string,
  y: number,
  font: PDFFont,
  bold: PDFFont,
  fonts: PdfFonts,
) {
  const size = 7.2;
  const x = 24;
  drawText(page, label, x, y, size, bold, fonts, ink);
  return drawWrappedText({
    page,
    text: value || "—",
    x: x + bold.widthOfTextAtSize(label, size) + 3,
    y,
    width: 365 - bold.widthOfTextAtSize(label, size),
    font,
    fonts,
    size,
  });
}

function drawList(
  page: PDFPage,
  items: readonly string[],
  x: number,
  y: number,
  width: number,
  font: PDFFont,
  fonts: PdfFonts,
) {
  if (!items.length) {
    return drawWrappedText({
      page,
      text: emptyPrescriptionList,
      x,
      y,
      width,
      font,
      fonts,
      size: 7,
      color: mutedInk,
    });
  }
  let cursor = y;
  items.forEach((item) => {
    cursor = drawWrappedText({
      page,
      text: `• ${item}`,
      x,
      y: cursor,
      width,
      font,
      fonts,
      size: 7,
      lineHeight: 9.5,
    });
  });
  return cursor;
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
  y = drawLabelValue(
    pdfPage,
    "Major complaints:",
    documentPage.complaints.join(", "),
    y,
    font,
    bold,
    fonts,
  );
  y = drawLabelValue(
    pdfPage,
    "Examination findings:",
    documentPage.examinationFindings.join(", "),
    y - 4,
    font,
    bold,
    fonts,
  );
  y = drawLabelValue(
    pdfPage,
    "Provisional diagnosis:",
    documentPage.provisionalDiagnosis,
    y - 4,
    font,
    bold,
    fonts,
  );
  y -= 2;
  pdfPage.drawLine({
    start: { x: 24, y },
    end: { x: 395, y },
    thickness: 0.7,
    color: ink,
  });

  const columnsTop = y - 16;
  pdfPage.drawText("Advice", {
    x: 24,
    y: columnsTop,
    size: 8,
    font: bold,
    color: ink,
  });
  const leftY =
    drawList(
      pdfPage,
      documentPage.advice,
      24,
      columnsTop - 12,
      118,
      font,
      fonts,
    ) - 8;
  pdfPage.drawText("Investigations", {
    x: 24,
    y: leftY,
    size: 8,
    font: bold,
    color: ink,
  });
  drawList(
    pdfPage,
    documentPage.investigations,
    24,
    leftY - 12,
    118,
    font,
    fonts,
  );

  pdfPage.drawLine({
    start: { x: 153, y: columnsTop + 8 },
    end: { x: 153, y: 58 },
    thickness: 0.5,
    color: mutedInk,
  });
  pdfPage.drawText("Rx  Medicines", {
    x: 166,
    y: columnsTop,
    size: 9,
    font: bold,
    color: ink,
  });
  let medicineY = columnsTop - 16;
  documentPage.medicines.forEach((medicine, index) => {
    medicineY = drawWrappedText({
      page: pdfPage,
      text: `${index + 1}. ${medicine.name}`,
      x: 166,
      y: medicineY,
      width: 229,
      font: bold,
      fonts,
      size: 7.5,
    });
    medicineY = drawWrappedText({
      page: pdfPage,
      text: medicine.composition,
      x: 166,
      y: medicineY,
      width: 229,
      font,
      fonts,
      size: 6.5,
      color: mutedInk,
    });
    medicineY = drawWrappedText({
      page: pdfPage,
      text: formatMedicineDirections(medicine),
      x: 166,
      y: medicineY - 1,
      width: 229,
      font,
      fonts,
      size: 7.2,
    });
    medicineY -= 7;
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
  const [regularBytes, boldBytes, devanagariBytes, cjkBytes] = await Promise.all([
    fetchFont(notoSansRegularUrl),
    fetchFont(notoSansBoldUrl),
    fallbacks.devanagari
      ? fetchFont(notoSansDevanagariRegularUrl)
      : Promise.resolve(null),
    fallbacks.cjk ? fetchFont(notoSansScRegularUrl) : Promise.resolve(null),
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
    cjk: cjkBytes
      ? await pdf.embedFont(cjkBytes, { subset: true })
      : undefined,
  };
  document.pages.forEach((documentPage) => {
    const page = pdf.addPage(PageSizes.A5);
    drawPage(page, documentPage, fonts.regular, fonts.bold, fonts);
  });
  return pdf.save({ useObjectStreams: false });
}
