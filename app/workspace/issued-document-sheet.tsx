"use client";

import type {
  MedicalCertificateSnapshot,
  ReceiptSnapshot,
} from "../issued-document-model";
import {
  formatDocumentDate,
  rupeesInWords,
  titledName,
} from "../issued-document-model";
import { DocumentLetterhead, PageFrame } from "./document-sheet";

const documentPageStyle = {
  "--rx-margin": "24pt",
  "--rx-font-size": "9pt",
  "--rx-line-height": "13pt",
  "--rx-title-size": "14pt",
  "--rx-registration-size": "8pt",
  "--rx-rule": "0.5pt",
  "--rx-gap": "5pt",
} as React.CSSProperties;

export function formatRupees(amountPaise: number) {
  return `₹${new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(amountPaise / 100)}`;
}

export function ReceiptSheet({
  receipt,
  ariaLabel,
}: {
  receipt: ReceiptSnapshot;
  ariaLabel: string;
}) {
  return (
    <div className="prescription-pages paper-sheet">
      <PageFrame>
        <article
          className="prescription-page issued-document-page"
          style={documentPageStyle}
          aria-label={ariaLabel}
        >
          <DocumentLetterhead clinic={receipt.clinic} doctor={receipt.doctor} />
          <h3 className="issued-document-title">Receipt</h3>
          <dl className="issued-document-meta">
            <div>
              <dt>Receipt no.</dt>
              <dd>{receipt.receiptNumber}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{formatDocumentDate(receipt.issuedOn)}</dd>
            </div>
            <div>
              <dt>Patient no.</dt>
              <dd>{receipt.patient.number ?? "Pending patient number"}</dd>
            </div>
          </dl>
          <p className="issued-document-statement">
            Received with thanks a sum of rupees{" "}
            <b>{new Intl.NumberFormat("en-IN").format(receipt.amountPaise / 100)}</b>{" "}
            from <b>{titledName(receipt.title, receipt.patient.name)}</b> for the
            consultation charges today.
          </p>
          <div className="issued-amount">
            <b>{formatRupees(receipt.amountPaise)}</b>
            <span>{rupeesInWords(receipt.amountPaise / 100)}</span>
          </div>
          <div className="issued-signature">
            <span>Signature</span>
            <b>{receipt.doctor.name}</b>
          </div>
        </article>
      </PageFrame>
    </div>
  );
}

function pronouns(sex: MedicalCertificateSnapshot["patient"]["sex"]) {
  if (sex === "Male")
    return { subject: "He", object: "him", possessive: "his", was: "was" };
  if (sex === "Female")
    return { subject: "She", object: "her", possessive: "her", was: "was" };
  return { subject: "They", object: "them", possessive: "their", was: "were" };
}

export function MedicalCertificateSheet({
  certificate,
  ariaLabel,
}: {
  certificate: MedicalCertificateSnapshot;
  ariaLabel: string;
}) {
  const words = pronouns(certificate.patient.sex);
  return (
    <div className="prescription-pages paper-sheet">
      <PageFrame>
        <article
          className="prescription-page issued-document-page"
          style={documentPageStyle}
          aria-label={ariaLabel}
        >
          <DocumentLetterhead
            clinic={certificate.clinic}
            doctor={certificate.doctor}
          />
          <h3 className="issued-document-title">Medical certificate</h3>
          <dl className="issued-document-meta issued-document-meta-four">
            <div>
              <dt>Patient no.</dt>
              <dd>{certificate.patient.number ?? "Pending patient number"}</dd>
            </div>
            <div>
              <dt>Age</dt>
              <dd>{certificate.patient.age || "—"}</dd>
            </div>
            <div>
              <dt>Gender</dt>
              <dd>{certificate.patient.sex}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{formatDocumentDate(certificate.issuedOn)}</dd>
            </div>
          </dl>
          <p className="issued-treatment-duration">
            <b>Treatment duration:</b>{" "}
            {formatDocumentDate(certificate.treatmentSince)} to{" "}
            {formatDocumentDate(certificate.issuedOn)}
          </p>
          <p className="issued-document-statement">
            This is to certify that{" "}
            <b>{titledName(certificate.title, certificate.patient.name)}</b> is
            under my treatment since{" "}
            <b>{formatDocumentDate(certificate.treatmentSince)}</b>.{" "}
            {words.subject} {words.was} suffering from{" "}
            <b>{certificate.diagnosis || "—"}</b> and {words.was} advised rest for{" "}
            <b>
              {certificate.restDays} {certificate.restDays === 1 ? "day" : "days"}
            </b>
            .
          </p>
          <p className="issued-document-statement issued-document-followup">
            On examination today, I found {words.object}{" "}
            {certificate.fitToResume ? (
              <>
                fit to resume {words.possessive} duties from the next working day
                ({formatDocumentDate(certificate.resumeFrom)}).
              </>
            ) : (
              <>not yet fit to resume {words.possessive} duties.</>
            )}
          </p>
          <div className="issued-signature">
            <span>Signature</span>
            <b>{certificate.doctor.name}</b>
          </div>
        </article>
      </PageFrame>
    </div>
  );
}
