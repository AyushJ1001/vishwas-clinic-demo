"use client";

import { Printer } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import { diagnoses } from "../clinic-data";
import { clinicDoctors, clinicIdentity } from "../clinic-facts";
import {
  toLocalDateInputValue,
  type ConsultationPatient,
  type PatientRecord,
  type PatientSex,
} from "../consultation-model";
import {
  certificateTitles,
  defaultTitleForSex,
  formatDocumentDate,
  type CertificateTitle,
  type MedicalCertificateSnapshot,
} from "../issued-document-model";
import { PatientNameSearch } from "../patient-search";
import { useAuthor } from "../use-author";
import {
  PrintFeedbackNotice,
  useDocumentPrinting,
} from "../use-document-printing";
import { RouteWorkspace } from "./a5-workspace";
import { CatalogPicker } from "./catalog-picker";
import {
  documentPatientFromRecord,
  freshDocumentPatient,
} from "./document-patient";
import { MedicalCertificateSheet } from "./issued-document-sheet";
import { PageHeader, Shell } from "./shell";

function dayAfter(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return "";
  const next = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1));
  return next.toISOString().slice(0, 10);
}

function CertificateRegister({
  certificates,
  onOpen,
}: {
  certificates: MedicalCertificateSnapshot[];
  onOpen: (certificate: MedicalCertificateSnapshot) => void;
}) {
  return (
    <section className="panel mt-4" aria-labelledby="certificate-register-heading">
      <div className="panel-section pb-0">
        <h2 id="certificate-register-heading" className="section-title">
          Recent medical certificates
        </h2>
      </div>
      <div className="document-register-wrap">
        <table className="document-register">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Patient</th>
              <th scope="col">Diagnosis</th>
              <th scope="col">Doctor</th>
              <th scope="col"><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {certificates.length ? (
              certificates.map((certificate) => (
                <tr key={certificate.id}>
                  <td>{formatDocumentDate(certificate.issuedOn)}</td>
                  <td>{certificate.patient.name}</td>
                  <td>{certificate.diagnosis}</td>
                  <td>{certificate.doctor.name}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-quiet"
                      onClick={() => onOpen(certificate)}
                      aria-label={`Open medical certificate for ${certificate.patient.name}`}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="text-graphite">No medical certificates issued yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function CertificatePage() {
  const { doctorName, setDoctorName } = useAuthor();
  const today = useMemo(() => toLocalDateInputValue(new Date()), []);
  const [documentId, setDocumentId] = useState(() => crypto.randomUUID());
  const [patient, setPatient] = useState<ConsultationPatient>(freshDocumentPatient);
  const [title, setTitle] = useState<CertificateTitle>("");
  const [diagnosis, setDiagnosis] = useState("");
  const [treatmentSince, setTreatmentSince] = useState(today);
  const [restDays, setRestDays] = useState("");
  const [fitToResume, setFitToResume] = useState(true);
  const [resumeFrom, setResumeFrom] = useState(() => dayAfter(today));
  const [certificates, setCertificates] = useState<MedicalCertificateSnapshot[]>([]);
  const [issued, setIssued] = useState<MedicalCertificateSnapshot | null>(null);
  const [state, setState] = useState<"idle" | "issuing" | "error">("idle");
  const documentPrinting = useDocumentPrinting(
    "The print dialog did not open. Check the printer, then try again.",
  );

  const loadRegister = () =>
    fetch("/api/medical-certificates")
      .then((response) => {
        if (!response.ok) throw new Error("certificate register failed");
        return response.json() as Promise<{
          certificates: MedicalCertificateSnapshot[];
        }>;
      })
      .then((data) => setCertificates(data.certificates));

  useEffect(() => {
    void loadRegister().catch(() => setState("error"));
    const params = new URLSearchParams(window.location.search);
    const patientId = params.get("patient");
    const queryDiagnosis = params.get("diagnosis");
    const since = params.get("since");
    const prefillTimer = window.setTimeout(() => {
      if (queryDiagnosis) setDiagnosis(queryDiagnosis);
      if (since && /^\d{4}-\d{2}-\d{2}$/.test(since)) {
        setTreatmentSince(since);
      }
    }, 0);
    if (!patientId) return () => window.clearTimeout(prefillTimer);
    void fetch(`/api/patients/${encodeURIComponent(patientId)}`)
      .then((response) => {
        if (!response.ok) throw new Error("patient load failed");
        return response.json() as Promise<{ patient: PatientRecord }>;
      })
      .then(({ patient: record }) => {
        setPatient(documentPatientFromRecord(record));
        setTitle(defaultTitleForSex(record.sex) as CertificateTitle);
      })
      .catch(() => setState("error"));
    return () => window.clearTimeout(prefillTimer);
  }, []);

  const restDayCount = /^\d+$/.test(restDays) ? Number(restDays) : -1;
  const draftCertificate = useMemo<MedicalCertificateSnapshot>(
    () => ({
      id: documentId,
      documentVersion: "medical-certificate-v1",
      layoutVersion: "a5-v1",
      issuedOn: today,
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
      diagnosis,
      treatmentSince,
      restDays: Math.max(restDayCount, 0),
      fitToResume,
      resumeFrom,
    }),
    [diagnosis, doctorName, documentId, fitToResume, patient, restDayCount, resumeFrom, title, today, treatmentSince],
  );

  const startNew = () => {
    setDocumentId(crypto.randomUUID());
    setPatient(freshDocumentPatient());
    setTitle("");
    setDiagnosis("");
    setTreatmentSince(today);
    setRestDays("");
    setFitToResume(true);
    setResumeFrom(dayAfter(today));
    setIssued(null);
    setState("idle");
    window.requestAnimationFrame(() =>
      document.getElementById("certificate-patient")?.focus(),
    );
  };

  const issue = async (event: React.FormEvent) => {
    event.preventDefault();
    if (
      !patient.name.trim() ||
      !patient.age.trim() ||
      !diagnosis.trim() ||
      !treatmentSince ||
      restDayCount < 0 ||
      !resumeFrom
    ) {
      setState("error");
      return;
    }
    setState("issuing");
    try {
      const response = await fetch("/api/medical-certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: documentId,
          patient,
          doctorName,
          issuedOn: today,
          title,
          diagnosis,
          treatmentSince,
          restDays: restDayCount,
          fitToResume,
          resumeFrom,
        }),
      });
      if (!response.ok) throw new Error("issue failed");
      const data = (await response.json()) as {
        certificate: MedicalCertificateSnapshot;
      };
      setIssued(data.certificate);
      setState("idle");
      await loadRegister();
    } catch {
      setState("error");
    }
  };

  return (
    <Shell
      active="certificate"
      doctorName={issued?.doctor.name ?? doctorName}
      onDoctorChange={issued ? undefined : setDoctorName}
      doctorSelectionLocked={Boolean(issued)}
    >
      <div className="page">
        <PageHeader title="Medical certificate" />
        {issued ? (
          <div className="completed-prescription-layout">
            <div className="min-w-0">
              <div role="status" aria-label="Certificate issued" className="notice notice-done p-4">
                <h2 className="section-title">Medical certificate issued</h2>
                <p className="mt-2">{issued.patient.name}</p>
                <p className="mt-2 text-graphite">Locked. It cannot be edited.</p>
              </div>
              <div className="panel mt-4">
                <div className="panel-section grid gap-2">
                  <button
                    type="button"
                    className="btn btn-primary justify-start"
                    onClick={documentPrinting.print}
                    disabled={documentPrinting.printing}
                  >
                    <Printer size={18} aria-hidden="true" /> Print certificate
                  </button>
                  {documentPrinting.isClinicPc && (
                    <button
                      type="button"
                      className="btn btn-quiet justify-start"
                      onClick={documentPrinting.printWithOptions}
                      disabled={documentPrinting.printing}
                    >
                      <Printer size={18} aria-hidden="true" /> Print with options…
                    </button>
                  )}
                  <button type="button" className="btn btn-secondary justify-start" onClick={startNew}>
                    New certificate
                  </button>
                  <PrintFeedbackNotice feedback={documentPrinting.feedback} />
                </div>
              </div>
            </div>
            <div className="completed-document-shell min-w-0">
              <MedicalCertificateSheet certificate={issued} ariaLabel="Issued medical certificate" />
            </div>
          </div>
        ) : (
          <RouteWorkspace
            form={
              <form className="panel" onSubmit={issue} aria-label="Medical certificate form">
                <div className="panel-section">
                  <h2 className="section-title mb-3">Patient and certificate details</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <label htmlFor="certificate-patient" className="field-label mb-0">Patient</label>
                        <span className={patient.patientNumber !== null ? "tag" : "tag tag-muted"}>
                          {patient.patientNumber !== null
                            ? `Patient no. ${patient.patientNumber}`
                            : "New patient: numbered on issue"}
                        </span>
                      </div>
                      <PatientNameSearch
                        id="certificate-patient"
                        value={patient.name}
                        newPatientMessage={(name) =>
                          `No saved patient matches “${name}”. They will be registered with the next patient number when this certificate is issued.`
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
                          setTitle(defaultTitleForSex(record.sex) as CertificateTitle);
                        }}
                      />
                    </div>
                    <label>
                      <span className="field-label">Title</span>
                      <select className="input-field" value={title} onChange={(event) => setTitle(event.target.value as CertificateTitle)}>
                        {certificateTitles.map((value) => (
                          <option key={value || "none"} value={value}>{value || "None"}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="field-label">Age</span>
                      <input className="input-field" type="number" inputMode="numeric" min="0" required value={patient.age} onChange={(event) => setPatient((current) => ({ ...current, age: event.target.value }))} />
                    </label>
                    <label>
                      <span className="field-label">Gender</span>
                      <select
                        className="input-field"
                        value={patient.sex}
                        onChange={(event) => {
                          const sex = event.target.value as PatientSex;
                          setPatient((current) => ({ ...current, sex }));
                          setTitle(defaultTitleForSex(sex) as CertificateTitle);
                        }}
                      >
                        <option>Female</option>
                        <option>Male</option>
                        <option>Other</option>
                      </select>
                    </label>
                    <div className="sm:col-span-2">
                      <CatalogPicker
                        label="Provisional diagnosis"
                        catalogName="diagnoses"
                        groups={diagnoses}
                        value={diagnosis}
                        onChange={(value) => setDiagnosis(value as string)}
                      />
                    </div>
                    <label>
                      <span className="field-label">Under treatment since</span>
                      <input className="input-field" type="date" required value={treatmentSince} max={today} onChange={(event) => setTreatmentSince(event.target.value)} />
                    </label>
                    <label>
                      <span className="field-label">Rest advised (days)</span>
                      <input className="input-field" type="number" inputMode="numeric" min="0" step="1" required value={restDays} onChange={(event) => setRestDays(event.target.value)} />
                    </label>
                    <label className="flex items-center gap-2 sm:col-span-2">
                      <input type="checkbox" checked={fitToResume} onChange={(event) => setFitToResume(event.target.checked)} />
                      Fit to resume duties
                    </label>
                    <label>
                      <span className="field-label">From</span>
                      <input className="input-field" type="date" required value={resumeFrom} disabled={!fitToResume} onChange={(event) => setResumeFrom(event.target.value)} />
                    </label>
                  </div>
                  {state === "error" && (
                    <p role="alert" className="notice notice-error mt-3">
                      Choose or enter the patient, age, diagnosis, treatment date, and whole rest days, then try again.
                    </p>
                  )}
                  <button type="submit" className="btn btn-primary mt-4" disabled={state === "issuing"}>
                    {state === "issuing" ? "Issuing certificate…" : "Issue certificate"}
                  </button>
                </div>
              </form>
            }
            preview={
              <div>
                <p className="paper-preview-caption"><b>Live medical certificate</b><span>A5, 1 page</span></p>
                <MedicalCertificateSheet certificate={draftCertificate} ariaLabel="Medical certificate preview" />
              </div>
            }
          />
        )}
        <CertificateRegister certificates={certificates} onOpen={setIssued} />
      </div>
    </Shell>
  );
}
