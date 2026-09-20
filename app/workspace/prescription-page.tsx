"use client";

import { Check, FloppyDisk, WarningCircle, X } from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";
import {
  advice,
  diagnoses,
  findings,
  ingredientByMedicine,
  investigations,
  medicines,
  symptoms,
} from "../clinic-data";
import {
  ageOn,
  formatPriorVisitDate,
  type Consultation,
  type PatientRecord,
  type PatientSex,
  type PrescribedMedicine,
} from "../consultation-model";
import {
  validateConsultation,
  type ConsultationProblem,
} from "../consultation-validation";
import { PatientNameSearch } from "../patient-search";
import {
  useConsultationDraft,
  type DraftSaveState,
} from "../use-consultation-draft";
import { CatalogPicker } from "./catalog-picker";
import { CompletedPrescriptionView } from "./completed-prescription";
import {
  BloodPressureInput,
  FieldError,
  MedicineInstructionSelect,
  UnitInput,
} from "./fields";
import { PrescriptionPreview } from "./prescription-paper";
import { PrescriptionReviewDialog } from "./prescription-review";
import { Shell } from "./shell";

export function getVisitTypeLabel(visitType: Consultation["visitType"]) {
  if (visitType === "new") return "New consultation";
  if (visitType === "followup") return "Follow-up consultation";
  return "Prescription type needed";
}

const doseOptions = ["1–0–1", "1–0–0", "0–0–1", "1–1–1", "0–1–0", "As needed"];
const durationOptions = [
  "1 day",
  "3 days",
  "5 days",
  "7 days",
  "10 days",
  "14 days",
  "Until review",
];
const methodOptions = [
  "After food",
  "Before food",
  "With water",
  "At bedtime",
  "As needed",
  "As directed",
];

