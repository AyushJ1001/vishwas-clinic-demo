"use client";

import {
  ArrowLeft,
  FileText,
  Paperclip,
  Receipt,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { getClinicPc } from "../clinic-pc";
import {
  formatConsultationDate,
  type PatientRecord,
  type PriorVisitSnapshot,
} from "../consultation-model";
import type {
  MedicalCertificateSnapshot,
  ReceiptSnapshot,
} from "../issued-document-model";
import {
  formatFileSize,
  patientDocumentAccept,
  patientDocumentMaxBytes,
  patientDocumentSignatureLength,
  patientDocumentTypeOf,
  patientDocumentTypes,
  patientDocumentTypesHint,
  type PatientDocument,
} from "../patient-document-model";

import { formatRupees } from "./issued-document-sheet";
import { PageHeader } from "./shell";

type PatientHistory = {
  visits: PriorVisitSnapshot[];
  receipts: ReceiptSnapshot[];
  certificates: MedicalCertificateSnapshot[];
};

type RecordState =
  | { status: "loading" | "failed" | "missing" }
  | { status: "ready"; patient: PatientRecord; history: PatientHistory };

type DocumentList =
  | { status: "loading" | "failed" }
  | { status: "ready"; documents: PatientDocument[]; canChange: boolean };

type DocumentMessage = { kind: "done" | "error"; lines: string[] };

function patientPath(patientId: string) {
  return `/api/patients/${encodeURIComponent(patientId)}`;
}

function formatAddedDate(addedAt: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(addedAt));
}

/** Why this file cannot be added, or nothing once it is saved. */
async function addDocument(patientId: string, file: File) {
  if (file.size > patientDocumentMaxBytes) return "it is larger than 10 MB.";
  const start = new Uint8Array(
    await file.slice(0, patientDocumentSignatureLength).arrayBuffer(),
  );
  if (!patientDocumentTypeOf(start)) {
    return "only PDF, JPG and PNG files can be added.";
  }
  const response = await fetch(
    `${patientPath(patientId)}/documents?name=${encodeURIComponent(file.name)}`,
    { method: "POST", body: file },
  ).catch(() => null);
  return response?.ok ? null : "it could not be saved. Try again.";
}

