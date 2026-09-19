"use client";

import { useGSAP } from "@gsap/react";
import {
  Check,
  FloppyDisk,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
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

gsap.registerPlugin(ScrollTrigger);

export function getVisitTypeLabel(visitType: Consultation["visitType"]) {
  if (visitType === "new") return "New consultation";
  if (visitType === "followup") return "Follow-up consultation";
  return "Prescription type needed";
}

export function DraftSaveBar({
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
  const savedTime = savedAt
    ? new Intl.DateTimeFormat("en-IN", {
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(savedAt))
    : null;
  const statusCopy = {
    loading: "Checking for a saved draft…",
    saved: savedTime ? `Saved at ${savedTime}` : "Saved · Ready to edit",
    unsaved: "Unsaved changes · Autosave is waiting for a pause",
    saving: "Saving draft…",
    failed: "Draft save failed. Your changes are still here.",
  }[state];
  const isFailed = state === "failed";
  return (
    <section
      aria-label="Current consultation"
      className={`mb-7 grid gap-4 rounded-2xl px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${isFailed ? "border border-red-800/20 bg-red-50" : "bg-[#ece7dc]"}`}
    >
      <div className="min-w-0">
        <p className="field-label mb-1">Current consultation</p>
        <p className="truncate text-base font-bold">
          {patientName.trim() || "Patient not named"}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-sm text-[#435c54]">
            {getVisitTypeLabel(visitType)}
          </p>
          <div className="flex min-w-0 items-center gap-1.5">
            {isFailed ? (
              <WarningCircle
                size={16}
                weight="fill"
                className="shrink-0 text-red-800"
              />
            ) : (
              <Check size={15} weight="bold" className="shrink-0" />
            )}
            <p
              role={isFailed ? "alert" : "status"}
              aria-live={isFailed ? "assertive" : "polite"}
              aria-atomic="true"
              className={`text-sm font-semibold ${isFailed ? "text-red-900" : "text-[#435c54]"}`}
            >
              {statusCopy}
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={
            state === "loading" || state === "saving" || state === "saved"
          }
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-[#15362f] shadow-sm transition hover:bg-[#fbfaf5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d85f39] disabled:cursor-default disabled:opacity-55"
        >
          <FloppyDisk size={16} weight="bold" />
          {isFailed ? "Retry save" : "Save draft"}
        </button>
        <button
          type="button"
          className="primary-action desktop-review-action min-h-11"
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
  const root = useRef<HTMLDivElement>(null);
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
  const [patientSynced, setPatientSynced] = useState(false);
  const updatePatient = (
    field: "name" | "age" | "sex" | "phone",
    value: string,
  ) => {
    // A different name is a different person: typing over a chosen
    // patient's name starts a new patient instead of renaming them.
    if (field === "name") setPatientSynced(false);
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
    setPatientSynced(true);
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
  useGSAP(
    () => {
      if (completedSnapshot) return;
      const motionPreference = gsap.matchMedia();
      motionPreference.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          ".document-preview",
          { scale: 0.9 },
          {
            scale: 1,
            scrollTrigger: {
              trigger: ".workspace-grid",
              start: "top 74%",
              end: "top 25%",
              scrub: true,
             },
           },
         );
      });
      return () => motionPreference.revert();
    },
    { dependencies: [completedSnapshot] },
  );
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
  return (
    <Shell
      active="prescription"
      doctorName={consultation.doctorName}
      shouldWarnBeforeLeaving={hasUnconfirmedChanges}
      onDoctorChange={(doctorName) =>
        setConsultation((current) => ({ ...current, doctorName }))
      }
    >
      <div ref={root}>
        <header className="mx-auto grid max-w-[1500px] gap-8 px-5 pb-14 pt-14 lg:grid-cols-[1.1fr_.9fr] lg:px-10 lg:pb-20 lg:pt-20">
          <div>
            <p className="eyebrow">
              {consultation.visitType === "followup"
                ? consultation.linkedPriorVisit
                  ? "Follow-up consultation · prior visit linked"
                  : "Follow-up consultation · prior visit required"
                : consultation.visitType === "new"
                  ? "New consultation · no prior visit linked"
                  : "Choose a prescription type to begin"}
            </p>
            <h1 className="max-w-6xl text-[clamp(2.8rem,5vw,5.5rem)] font-medium leading-[.94] tracking-[-.055em]">
              Write the prescription. See the paper take shape.
            </h1>
          </div>
          <div className="flex items-end">
            <p className="max-w-xl text-lg leading-relaxed text-[#536760]">
              The digital form follows the clinic’s printed sheet, while
              searchable clinical catalogs make repeated work faster.
            </p>
          </div>
        </header>
        <section className="workspace-grid mx-auto grid-flow-dense grid max-w-[1500px] grid-cols-12 items-start gap-5 px-5 pb-40 lg:px-10">
          <section
            aria-label="Consultation form"
            className="col-span-12 rounded-[30px] border border-[#15362f]/10 bg-[#fbfaf5] p-6 shadow-[0_24px_70px_rgba(21,54,47,.08)] lg:col-span-7 lg:p-9"
          >
            <DraftSaveBar
              state={saveState}
              savedAt={savedAt}
              patientName={consultation.patient.name}
              visitType={consultation.visitType}
              onSave={saveDraft}
              onReview={openReview}
            />
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
              className="mb-8 min-w-0 rounded-[24px] border border-[#b85a36]/25 bg-[#fff7f0] p-5 disabled:opacity-70"
            >
              <legend
                id="prescription-type-label"
                className="px-2 text-xs font-extrabold uppercase tracking-[.12em] text-[#9b492f]"
              >
                Prescription type
              </legend>
              <p className="text-base font-bold">
                Is this a new prescription or a follow-up?
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  [
                    "new",
                    "New prescription",
                    "Start without a prior visit link",
                  ],
                  [
                    "followup",
                    "Follow-up prescription",
                    "Continues an earlier prescription for a saved patient",
                  ],
                ].map(([key, title, copy]) => {
                  const selected = consultation.visitType === key;
                  return (
                    <label key={key} className="relative block">
                      <input
                        id={`prescription-type-${key}`}
                        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                        type="radio"
                        name="prescription-type"
                        value={key}
                        checked={selected}
                        onChange={() =>
                          setConsultation((current) => ({
                            ...current,
                            visitType: key as "new" | "followup",
                            linkedPriorVisit:
                              key === "new" ? null : current.linkedPriorVisit,
                          }))
                        }
                      />
                      <span
                        className={`block min-h-24 rounded-2xl border p-4 text-left transition peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#d85f39] ${selected ? "border-[#15362f] bg-[#15362f] text-white" : "border-[#15362f]/15 bg-white hover:border-[#15362f]/45"}`}
                      >
                        <span className="flex items-center justify-between text-sm font-bold">
                          {title}
                          {selected && <Check size={16} weight="bold" />}
                        </span>
                        <span
                          className={`mt-1 block text-xs ${selected ? "text-white/75" : "text-[#536760]"}`}
                        >
                          {copy}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {errorFor("prescription-type-new") && (
                <FieldError id="prescription-type-error">
                  {errorFor("prescription-type-new")!}
                </FieldError>
              )}
            </fieldset>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <label htmlFor="patient-name" className="field-label">
                    Patient name
                  </label>
                  <span
                    id="patient-number"
                    className="text-xs font-bold text-[#435c54] tabular-nums"
                  >
                    {consultation.patient.patientNumber !== null
                      ? `Patient no. ${consultation.patient.patientNumber}`
                      : "New patient: numbered on completion"}
                  </span>
                </div>
                <PatientNameSearch
                  id="patient-name"
                  value={consultation.patient.name}
                  disabled={saveState === "loading"}
                  invalid={Boolean(errorFor("patient-name"))}
                  describedBy={
                    errorFor("patient-name")
                      ? "patient-name-error"
                      : undefined
                  }
                  onNameChange={(name) => updatePatient("name", name)}
                  onPatientSelected={applyPatientRecord}
                />
                {patientSynced && !errorFor("patient-name") && (
                  <p className="patient-sync-note">
                    <Check size={13} weight="bold" />
                    Saved patient
                  </p>
                )}
                {errorFor("patient-name") && (
                  <FieldError id="patient-name-error">
                    {errorFor("patient-name")!}
                  </FieldError>
                )}
              </div>
            </div>
            <div className="mt-5 grid gap-5 sm:grid-cols-[.6fr_1fr_1fr]">
              <label>
                <span className="field-label">Date of birth</span>
                <input
                  id="patient-date-of-birth"
                  aria-label="Date of birth"
                  className="input-field tabular-nums"
                  type="date"
                  value={consultation.patient.dateOfBirth}
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
              <label>
                <span className="field-label">Phone</span>
                <input
                  id="patient-phone"
                  aria-label="Phone"
                  className="input-field tabular-nums"
                  type="tel"
                  inputMode="tel"
                  value={consultation.patient.phone}
                  onChange={(event) => updatePatient("phone", event.target.value)}
                />
              </label>
            </div>
            <div className="mt-5 grid gap-5 sm:grid-cols-[.6fr_1fr_1.2fr]">
              <label>
                <span className="field-label">Age</span>
                <input
                  id="patient-age"
                  aria-label="Age"
                  className="input-field"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={consultation.patient.age}
                  readOnly={Boolean(consultation.patient.dateOfBirth)}
                  aria-invalid={Boolean(errorFor("patient-age"))}
                  aria-describedby={
                    errorFor("patient-age") ? "patient-age-error" : undefined
                  }
                    onChange={(event) =>
                      updatePatient("age", event.target.value)
                    }
                />
                {errorFor("patient-age") && (
                  <FieldError id="patient-age-error">
                    {errorFor("patient-age")!}
                  </FieldError>
                )}
              </label>
              <label>
                <span className="field-label">Gender</span>
                <select
                  id="patient-sex"
                  aria-label="Gender"
                  className="input-field"
                  value={consultation.patient.sex}
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
              <label>
                <span className="field-label">Consultation date</span>
                <input
                  id="consultation-date"
                  aria-label="Consultation date"
                  className="input-field tabular-nums"
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
            </div>
            <div className="mt-8" />
            {consultation.visitType === "followup" && (
              <div className="mb-8 rounded-[24px] border border-[#15362f]/15 bg-[#ece7dc] p-5">
                <label>
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
                      !consultation.patient.patientId
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
                      {!consultation.patient.patientId
                        ? "Choose a saved patient first"
                        : priorVisitsState === "loading"
                          ? "Loading earlier prescriptions…"
                          : priorVisits.length
                            ? "Choose an earlier prescription"
                            : "No earlier prescriptions for this patient"}
                    </option>
                    {priorVisits.map((visit) => (
                      <option key={visit.id} value={visit.id}>
                        {visit.patient.name} ·{` `}
                        {formatPriorVisitDate(visit.consultationDate)}
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
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-red-900">
                    <p role="alert">
                      Earlier prescriptions could not be loaded.
                    </p>
                    <button
                      type="button"
                      className="min-h-11 rounded-full bg-white px-4 py-2 font-bold text-[#15362f] transition hover:bg-[#fbfaf5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d85f39]"
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
                    <p
                      id="prior-visit-required"
                      className="mt-3 text-sm font-semibold text-[#9b492f]"
                    >
                      {consultation.patient.patientId
                        ? "Choose the earlier prescription this follow-up continues."
                        : "Search for the patient by name or number, then choose their earlier prescription."}
                    </p>
                  )}
                {consultation.linkedPriorVisit && (
                  <section
                    aria-labelledby="linked-prior-visit-heading"
                    className="mt-4 min-w-0 rounded-2xl bg-white p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2
                          id="linked-prior-visit-heading"
                          className="text-sm font-extrabold"
                        >
                          Linked prior visit
                        </h2>
                        <p className="mt-1 break-words text-base font-bold">
                          {consultation.linkedPriorVisit.patient.name}
                        </p>
                        <p className="mt-1 text-sm text-[#536760]">
                          Age {consultation.linkedPriorVisit.patient.age} ·{` `}
                          {consultation.linkedPriorVisit.patient.sex}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="Remove prior visit link"
                        className="min-h-11 rounded-full bg-[#f0ece3] px-4 py-2 text-sm font-bold text-[#15362f] transition hover:bg-[#e4ded2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d85f39]"
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
                    </div>
                    <dl className="mt-4 grid min-w-0 gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="field-label">Date</dt>
                        <dd className="font-semibold tabular-nums">
                          {formatPriorVisitDate(
                            consultation.linkedPriorVisit.consultationDate,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="field-label">Doctor</dt>
                        <dd className="font-semibold">
                          {consultation.linkedPriorVisit.doctorName}
                        </dd>
                      </div>
                      <div className="min-w-0 sm:col-span-2">
                        <dt className="field-label">Clinical summary</dt>
                        <dd className="break-words leading-relaxed text-[#435c54]">
                          {consultation.linkedPriorVisit.clinicalSummary}
                        </dd>
                      </div>
                    </dl>
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
              className="m-0 min-w-0 border-0 p-0 disabled:opacity-55"
            >
              {clinicalEntryBlocked && saveState !== "loading" && (
                <span id="followup-link-required" className="sr-only">
                  Clinical entry is unavailable until an earlier prescription is
                  linked.
                </span>
              )}
            <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-5">
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
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
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
            </div>
            <div className="mt-7">
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
            <div className="mt-7 grid gap-6 sm:grid-cols-2">
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
            </div>
            <div className="mt-8 border-t border-[#15362f]/10 pt-8">
              <CatalogPicker
                label="Medicines"
                inputId="medicines"
                catalogName="medicines"
                groups={medicines}
                  value={consultation.medicines.map(
                    (medicine) => medicine.name,
                  )}
                onChange={(value) => selectMedicines(value as string[])}
                multiple
              />
              <div className="medicine-list mt-5 space-y-3">
                {consultation.medicines.map((medicine, i) => (
                  <div
                    key={medicine.name}
                    className="medicine-row"
                  >
                    <div className="medicine-identity min-w-0">
                      <b className="text-sm">
                        {i + 1}. {medicine.name}
                      </b>
                      <p className="mt-1 break-words text-xs text-[#536760]">
                        {ingredientByMedicine[medicine.name] ||
                          "Composition from medicine catalog"}
                      </p>
                    </div>
                    <MedicineInstructionSelect
                      id={`medicine-${i}-dose`}
                      label={`${medicine.name} dose`}
                      fieldLabel="Dose"
                      value={medicine.dose}
                      error={errorFor(`medicine-${i}-dose`)}
                      placeholder="Choose dose"
                      options={[
                        "1–0–1",
                        "1–0–0",
                        "0–0–1",
                        "1–1–1",
                        "0–1–0",
                        "As needed",
                      ]}
                      onChange={(value) =>
                        updateMedicine(medicine.name, "dose", value)
                      }
                    />
                    <MedicineInstructionSelect
                      id={`medicine-${i}-duration`}
                      label={`${medicine.name} duration`}
                      fieldLabel="Duration"
                      value={medicine.duration}
                      error={errorFor(`medicine-${i}-duration`)}
                      placeholder="Choose duration"
                      options={[
                        "1 day",
                        "3 days",
                        "5 days",
                        "7 days",
                        "10 days",
                        "14 days",
                        "Until review",
                      ]}
                      onChange={(value) =>
                        updateMedicine(medicine.name, "duration", value)
                      }
                    />
                    <MedicineInstructionSelect
                      id={`medicine-${i}-method`}
                      label={`${medicine.name} method`}
                      fieldLabel="Method"
                      value={medicine.method}
                      error={errorFor(`medicine-${i}-method`)}
                      placeholder="Choose method"
                      options={[
                        "After food",
                        "Before food",
                        "With water",
                        "At bedtime",
                        "As needed",
                        "As directed",
                      ]}
                      onChange={(value) =>
                        updateMedicine(medicine.name, "method", value)
                      }
                    />
                    <button
                      type="button"
                      id={`medicine-${i}-remove`}
                      aria-label={`Remove ${medicine.name}`}
                      onClick={() => {
                        const remaining = consultation.medicines
                          .filter((item) => item.name !== medicine.name)
                          .map((item) => item.name);
                        selectMedicines(remaining);
                        window.requestAnimationFrame(() => {
                          const nextRemove = document.getElementById(
                            `medicine-${Math.min(i, remaining.length - 1)}-remove`,
                          );
                          (nextRemove ?? document.getElementById("medicines"))?.focus();
                        });
                      }}
                      className="medicine-remove grid min-h-11 min-w-11 place-items-center rounded-xl bg-[#f0ece3]"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            </fieldset>
            <p className="mt-8 border-t border-[#15362f]/10 pt-7 text-sm leading-relaxed text-[#60736c]">
              Review every patient, clinical, and medicine detail before the
              prescription is locked.
            </p>
          </section>
          <div className="preview-wrap col-span-12 lg:col-span-5">
            <PrescriptionPreview consultation={consultation} />
          </div>
        </section>
        <aside
          aria-label="Current consultation actions"
          role="region"
          className="mobile-consultation-actions lg:hidden"
        >
          <div className="min-w-0">
            <p className="mobile-patient-name text-sm font-bold">
              {consultation.patient.name.trim() || "Patient not named"}
            </p>
            <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-[#60736c]">
              <span>{getVisitTypeLabel(consultation.visitType)}</span>
              <span aria-hidden="true">·</span>
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
            className="primary-action mobile-review-action min-h-11 shrink-0"
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
      </div>
    </Shell>
  );
}

