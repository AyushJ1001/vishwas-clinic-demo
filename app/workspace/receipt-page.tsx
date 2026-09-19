"use client";

import { Printer } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import { clinicDoctors, clinicIdentity } from "../clinic-facts";
import {
  toLocalDateInputValue,
  type ConsultationPatient,
  type PatientRecord,
} from "../consultation-model";
import {
  defaultTitleForSex,
  formatDocumentDate,
  receiptTitles,
  type ReceiptSnapshot,
  type ReceiptTitle,
} from "../issued-document-model";
import { PatientNameSearch } from "../patient-search";
import { useAuthor } from "../use-author";
import { RouteWorkspace } from "./a5-workspace";
import {
  documentPatientFromRecord,
  freshDocumentPatient,
} from "./document-patient";
import { formatRupees, ReceiptSheet } from "./issued-document-sheet";
import { PageHeader, Shell } from "./shell";

function ReceiptRegister({
  receipts,
  onOpen,
}: {
  receipts: ReceiptSnapshot[];
  onOpen: (receipt: ReceiptSnapshot) => void;
}) {
  return (
    <section className="panel mt-4" aria-labelledby="receipt-register-heading">
      <div className="panel-section pb-0">
        <h2 id="receipt-register-heading" className="section-title">
          Recent receipts
        </h2>
      </div>
      <div className="document-register-wrap">
        <table className="document-register">
          <thead>
            <tr>
              <th scope="col">No.</th>
              <th scope="col">Date</th>
              <th scope="col">Patient</th>
              <th scope="col" className="amount-cell">Amount</th>
              <th scope="col">Doctor</th>
              <th scope="col"><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {receipts.length ? (
              receipts.map((receipt) => (
                <tr key={receipt.id}>
                  <td>{receipt.receiptNumber}</td>
                  <td>{formatDocumentDate(receipt.issuedOn)}</td>
                  <td>{receipt.patient.name}</td>
                  <td className="amount-cell">{formatRupees(receipt.amountPaise)}</td>
                  <td>{receipt.doctor.name}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-quiet"
                      onClick={() => onOpen(receipt)}
                      aria-label={`Open receipt ${receipt.receiptNumber}`}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="text-graphite">No receipts issued yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ReceiptPage() {
  const { doctorName, setDoctorName } = useAuthor();
  const [documentId, setDocumentId] = useState(() => crypto.randomUUID());
  const [patient, setPatient] = useState<ConsultationPatient>(freshDocumentPatient);
  const [title, setTitle] = useState<ReceiptTitle>("");
  const [amount, setAmount] = useState("");
  const [issuedOn, setIssuedOn] = useState(() =>
    toLocalDateInputValue(new Date()),
  );
  const [nextNumber, setNextNumber] = useState<number | null>(null);
  const [receipts, setReceipts] = useState<ReceiptSnapshot[]>([]);
  const [issued, setIssued] = useState<ReceiptSnapshot | null>(null);
  const [state, setState] = useState<"idle" | "issuing" | "error">("idle");

  const loadRegister = () =>
    fetch("/api/receipts")
      .then((response) => {
        if (!response.ok) throw new Error("receipt register failed");
        return response.json() as Promise<{
          nextNumber: number;
          receipts: ReceiptSnapshot[];
        }>;
      })
      .then((data) => {
        setNextNumber(data.nextNumber);
        setReceipts(data.receipts);
      });

  useEffect(() => {
    void loadRegister().catch(() => setState("error"));
    const patientId = new URLSearchParams(window.location.search).get("patient");
    if (!patientId) return;
    void fetch(`/api/patients/${encodeURIComponent(patientId)}`)
      .then((response) => {
        if (!response.ok) throw new Error("patient load failed");
        return response.json() as Promise<{ patient: PatientRecord }>;
      })
      .then(({ patient: record }) => {
        setPatient(documentPatientFromRecord(record));
        setTitle(defaultTitleForSex(record.sex));
      })
      .catch(() => setState("error"));
  }, []);

  const amountPaise = /^\d+$/.test(amount) ? Number(amount) * 100 : 0;
  const draftReceipt = useMemo<ReceiptSnapshot>(
    () => ({
      id: documentId,
      documentVersion: "receipt-v1",
      layoutVersion: "a5-v1",
      receiptNumber: nextNumber ?? 0,
      issuedOn,
      createdAt: "",
      clinic: clinicIdentity,
      doctor: clinicDoctors[doctorName],
      patient: {
        id: patient.patientId,
        number: patient.patientNumber,
        name: patient.name,
        age: patient.age,
        sex: patient.sex,
      },
      title,
      amountPaise,
    }),
    [amountPaise, doctorName, documentId, issuedOn, nextNumber, patient, title],
  );

  const startNew = () => {
    setDocumentId(crypto.randomUUID());
    setPatient(freshDocumentPatient());
    setTitle("");
    setAmount("");
    setIssuedOn(toLocalDateInputValue(new Date()));
    setIssued(null);
    setState("idle");
    window.requestAnimationFrame(() =>
      document.getElementById("receipt-patient")?.focus(),
    );
  };

  const issue = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!patient.name.trim() || amountPaise <= 0 || !issuedOn) {
      setState("error");
      return;
    }
    setState("issuing");
    try {
      const response = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: documentId,
          patient,
          doctorName,
          issuedOn,
          title,
          amountPaise,
        }),
      });
      if (!response.ok) throw new Error("issue failed");
      const data = (await response.json()) as { receipt: ReceiptSnapshot };
      setIssued(data.receipt);
      setState("idle");
      await loadRegister();
    } catch {
      setState("error");
    }
  };

  return (
    <Shell
      active="receipts"
      doctorName={issued?.doctor.name ?? doctorName}
      onDoctorChange={issued ? undefined : setDoctorName}
      doctorSelectionLocked={Boolean(issued)}
    >
      <div className="page">
        <PageHeader title="Receipt" />
        {issued ? (
          <div className="completed-prescription-layout">
            <div className="min-w-0">
              <div role="status" aria-label="Receipt issued" className="notice notice-done p-4">
                <h2 className="section-title">Receipt issued</h2>
                <p className="mt-2">Receipt no. {issued.receiptNumber} for {issued.patient.name}</p>
                <p className="mt-2 text-graphite">Locked. It cannot be edited.</p>
              </div>
              <div className="panel mt-4">
                <div className="panel-section grid gap-2">
                  <button type="button" className="btn btn-primary justify-start" onClick={() => window.print()}>
                    <Printer size={18} aria-hidden="true" /> Print receipt
                  </button>
                  <button type="button" className="btn btn-secondary justify-start" onClick={startNew}>
                    New receipt
                  </button>
                </div>
              </div>
            </div>
            <div className="completed-document-shell min-w-0">
              <ReceiptSheet receipt={issued} ariaLabel="Issued receipt" />
            </div>
          </div>
        ) : (
          <RouteWorkspace
            form={
              <form className="panel" onSubmit={issue} aria-label="Receipt form">
                <div className="panel-section">
                  <div className="panel-header">
                    <h2 className="section-title">Receipt details</h2>
                    <span className="tag tag-muted">
                      {nextNumber === null ? "Checking next receipt number…" : `Next: ${nextNumber} (provisional)`}
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <label htmlFor="receipt-patient" className="field-label mb-0">Patient</label>
                        <span className={patient.patientNumber !== null ? "tag" : "tag tag-muted"}>
                          {patient.patientNumber !== null
                            ? `Patient no. ${patient.patientNumber}`
                            : "New patient: numbered on issue"}
                        </span>
                      </div>
                      <PatientNameSearch
                        id="receipt-patient"
                        value={patient.name}
                        newPatientMessage={(name) =>
                          `No saved patient matches “${name}”. They will be registered with the next patient number when this receipt is issued.`
                        }
                        onNameChange={(name) =>
                          setPatient((current) => ({
                            ...current,
                            patientId: "",
                            patientNumber: null,
                            name,
                          }))
                        }
                        onPatientSelected={(record) => {
                          setPatient(documentPatientFromRecord(record));
                          setTitle(defaultTitleForSex(record.sex));
                        }}
                      />
                    </div>
                    <label>
                      <span className="field-label">Title</span>
                      <select className="input-field" value={title} onChange={(event) => setTitle(event.target.value as ReceiptTitle)}>
                        {receiptTitles.map((value) => (
                          <option key={value || "none"} value={value}>{value || "None"}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="field-label">Amount in rupees</span>
                      <input className="input-field" type="number" inputMode="numeric" min="1" step="1" required value={amount} onChange={(event) => setAmount(event.target.value)} />
                    </label>
                    <label>
                      <span className="field-label">Date</span>
                      <input className="input-field" type="date" required value={issuedOn} onChange={(event) => setIssuedOn(event.target.value)} />
                    </label>
                  </div>
                  {state === "error" && (
                    <p role="alert" className="notice notice-error mt-3">
                      Enter a patient, a positive whole-rupee amount, and a date, then try again.
                    </p>
                  )}
                  <button type="submit" className="btn btn-primary mt-4" disabled={state === "issuing"}>
                    {state === "issuing" ? "Issuing receipt…" : "Issue receipt"}
                  </button>
                </div>
              </form>
            }
            preview={
              <div>
                <p className="paper-preview-caption"><b>Live receipt</b><span>A5, 1 page</span></p>
                <ReceiptSheet receipt={draftReceipt} ariaLabel="Receipt preview" />
              </div>
            }
          />
        )}
        <ReceiptRegister receipts={receipts} onOpen={setIssued} />
      </div>
    </Shell>
  );
}