function saveStatusText(state: DraftSaveState, savedAt: string | null) {
  const savedTime = savedAt
    ? new Intl.DateTimeFormat("en-IN", {
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(savedAt))
    : null;
  return {
    loading: "Checking for a saved draft…",
    saved: savedTime ? `Saved at ${savedTime}` : "Saved",
    unsaved: "Unsaved changes",
    saving: "Saving draft…",
    failed: "Draft save failed. Your changes are still here.",
  }[state];
}

/** The page's title row: who this is for, whether it is saved, what next. */
function ConsultationHeader({
  state,
  savedAt,
  patientName,
  visitType,
  onSave,
  onReview,
}: {
  state: DraftSaveState;
  savedAt: string | null;
  patientName: string;
  visitType: Consultation["visitType"];
  onSave: () => Promise<void>;
  onReview: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const isFailed = state === "failed";
  return (
    <section aria-label="Current consultation" className="page-header">
      <div className="min-w-0">
        <h1 className="page-title truncate">
          {patientName.trim() || "Patient not named"}
        </h1>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={visitType ? "tag" : "tag tag-muted"}>
            {getVisitTypeLabel(visitType)}
          </span>
          <p
            role={isFailed ? "alert" : "status"}
            aria-live={isFailed ? "assertive" : "polite"}
            aria-atomic="true"
            className="status-line m-0"
            data-tone={isFailed ? "error" : state === "unsaved" ? "attention" : undefined}
          >
            {isFailed ? (
              <WarningCircle size={15} weight="fill" aria-hidden="true" />
            ) : state === "saved" ? (
              <Check size={14} weight="bold" aria-hidden="true" />
            ) : null}
            {saveStatusText(state, savedAt)}
          </p>
        </div>
      </div>
      <div className="page-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void onSave()}
          disabled={state === "loading" || state === "saving" || state === "saved"}
        >
          <FloppyDisk size={16} aria-hidden="true" />
          {isFailed ? "Retry save" : "Save draft"}
        </button>
        <button
          type="button"
          className="btn btn-primary desktop-review-action"
          disabled={state === "loading"}
          onClick={onReview}
        >
          Review prescription
        </button>
      </div>
    </section>
  );
}

export function PrescriptionPage() {
  const reviewReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const {
    consultation,
    setConsultation,
    saveState,
    savedAt,
    hasUnconfirmedChanges,
    saveDraft,
    completionState,
    completedSnapshot,
    completePrescription,
    startAnotherConsultation,
    priorVisits,
    priorVisitsState,
    reloadPriorVisits,
  } = useConsultationDraft();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewAttempted, setReviewAttempted] = useState(false);
  const reviewProblems = useMemo(
    () => validateConsultation(consultation),
    [consultation],
  );
  const errorFor = (fieldId: string) =>
    reviewAttempted
      ? reviewProblems.find((problem) => problem.fieldId === fieldId)?.message
      : undefined;
  const openReview = (event: React.MouseEvent<HTMLButtonElement>) => {
    reviewReturnFocusRef.current = event.currentTarget;
    setReviewAttempted(true);
    setReviewOpen(true);
  };
  const closeReview = () => {
    setReviewOpen(false);
    window.requestAnimationFrame(() => reviewReturnFocusRef.current?.focus());
  };
  const focusProblem = (problem: ConsultationProblem) => {
    setReviewOpen(false);
    window.requestAnimationFrame(() => {
      const field = document.getElementById(problem.fieldId);
      field?.scrollIntoView({ block: "center" });
      field?.focus();
    });
  };
  const clinicalEntryBlocked =
    saveState === "loading" ||
    (consultation.visitType === "followup" && !consultation.linkedPriorVisit);
  const updatePatient = (
    field: "name" | "age" | "sex" | "phone",
    value: string,
  ) => {
    // A different name is a different person: typing over a chosen
    // patient's name starts a new patient instead of renaming them.
    setConsultation((current) => {
      const unlink = field === "name" && current.patient.patientId !== "";
      return {
        ...current,
        linkedPriorVisit: unlink ? null : current.linkedPriorVisit,
        patient: {
          ...current.patient,
          ...(unlink ? { patientId: "", patientNumber: null } : {}),
          [field]: value,
        },
      };
    });
  };
  const updateDateOfBirth = (dateOfBirth: string) => {
    setConsultation((current) => ({
      ...current,
      patient: {
        ...current.patient,
        dateOfBirth,
        age: dateOfBirth
          ? ageOn(dateOfBirth, current.consultationDate) || current.patient.age
          : current.patient.age,
      },
    }));
  };
  const applyPatientRecord = (record: PatientRecord) => {
    setConsultation((current) => ({
      ...current,
      // Never keep an earlier prescription that belongs to someone else.
      linkedPriorVisit:
        current.linkedPriorVisit?.patientId === record.id
          ? current.linkedPriorVisit
          : null,
      patient: {
        patientId: record.id,
        patientNumber: record.number,
        name: record.name,
        // An estimated birth date only stands in for a remembered age.
        dateOfBirth: record.dateOfBirthEstimated ? "" : record.dateOfBirth,
        age:
          ageOn(record.dateOfBirth, current.consultationDate) || record.age,
        sex: record.sex,
        phone: record.phone,
      },
    }));
  };
  const updateVital = (field: keyof Consultation["vitals"], value: string) => {
    setConsultation((current) => ({
      ...current,
      vitals: { ...current.vitals, [field]: value },
    }));
  };
  const selectMedicines = (names: string[]) => {
    setConsultation((current) => ({
      ...current,
      medicines: names.map(
        (name) =>
          current.medicines.find((medicine) => medicine.name === name) ?? {
            name,
            dose: "",
            duration: "",
            method: "",
          },
      ),
    }));
  };
  const updateMedicine = (
    name: string,
    field: keyof Omit<PrescribedMedicine, "name">,
    value: string,
  ) => {
    setConsultation((current) => ({
      ...current,
      medicines: current.medicines.map((medicine) =>
        medicine.name === name ? { ...medicine, [field]: value } : medicine,
      ),
    }));
  };
  if (completedSnapshot) {
    return (
      <Shell
        active="prescription"
        doctorName={completedSnapshot.doctor.name}
        doctorSelectionLocked
      >
        <CompletedPrescriptionView
          snapshot={completedSnapshot}
          onStartAnother={async () => {
            await startAnotherConsultation();
            setReviewOpen(false);
            setReviewAttempted(false);
            window.requestAnimationFrame(() =>
              document.getElementById("prescription-type-new")?.focus(),
            );
          }}
        />
      </Shell>
    );
  }
  const patient = consultation.patient;
  const isFollowUp = consultation.visitType === "followup";
  return (
    <Shell
      active="prescription"
      doctorName={consultation.doctorName}
      shouldWarnBeforeLeaving={hasUnconfirmedChanges}
      onDoctorChange={(doctorName) =>
        setConsultation((current) => ({ ...current, doctorName }))
      }
    >
      <div className="page">
        <ConsultationHeader
          state={saveState}
          savedAt={savedAt}
          patientName={patient.name}
          visitType={consultation.visitType}
          onSave={saveDraft}
          onReview={openReview}
        />
        <div className="rx-workspace">
          <section aria-label="Consultation form" className="panel rx-form">
            <div className="panel-section">
              <div className="panel-header">
                <h2 className="section-title">Patient</h2>
                <span
                  id="patient-number"
                  className={patient.patientNumber !== null ? "tag" : "tag tag-muted"}
                >
                  {patient.patientNumber !== null
                    ? `Patient no. ${patient.patientNumber}`
                    : "New patient: numbered on completion"}
                </span>
              </div>
              <div className="grid grid-cols-12 gap-x-4 gap-y-3">
                <fieldset
                  role="radiogroup"
                  aria-labelledby="prescription-type-label"
                  aria-invalid={Boolean(errorFor("prescription-type-new"))}
                  aria-describedby={
                    errorFor("prescription-type-new")
                      ? "prescription-type-error"
                      : undefined
                  }
                  disabled={saveState === "loading"}
                  aria-busy={saveState === "loading"}
                  className="col-span-12 m-0 min-w-0 border-0 p-0 sm:col-span-7"
                >
                  <legend id="prescription-type-label" className="field-label float-left w-full">
                    Prescription type
                  </legend>
                  <div className="segmented clear-both">
                    {(
                      [
                        ["new", "New", "New prescription"],
                        ["followup", "Follow-up", "Follow-up prescription"],
                      ] as const
                    ).map(([key, text, name]) => (
                      <label key={key}>
                        <input
                          id={`prescription-type-${key}`}
                          type="radio"
                          name="prescription-type"
                          value={key}
                          aria-label={name}
                          checked={consultation.visitType === key}
                          onChange={() =>
                            setConsultation((current) => ({
                              ...current,
                              visitType: key,
                              linkedPriorVisit:
                                key === "new" ? null : current.linkedPriorVisit,
                            }))
                          }
                        />
                        <span>{text}</span>
                      </label>
                    ))}
                  </div>
                  {errorFor("prescription-type-new") && (
                    <FieldError id="prescription-type-error">
                      {errorFor("prescription-type-new")!}
                    </FieldError>
                  )}
                </fieldset>
                <label className="col-span-12 sm:col-span-5">
                  <span className="field-label">Consultation date</span>
                  <input
                    id="consultation-date"
                    aria-label="Consultation date"
                    className="input-field"
                    type="date"
                    value={consultation.consultationDate}
                    aria-invalid={Boolean(errorFor("consultation-date"))}
                    aria-describedby={
                      errorFor("consultation-date")
                        ? "consultation-date-error"
                        : undefined
                    }
                    onChange={(event) =>
                      setConsultation((current) => ({
                        ...current,
                        consultationDate: event.target.value,
                        patient: current.patient.dateOfBirth
                          ? {
                              ...current.patient,
                              age:
                                ageOn(
                                  current.patient.dateOfBirth,
                                  event.target.value,
                                ) || current.patient.age,
                            }
                          : current.patient,
                      }))
                    }
                  />
                  {errorFor("consultation-date") && (
                    <FieldError id="consultation-date-error">
                      {errorFor("consultation-date")!}
                    </FieldError>
                  )}
                </label>
                <div className="col-span-12 sm:col-span-7">
                  <label htmlFor="patient-name" className="field-label">
                    Patient name
                  </label>
                  <PatientNameSearch
                    id="patient-name"
                    value={patient.name}
                    disabled={saveState === "loading"}
                    invalid={Boolean(errorFor("patient-name"))}
                    describedBy={
                      errorFor("patient-name") ? "patient-name-error" : undefined
                    }
                    onNameChange={(name) => updatePatient("name", name)}
                    onPatientSelected={applyPatientRecord}
                  />
                  {errorFor("patient-name") && (
                    <FieldError id="patient-name-error">
                      {errorFor("patient-name")!}
                    </FieldError>
                  )}
                </div>
                <label className="col-span-12 sm:col-span-5">
                  <span className="field-label">Phone</span>
                  <input
                    id="patient-phone"
                    aria-label="Phone"
                    className="input-field"
                    type="tel"
                    inputMode="tel"
                    value={patient.phone}
                    onChange={(event) => updatePatient("phone", event.target.value)}
                  />
                </label>
                <label className="col-span-12 sm:col-span-5">
                  <span className="field-label">Date of birth</span>
                  <input
                    id="patient-date-of-birth"
                    aria-label="Date of birth"
                    className="input-field"
                    type="date"
                    value={patient.dateOfBirth}
                    max={consultation.consultationDate || undefined}
                    aria-invalid={Boolean(errorFor("patient-date-of-birth"))}
                    aria-describedby={
                      errorFor("patient-date-of-birth")
                        ? "patient-date-of-birth-error"
                        : undefined
                    }
                    onChange={(event) => updateDateOfBirth(event.target.value)}
                  />
                  {errorFor("patient-date-of-birth") && (
                    <FieldError id="patient-date-of-birth-error">
                      {errorFor("patient-date-of-birth")!}
                    </FieldError>
                  )}
                </label>
                <label className="col-span-5 sm:col-span-2">
                  <span className="field-label">Age</span>
                  <input
                    id="patient-age"
                    aria-label="Age"
                    className="input-field"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={patient.age}
                    readOnly={Boolean(patient.dateOfBirth)}
                    title={
                      patient.dateOfBirth
                        ? "Worked out from the date of birth"
                        : undefined
                    }
                    aria-invalid={Boolean(errorFor("patient-age"))}
                    aria-describedby={
                      errorFor("patient-age") ? "patient-age-error" : undefined
                    }
                    onChange={(event) => updatePatient("age", event.target.value)}
                  />
                  {errorFor("patient-age") && (
                    <FieldError id="patient-age-error">
                      {errorFor("patient-age")!}
                    </FieldError>
                  )}
                </label>
                <label className="col-span-7 sm:col-span-5">
                  <span className="field-label">Gender</span>
                  <select
                    id="patient-sex"
                    aria-label="Gender"
                    className="input-field"
                    value={patient.sex}
                    aria-invalid={Boolean(errorFor("patient-sex"))}
                    aria-describedby={
                      errorFor("patient-sex") ? "patient-sex-error" : undefined
                    }
                    onChange={(event) =>
                      updatePatient("sex", event.target.value as PatientSex)
                    }
                  >
                    <option>Female</option>
                    <option>Male</option>
                    <option>Other</option>
                  </select>
                  {errorFor("patient-sex") && (
                    <FieldError id="patient-sex-error">
                      {errorFor("patient-sex")!}
                    </FieldError>
                  )}
                </label>
              </div>
            </div>
            {isFollowUp && (
              <div className="panel-section">
                <label className="block max-w-xl">
                  <span className="field-label">Earlier prescription</span>
                  <select
                    id="prior-visit"
                    className="input-field"
                    value={consultation.linkedPriorVisit?.id ?? ""}
                    aria-describedby={
                      errorFor("prior-visit")
                        ? "prior-visit-error"
                        : !consultation.linkedPriorVisit &&
                            priorVisitsState !== "failed"
                          ? "prior-visit-required"
                          : undefined
                    }
                    aria-invalid={Boolean(errorFor("prior-visit"))}
                    disabled={
                      saveState === "loading" ||
                      priorVisitsState !== "ready" ||
                      !patient.patientId
                    }
                    onChange={(event) => {
                      const linkedPriorVisit = priorVisits.find(
                        (visit) => visit.id === event.target.value,
                      );
                      setConsultation((current) => ({
                        ...current,
                        linkedPriorVisit: linkedPriorVisit ?? null,
                      }));
                    }}
                  >
                    <option value="">
                      {!patient.patientId
                        ? "Choose a saved patient first"
                        : priorVisitsState === "loading"
                          ? "Loading earlier prescriptions…"
                          : priorVisits.length
                            ? "Choose an earlier prescription"
                            : "No earlier prescriptions for this patient"}
                    </option>
                    {priorVisits.map((visit) => (
                      <option key={visit.id} value={visit.id}>
                        {formatPriorVisitDate(visit.consultationDate)}:{" "}
                        {visit.clinicalSummary}
                      </option>
                    ))}
                  </select>
                </label>
                {errorFor("prior-visit") && (
                  <FieldError id="prior-visit-error">
                    {errorFor("prior-visit")!}
                  </FieldError>
                )}
                {priorVisitsState === "failed" && (
                  <div className="notice notice-error mt-2 flex flex-wrap items-center gap-3">
                    <p role="alert" className="m-0">
                      Earlier prescriptions could not be loaded.
                    </p>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        void reloadPriorVisits().then(() =>
                          window.requestAnimationFrame(() =>
                            document.getElementById("prior-visit")?.focus(),
                          ),
                        );
                      }}
                    >
                      Try again
                    </button>
                  </div>
                )}
                {!consultation.linkedPriorVisit &&
                  priorVisitsState !== "failed" &&
                  !errorFor("prior-visit") && (
                    <p id="prior-visit-required" className="notice notice-attention mt-2">
                      {patient.patientId
                        ? "Choose the earlier prescription this follow-up continues."
                        : "Search for the patient by name or number, then choose their earlier prescription."}
                    </p>
                  )}
                {consultation.linkedPriorVisit && (
                  <section
                    aria-labelledby="linked-prior-visit-heading"
                    className="mt-3 flex min-w-0 flex-wrap items-start justify-between gap-3"
                  >
                    <dl className="m-0 grid min-w-0 flex-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                      <h3 id="linked-prior-visit-heading" className="sr-only">
                        Linked prior visit
                      </h3>
                      <dt className="text-graphite">Patient</dt>
                      <dd className="m-0 break-words">
                        {consultation.linkedPriorVisit.patient.name}
                      </dd>
                      <dt className="text-graphite">Date</dt>
                      <dd className="m-0">
                        {formatPriorVisitDate(
                          consultation.linkedPriorVisit.consultationDate,
                        )}
                      </dd>
                      <dt className="text-graphite">Doctor</dt>
                      <dd className="m-0">
                        {consultation.linkedPriorVisit.doctorName}
                      </dd>
                      <dt className="text-graphite">Findings</dt>
                      <dd className="m-0 break-words">
                        {consultation.linkedPriorVisit.clinicalSummary}
                      </dd>
                    </dl>
                    <button
                      type="button"
                      aria-label="Remove prior visit link"
                      className="btn btn-secondary"
                      onClick={() => {
                        setConsultation((current) => ({
                          ...current,
                          linkedPriorVisit: null,
                        }));
                        window.requestAnimationFrame(() =>
                          document.getElementById("prior-visit")?.focus(),
                        );
                      }}
                    >
                      Remove link
                    </button>
                  </section>
                )}
              </div>
            )}
            <fieldset
              disabled={clinicalEntryBlocked}
              aria-describedby={
                clinicalEntryBlocked && saveState !== "loading"
                  ? "followup-link-required"
                  : undefined
              }
              className="m-0 min-w-0 border-0 p-0"
            >
              {clinicalEntryBlocked && saveState !== "loading" && (
                <span id="followup-link-required" className="sr-only">
                  Clinical entry is unavailable until an earlier prescription is
                  linked.
                </span>
              )}
              <div className="panel-section">
                <h2 className="section-title mb-3">Vitals</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <UnitInput
                    inputId="weight"
                    label="Weight"
                    value={consultation.vitals.weight}
                    unit="kg"
                    onChange={(value) => updateVital("weight", value)}
                    error={errorFor("weight")}
                  />
                  <UnitInput
                    inputId="temperature"
                    label="Temperature"
                    value={consultation.vitals.temperature}
                    unit="°F"
                    onChange={(value) => updateVital("temperature", value)}
                    error={errorFor("temperature")}
                  />
                  <UnitInput
                    inputId="pulse"
                    label="Pulse"
                    value={consultation.vitals.pulse}
                    unit="/min"
                    onChange={(value) => updateVital("pulse", value)}
                    error={errorFor("pulse")}
                  />
                  <BloodPressureInput
                    systolic={consultation.vitals.systolic}
                    diastolic={consultation.vitals.diastolic}
                    onSystolicChange={(value) => updateVital("systolic", value)}
                    onDiastolicChange={(value) => updateVital("diastolic", value)}
                    systolicError={errorFor("systolic-blood-pressure")}
                    diastolicError={errorFor("diastolic-blood-pressure")}
                  />
                  <UnitInput
                    inputId="spo2"
                    label="SpO₂"
                    value={consultation.vitals.spo2}
                    unit="%"
                    onChange={(value) => updateVital("spo2", value)}
                    error={errorFor("spo2")}
                  />
                </div>
              </div>
              <div className="panel-section">
                <h2 className="section-title mb-3">Findings and advice</h2>
                <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                  <CatalogPicker
                    label="Major complaints"
                    inputId="complaints"
                    error={errorFor("complaints")}
                    catalogName="symptoms"
                    groups={symptoms}
                    value={consultation.complaints}
                    onChange={(complaints) =>
                      setConsultation((current) => ({
                        ...current,
                        complaints: complaints as string[],
                      }))
                    }
                    multiple
                  />
                  <CatalogPicker
                    label="Examination findings"
                    inputId="examination-findings"
                    error={errorFor("examination-findings")}
                    catalogName="findings"
                    groups={findings}
                    value={consultation.examinationFindings}
                    onChange={(examinationFindings) =>
                      setConsultation((current) => ({
                        ...current,
                        examinationFindings: examinationFindings as string[],
                      }))
                    }
                    multiple
                  />
                  <label className="sm:col-span-2">
                    <span className="field-label">Past medical history</span>
                    <textarea
                      id="past-medical-history"
                      className="input-field"
                      rows={2}
                      value={consultation.pastMedicalHistory}
                      onChange={(event) =>
                        setConsultation((current) => ({
                          ...current,
                          pastMedicalHistory: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="sm:col-span-2">
                    <CatalogPicker
                      label="Provisional diagnosis"
                      inputId="provisional-diagnosis"
                      error={errorFor("provisional-diagnosis")}
                      catalogName="diagnoses"
                      groups={diagnoses}
                      value={consultation.provisionalDiagnosis}
                      onChange={(provisionalDiagnosis) =>
                        setConsultation((current) => ({
                          ...current,
                          provisionalDiagnosis: provisionalDiagnosis as string,
                        }))
                      }
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <CatalogPicker
                      label="Advice"
                      inputId="advice"
                      catalogName="advice"
                      groups={advice}
                      value={consultation.advice}
                      onChange={(selectedAdvice) =>
                        setConsultation((current) => ({
                          ...current,
                          advice: selectedAdvice as string[],
                        }))
                      }
                      multiple
                    />
                  </div>
                  <CatalogPicker
                    label="Investigations"
                    inputId="investigations"
                    catalogName="investigations"
                    groups={investigations}
                    value={consultation.investigations}
                    onChange={(investigationsValue) =>
                      setConsultation((current) => ({
                        ...current,
                        investigations: investigationsValue as string[],
                      }))
                    }
                    multiple
                  />
                  <label>
                    <span className="field-label">Next visit</span>
                    <input
                      id="next-visit"
                      className="input-field"
                      type="date"
                      min={consultation.consultationDate || undefined}
                      value={consultation.nextVisit}
                      aria-invalid={Boolean(errorFor("next-visit"))}
                      aria-describedby={
                        errorFor("next-visit") ? "next-visit-error" : undefined
                      }
                      onChange={(event) =>
                        setConsultation((current) => ({
                          ...current,
                          nextVisit: event.target.value,
                        }))
                      }
                    />
                    {errorFor("next-visit") && (
                      <FieldError id="next-visit-error">
                        {errorFor("next-visit")!}
                      </FieldError>
                    )}
                  </label>
                </div>
              </div>
              <div className="panel-section">
                <h2 className="section-title mb-3">Medicines</h2>
                <CatalogPicker
                  label="Medicines"
                  inputId="medicines"
                  catalogName="medicines"
                  groups={medicines}
                  value={consultation.medicines.map((medicine) => medicine.name)}
                  onChange={(value) => selectMedicines(value as string[])}
                  multiple
                  showSelection={false}
                  hideLabel
                />
                {consultation.medicines.length === 0 ? (
                  <p className="hint mt-2">No medicines added.</p>
                ) : (
                  <table className="medicine-table mt-3">
                    <thead>
                      <tr>
                        <th scope="col">Medicine</th>
                        <th scope="col">Dose</th>
                        <th scope="col">Duration</th>
                        <th scope="col">Method</th>
                        <th scope="col">
                          <span className="sr-only">Remove</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {consultation.medicines.map((medicine, i) => (
                        <tr key={medicine.name}>
                          <td className="medicine-identity">
                            <b>
                              {i + 1}. {medicine.name}
                            </b>
                            <span className="hint block">
                              {ingredientByMedicine[medicine.name] ||
                                "Composition from medicine catalog"}
                            </span>
                          </td>
                          <td>
                            <MedicineInstructionSelect
                              id={`medicine-${i}-dose`}
                              label={`${medicine.name} dose`}
                              fieldLabel="Dose"
                              value={medicine.dose}
                              error={errorFor(`medicine-${i}-dose`)}
                              placeholder="Choose dose"
                              options={doseOptions}
                              onChange={(value) =>
                                updateMedicine(medicine.name, "dose", value)
                              }
                            />
                          </td>
                          <td>
                            <MedicineInstructionSelect
                              id={`medicine-${i}-duration`}
                              label={`${medicine.name} duration`}
                              fieldLabel="Duration"
                              value={medicine.duration}
                              error={errorFor(`medicine-${i}-duration`)}
                              placeholder="Choose duration"
                              options={durationOptions}
                              onChange={(value) =>
                                updateMedicine(medicine.name, "duration", value)
                              }
                            />
                          </td>
                          <td>
                            <MedicineInstructionSelect
                              id={`medicine-${i}-method`}
                              label={`${medicine.name} method`}
                              fieldLabel="Method"
                              value={medicine.method}
                              error={errorFor(`medicine-${i}-method`)}
                              placeholder="Choose method"
                              options={methodOptions}
                              onChange={(value) =>
                                updateMedicine(medicine.name, "method", value)
                              }
                            />
                          </td>
                          <td className="medicine-remove-cell">
                            <button
                              type="button"
                              id={`medicine-${i}-remove`}
                              aria-label={`Remove ${medicine.name}`}
                              className="icon-button"
                              onClick={() => {
                                const remaining = consultation.medicines
                                  .filter((item) => item.name !== medicine.name)
                                  .map((item) => item.name);
                                selectMedicines(remaining);
                                window.requestAnimationFrame(() => {
                                  const nextRemove = document.getElementById(
                                    `medicine-${Math.min(i, remaining.length - 1)}-remove`,
                                  );
                                  (
                                    nextRemove ?? document.getElementById("medicines")
                                  )?.focus();
                                });
                              }}
                            >
                              <X size={16} aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </fieldset>
          </section>
          <aside aria-label="Prescription paper" className="preview-wrap">
            <PrescriptionPreview consultation={consultation} />
          </aside>
        </div>
      </div>
      <aside
        aria-label="Current consultation actions"
        role="region"
        className="mobile-consultation-actions"
      >
        <div className="min-w-0">
          <p className="mobile-patient-name m-0 font-semibold">
            {patient.name.trim() || "Patient not named"}
          </p>
          <p className="hint flex flex-wrap gap-x-3">
            <span>{getVisitTypeLabel(consultation.visitType)}</span>
            <span>
              {{
                loading: "Checking draft",
                saved: "Saved",
                unsaved: "Unsaved",
                saving: "Saving",
                failed: "Save failed",
              }[saveState]}
            </span>
          </p>
        </div>
        <button
          type="button"
          aria-label="Review prescription"
          className="btn btn-primary"
          disabled={saveState === "loading"}
          onClick={openReview}
        >
          <span className="mobile-review-label-short">Review</span>
          <span className="mobile-review-label-long">Review prescription</span>
        </button>
      </aside>
      {reviewOpen && (
        <PrescriptionReviewDialog
          consultation={consultation}
          problems={reviewProblems}
          completionState={completionState}
          onClose={closeReview}
          onFixProblem={focusProblem}
          onComplete={() => void completePrescription()}
        />
      )}
    </Shell>
  );
}
