"use client";

import Image from "next/image";
import { useEffect, type CSSProperties } from "react";
import {
  clinicDoctors,
  clinicIdentity,
  resolveMedicineComposition,
} from "../clinic-facts";
import {
  formatConsultationDate,
  type Consultation,
} from "../consultation-model";
import {
  createPrescriptionDocumentPages,
  formatPrescriptionPatientLine,
  formatPrescriptionVitals,
  prescriptionFooter,
  prescriptionTypography,
  type PrescriptionDocumentPage,
} from "../prescription-document";
import { prescriptionTextFontFace } from "../prescription-fonts";
import { DocumentLetterhead, PageFrame } from "./document-sheet";



export function PrescriptionPreview({ consultation }: { consultation: Consultation }) {
  const pages = createDraftPrescriptionPages(consultation);
  return (
    <div className="paper-sheet">
      <p className="paper-preview-caption">
        <b>Draft prescription</b>
        <span>
          A5, {pages.length} {pages.length === 1 ? "page" : "pages"}
        </span>
      </p>
      <PrescriptionDocument pages={pages} ariaLabel="Draft prescription preview" />
    </div>
  );
}

export function createDraftPrescriptionPages(consultation: Consultation) {
  return createPrescriptionDocumentPages({
    clinic: clinicIdentity,
    doctor: clinicDoctors[consultation.doctorName],
    patient: consultation.patient,
    consultationDate: formatConsultationDate(consultation.consultationDate),
    vitals: consultation.vitals,
    complaints: consultation.complaints,
    examinationFindings: consultation.examinationFindings,
    provisionalDiagnosis: consultation.provisionalDiagnosis,
    advice: consultation.advice,
    investigations: consultation.investigations,
    medicines: consultation.medicines.map((medicine) => ({
      ...medicine,
      composition: resolveMedicineComposition(medicine.name),
    })),
    footer: prescriptionFooter,
  });
}

export function prescriptionPageStyle({ text }: PrescriptionDocumentPage) {
  return {
    "--rx-margin": `${prescriptionTypography.pageMargin}pt`,
    "--rx-font-size": `${text.fontSize}pt`,
    "--rx-line-height": `${text.lineHeight}pt`,
    "--rx-title-size": `${prescriptionTypography.titleSize}pt`,
    "--rx-registration-size": `${text.registrationSize}pt`,
    "--rx-rule": `${prescriptionTypography.ruleThickness}pt`,
    "--rx-gap": `${text.ruleGap}pt`,
  } as CSSProperties;
}

export function PrescriptionDocument({
  pages,
  ariaLabel,
}: {
  pages: readonly PrescriptionDocumentPage[];
  ariaLabel: string;
}) {
  useEffect(() => {
    const addFontFace = async (
      id: string,
      load: () => Promise<{ fontFace: string }>,
    ) => {
      if (document.getElementById(id)) return;
      const { fontFace } = await load();
      if (document.getElementById(id)) return;
      const style = document.createElement("style");
      style.id = id;
      style.textContent = fontFace;
      document.head.appendChild(style);
    };
    void addFontFace("prescription-text-font-face", async () => ({
      fontFace: prescriptionTextFontFace,
    }));
    const pageText = JSON.stringify(pages);
    if (/[\u0900-\u097f]/u.test(pageText)) {
      void addFontFace("prescription-devanagari-font-face", () =>
        import("../prescription-devanagari-font").then(
          ({ prescriptionDevanagariFontFace }) => ({
            fontFace: prescriptionDevanagariFontFace,
          }),
        ),
      );
    }
    if (/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(pageText)) {
      void addFontFace("prescription-cjk-font-face", () =>
        import("../prescription-cjk-font").then(
          ({ prescriptionCjkFontFace }) => ({
            fontFace: prescriptionCjkFontFace,
          }),
        ),
      );
    }
  }, [pages]);

  return (
    <div className="prescription-pages">
      {pages.map((page) => (
        <PageFrame key={page.number}>
            <article
              aria-label={ariaLabel}
              data-page-number={page.number}
              data-page-count={page.count}
              style={prescriptionPageStyle(page)}
              className="prescription-page"
            >
              <DocumentLetterhead clinic={page.clinic} doctor={page.doctor} />
              <div className="rx-patient rx-block">
                <p>
                  Name: <b>{page.patient.name || "—"}</b>
                </p>
                <p className="rx-patient-row">
                  <span>{formatPrescriptionPatientLine(page.patient)}</span>
                  <span>Date: {page.consultationDate}</span>
                </p>
                <p>{formatPrescriptionVitals(page.vitals).join(" · ")}</p>
              </div>
              {page.clinical.length > 0 && (
                <div className="prescription-clinical rx-block">
                  {page.clinical.map((chunk) => (
                    <section
                      key={`${chunk.key}-${chunk.continued}`}
                      className="rx-section"
                    >
                      {chunk.continued && (
                        <b className="block">{chunk.label} (continued):</b>
                      )}
                      {chunk.lines.map((line, index) => (
                        <span key={`${line.text}-${index}`} className="block">
                          {index === 0 && !chunk.continued && (
                            <b>{chunk.label}: </b>
                          )}
                          {line.text}{" "}
                        </span>
                      ))}
                    </section>
                  ))}
                </div>
              )}
              {(page.leftColumn.length > 0 || page.medicines.length > 0) && (
                <div className="prescription-columns">
                  <aside className="rx-left-column">
                    {page.leftColumn.map((section) => (
                      <section
                        key={section.key}
                        className="prescription-list-section rx-section"
                      >
                        <b>{section.title}</b>
                        <ul>
                          {section.chunks.map((chunk) => (
                            <li key={chunk.key}>
                              {chunk.lines.map((line, index) => (
                                <span
                                  key={`${line.text}-${index}`}
                                  className="block"
                                >
                                  {line.text}{" "}
                                </span>
                              ))}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </aside>
                  <section className="rx-medicine-column">
                    {page.medicines.length > 0 && (
                      <div className="rx-medicine-heading">
                        <Image
                          src="/icons/prescription-fill.svg"
                          alt="Prescription"
                          width={34}
                          height={34}
                          className="rx-logo"
                        />
                        <span>Read the instructions carefully</span>
                      </div>
                    )}
                    <div className="prescription-medicines">
                      {page.medicines.map((medicine) => (
                        <div key={medicine.key} className="rx-section">
                          {medicine.continued && (
                            <b className="block">
                              {medicine.medicineNumber}. Medicine continued
                            </b>
                          )}
                          {medicine.lines.map((line, index) => (
                            <span
                              key={`${line.text}-${index}`}
                              className={`block ${line.tone === "strong" ? "font-bold" : line.tone === "muted" ? "rx-muted" : ""}`}
                            >
                              {line.text}{" "}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}
              <footer className="rx-footer">
                {page.footer.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                <p className="prescription-page-number">
                  Page {page.number} of {page.count}
                </p>
              </footer>
            </article>
        </PageFrame>
      ))}
    </div>
  );
}

export function PrescriptionReviewDocument({
  consultation,
}: {
  consultation: Consultation;
}) {
  const pages = createDraftPrescriptionPages(consultation);

  return (
    <div className="w-full min-w-0">
      <p className="hint mb-2 text-center">
        {pages.length} A5 {pages.length === 1 ? "page" : "pages"}
      </p>
      <PrescriptionDocument
        pages={pages}
        ariaLabel="Prescription under review"
      />
    </div>
  );
}