function PatientDocuments({ patientId }: { patientId: string }) {
  const [list, setList] = useState<DocumentList>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState<DocumentMessage | null>(null);
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const clinicPc = getClinicPc();
  const documentsPath = `${patientPath(patientId)}/documents`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(documentsPath, { signal: controller.signal })
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{
              documents: PatientDocument[];
              canChange: boolean;
            }>)
          : Promise.reject(new Error("patient documents failed")),
      )
      .then((data) => setList({ status: "ready", ...data }))
      .catch(() => {
        if (!controller.signal.aborted) setList({ status: "failed" });
      });
    return () => controller.abort();
  }, [documentsPath, reloadKey]);

  const addFiles = async (files: File[]) => {
    if (!files.length) return;
    setMessage(null);
    const problems: string[] = [];
    for (const [index, file] of files.entries()) {
      setProgress(
        files.length === 1
          ? `Adding ${file.name}…`
          : `Adding ${index + 1} of ${files.length}…`,
      );
      const problem = await addDocument(patientId, file);
      if (problem) problems.push(`${file.name} was not added: ${problem}`);
    }
    const added = files.length - problems.length;
    setProgress("");
    setMessage(
      problems.length
        ? { kind: "error", lines: problems }
        : {
            kind: "done",
            lines: [`${added} document${added === 1 ? "" : "s"} added.`],
          },
    );
    setReloadKey((key) => key + 1);
  };

  const openOnClinicPc = async (document: PatientDocument) => {
    if (!clinicPc) return;
    setBusyDocumentId(document.id);
    setMessage(null);
    try {
      const response = await fetch(
        `${documentsPath}/${encodeURIComponent(document.id)}`,
      );
      if (!response.ok) throw new Error("patient document failed");
      const result = await clinicPc.patientDocuments.open(
        document.name,
        new Uint8Array(await response.arrayBuffer()),
      );
      if (result.status === "failed") throw new Error(result.message);
    } catch {
      setMessage({
        kind: "error",
        lines: [`${document.name} could not be opened. Try again.`],
      });
    } finally {
      setBusyDocumentId(null);
    }
  };

  const remove = async (document: PatientDocument) => {
    if (
      !window.confirm(
        `Remove ${document.name} from this patient's record? It cannot be brought back.`,
      )
    ) {
      return;
    }
    setBusyDocumentId(document.id);
    setMessage(null);
    const response = await fetch(
      `${documentsPath}/${encodeURIComponent(document.id)}`,
      { method: "DELETE" },
    ).catch(() => null);
    setBusyDocumentId(null);
    setMessage(
      response?.ok
        ? { kind: "done", lines: [`${document.name} removed.`] }
        : {
            kind: "error",
            lines: [`${document.name} could not be removed. Try again.`],
          },
    );
    setReloadKey((key) => key + 1);
  };

  const canChange = list.status === "ready" && list.canChange;
  return (
    <section aria-labelledby="patient-documents-heading" className="panel-section">
      <div className="panel-header">
        <div className="min-w-0">
          <h2 id="patient-documents-heading" className="section-title">
            Documents
          </h2>
          {list.status === "ready" && (
            <p className="hint mt-1">
              {list.canChange
                ? `Reports, scans and letters. ${patientDocumentTypesHint}`
                : "Documents are added and removed on the Clinic PC."}
            </p>
          )}
        </div>
        {canChange && (
          <>
            <button
              type="button"
              className="btn btn-primary"
              disabled={Boolean(progress)}
              onClick={() => fileInput.current?.click()}
            >
              <Paperclip size={17} weight="bold" />
              Add documents
            </button>
            <input
              ref={fileInput}
              hidden
              type="file"
              multiple
              accept={patientDocumentAccept}
              aria-label="Choose documents to add"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                void addFiles(files);
              }}
            />
          </>
        )}
      </div>
      {progress && (
        <p className="status-line mb-3" role="status">
          {progress}
        </p>
      )}
      {message && (
        <div
          className={`notice mb-3 ${message.kind === "done" ? "notice-done" : "notice-error"}`}
          role={message.kind === "done" ? "status" : "alert"}
        >
          {message.lines.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
        </div>
      )}
      {list.status !== "ready" ? (
        list.status === "failed" ? (
          <p className="notice notice-error" role="alert">
            This patient&apos;s documents could not be loaded.
          </p>
        ) : (
          <p className="status-line" role="status">
            Loading documents…
          </p>
        )
      ) : list.documents.length === 0 ? (
        <p className="status-line">No documents added for this patient yet.</p>
      ) : (
        <div className="document-register-wrap">
          <table className="document-register">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Kind</th>
                <th scope="col">Size</th>
                <th scope="col">Added</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.documents.map((document) => (
                <tr key={document.id}>
                  <td className="record-document-name">{document.name}</td>
                  <td className="whitespace-nowrap">
                    {patientDocumentTypes[document.contentType].label}
                  </td>
                  <td className="whitespace-nowrap tabular-nums">
                    {formatFileSize(document.byteSize)}
                  </td>
                  <td className="whitespace-nowrap tabular-nums">
                    {formatAddedDate(document.addedAt)}
                  </td>
                  <td>
                    <div className="flex justify-end gap-2">
                      {clinicPc ? (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          aria-label={`Open ${document.name}`}
                          disabled={busyDocumentId === document.id}
                          onClick={() => void openOnClinicPc(document)}
                        >
                          Open
                        </button>
                      ) : (
                        <a
                          className="btn btn-secondary"
                          aria-label={`Open ${document.name}`}
                          href={`${documentsPath}/${encodeURIComponent(document.id)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open
                        </a>
                      )}
                      {list.canChange && (
                        <button
                          type="button"
                          className="btn btn-danger"
                          aria-label={`Remove ${document.name}`}
                          disabled={busyDocumentId === document.id}
                          onClick={() => void remove(document)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type HistoryRow = {
  key: string;
  date: string;
  document: string;
  details: string;
  doctor: string;
};

function historyRows(history: PatientHistory): HistoryRow[] {
  return [
    ...history.visits.map((visit) => ({
      key: `prescription-${visit.id}`,
      date: visit.consultationDate,
      document: "Prescription",
      details: visit.clinicalSummary,
      doctor: visit.doctorName,
    })),
    ...history.receipts.map((receipt) => ({
      key: `receipt-${receipt.id}`,
      date: receipt.issuedOn,
      document: `Receipt no. ${receipt.receiptNumber}`,
      details: formatRupees(receipt.amountPaise),
      doctor: receipt.doctor.name,
    })),
    ...history.certificates.map((certificate) => ({
      key: `certificate-${certificate.id}`,
      date: certificate.issuedOn,
      document: "Medical certificate",
      details: [
        certificate.diagnosis,
        `${certificate.restDays} day${certificate.restDays === 1 ? "" : "s"} rest`,
      ]
        .filter(Boolean)
        .join("; "),
      doctor: certificate.doctor.name,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
}

function PatientHistorySection({ history }: { history: PatientHistory }) {
  const rows = historyRows(history);
  return (
    <section aria-labelledby="patient-history-heading" className="panel-section">
      <div className="panel-header">
        <h2 id="patient-history-heading" className="section-title">
          Issued by the clinic
        </h2>
      </div>
      {rows.length === 0 ? (
        <p className="status-line">
          Nothing has been issued to this patient yet.
        </p>
      ) : (
        <div className="document-register-wrap">
          <table className="document-register">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Document</th>
                <th scope="col">Details</th>
                <th scope="col">Doctor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="whitespace-nowrap tabular-nums">
                    {formatConsultationDate(row.date)}
                  </td>
                  <td className="whitespace-nowrap">{row.document}</td>
                  <td>{row.details}</td>
                  <td className="whitespace-nowrap">{row.doctor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PatientFacts({ patient }: { patient: PatientRecord }) {
  return (
    <section aria-label="Patient details" className="panel-section">
      <dl className="record-facts">
        <div>
          <dt>Patient no.</dt>
          <dd>{patient.number ?? "Pending patient number"}</dd>
        </div>
        <div>
          <dt>Age</dt>
          <dd>{patient.age || "—"}</dd>
        </div>
        {patient.dateOfBirth && !patient.dateOfBirthEstimated && (
          <div>
            <dt>Date of birth</dt>
            <dd>{formatConsultationDate(patient.dateOfBirth)}</dd>
          </div>
        )}
        <div>
          <dt>Gender</dt>
          <dd>{patient.sex}</dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>{patient.phone || "—"}</dd>
        </div>
      </dl>
      {(patient.phoneIssued || patient.possibleDuplicate) && (
        <p className="mt-3 flex flex-wrap gap-2">
          {patient.phoneIssued && (
            <span className="tag tag-muted">Phone-issued</span>
          )}
          {patient.possibleDuplicate && (
            <span className="tag">Possible duplicate</span>
          )}
        </p>
      )}
    </section>
  );
}

/** One Patient's record: who they are, their documents, and what was issued. */
export function PatientRecordView({
  patientId,
  onClose,
}: {
  patientId: string;
  onClose: () => void;
}) {
  const [record, setRecord] = useState<RecordState>({ status: "loading" });
  const isClinicPc = getClinicPc() !== null;

  useEffect(() => {
    const controller = new AbortController();
    const path = patientPath(patientId);
    Promise.all([
      fetch(path, { signal: controller.signal }),
      fetch(`${path}/history`, { signal: controller.signal }),
    ])
      .then(async ([patientResponse, historyResponse]) => {
        if (patientResponse.status === 404) {
          setRecord({ status: "missing" });
          return;
        }
        if (!patientResponse.ok || !historyResponse.ok) {
          throw new Error("patient record failed");
        }
        const { patient } = (await patientResponse.json()) as {
          patient: PatientRecord;
        };
        const history = (await historyResponse.json()) as PatientHistory;
        setRecord({ status: "ready", patient, history });
      })
      .catch(() => {
        if (!controller.signal.aborted) setRecord({ status: "failed" });
      });
    return () => controller.abort();
  }, [patientId]);

  const patientQuery = encodeURIComponent(patientId);
  return (
    <div>
      <button type="button" className="btn btn-quiet mb-1 -ml-2" onClick={onClose}>
        <ArrowLeft size={16} weight="bold" />
        All patients
      </button>
      <PageHeader
        title={record.status === "ready" ? record.patient.name : "Patient record"}
      >
        {record.status === "ready" && (
          <>
            {isClinicPc && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  window.location.assign(`/receipts?patient=${patientQuery}`)
                }
              >
                <Receipt size={18} weight="bold" />
                Receipt
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                window.location.assign(
                  `/medical-certificate?patient=${patientQuery}`,
                )
              }
            >
              <FileText size={18} weight="bold" />
              Medical certificate
            </button>
          </>
        )}
      </PageHeader>
      {record.status !== "ready" ? (
        record.status === "loading" ? (
          <p className="status-line" role="status">
            Loading patient record…
          </p>
        ) : (
          <p className="notice notice-error" role="alert">
            {record.status === "missing"
              ? "This patient record was not found."
              : "This patient record could not be loaded."}
          </p>
        )
      ) : (
        <div className="panel">
          <PatientFacts patient={record.patient} />
          <PatientDocuments patientId={patientId} />
          <PatientHistorySection history={record.history} />
        </div>
      )}
    </div>
  );
}
