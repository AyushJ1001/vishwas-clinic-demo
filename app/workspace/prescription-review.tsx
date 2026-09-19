"use client";

import { Minus, Plus, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { type Consultation } from "../consultation-model";
import { type ConsultationProblem } from "../consultation-validation";
import { type CompletionState } from "../use-consultation-draft";

import { PrescriptionReviewDocument } from "./prescription-paper";

export function PrescriptionReviewDialog({
  consultation,
  problems,
  completionState,
  onClose,
  onFixProblem,
  onComplete,
}: {
  consultation: Consultation;
  problems: ConsultationProblem[];
  completionState: CompletionState;
  onClose: () => void;
  onFixProblem: (problem: ConsultationProblem) => void;
  onComplete: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstProblemRef = useRef<HTMLButtonElement>(null);
  const completeButtonRef = useRef<HTMLButtonElement>(null);
  const reviewCanvasRef = useRef<HTMLDivElement>(null);
  const reviewDocumentRef = useRef<HTMLDivElement>(null);
  const [reviewZoom, setReviewZoom] = useState(100);
  const [reviewDocumentHeight, setReviewDocumentHeight] = useState(0);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      requestAnimationFrame(() => {
        (firstProblemRef.current ?? completeButtonRef.current)?.focus();
      });
    }
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);
  useEffect(() => {
    const documentElement = reviewDocumentRef.current;
    if (!documentElement) return;
    const measure = () => setReviewDocumentHeight(documentElement.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(documentElement);
    return () => observer.disconnect();
  }, []);
  const isCompleting = completionState === "completing";
  const isFailed = completionState === "failed";
  const requiresPriorVisit =
    consultation.visitType === "followup" && !consultation.linkedPriorVisit;
  useEffect(() => {
    if (isFailed) requestAnimationFrame(() => completeButtonRef.current?.focus());
  }, [isFailed]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="review-prescription-heading"
      onCancel={(event) => {
        event.preventDefault();
        if (!isCompleting) onClose();
      }}
      className="review-dialog m-auto bg-[#f4f1e9] p-0 text-[#15362f] shadow-[0_28px_90px_rgba(21,54,47,.3)] backdrop:bg-[#102c27]/70"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[#15362f]/10 bg-[#f4f1e9] px-5 py-4 sm:px-7">
        <div>
          <h2 id="review-prescription-heading" className="text-2xl font-bold">
            Review prescription
          </h2>
          <p className="mt-1 text-sm text-[#536760]">
            Check the final paper before locking this prescription.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close prescription review"
          disabled={isCompleting}
          onClick={onClose}
          className="grid min-h-11 min-w-11 place-items-center rounded-xl bg-white transition hover:bg-[#ece7dc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d85f39] disabled:opacity-50"
        >
          <X size={18} />
        </button>
      </div>
      <div className="review-dialog-body grid min-w-0 gap-6 p-5 lg:grid-cols-[minmax(0,.72fr)_minmax(0,1.28fr)] lg:p-7">
        <section aria-labelledby="review-check-heading" className="min-w-0">
          <h3 id="review-check-heading" className="text-lg font-bold">
            Completion check
          </h3>
          {problems.length ? (
            <>
              <p
                role="alert"
                className="mt-2 text-sm leading-relaxed text-[#536760]"
              >
                Fix {problems.length}{" "}
                {problems.length === 1 ? "problem" : "problems"} before
                completion.
              </p>
              <ul className="mt-4 space-y-2">
                {problems.map((problem) => {
                  const mustLinkPriorVisit =
                    requiresPriorVisit &&
                    !fieldsOpenBeforeLinking.has(problem.fieldId);
                  // The earlier prescription can only be chosen once the
                  // patient is, so that comes first.
                  const correction = mustLinkPriorVisit
                    ? {
                        ...problem,
                        fieldId: consultation.patient.patientId
                          ? "prior-visit"
                          : "patient-name",
                      }
                    : problem;
                  return (
                    <li key={problem.key}>
                      <button
                        ref={problem === problems[0] ? firstProblemRef : undefined}
                        type="button"
                        onClick={() => onFixProblem(correction)}
                        className="flex min-h-11 w-full items-start justify-between gap-4 rounded-xl bg-white px-4 py-3 text-left text-sm font-semibold transition hover:bg-[#ece7dc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d85f39]"
                        aria-label={
                          mustLinkPriorVisit
                            ? `Choose the earlier prescription before fixing ${problem.fieldLabel}`
                            : `Fix ${problem.fieldLabel}`
                        }
                      >
                        <span>{problem.message}</span>
                        <span aria-hidden="true">
                          {mustLinkPriorVisit ? "Link visit first" : "Fix"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <div className="mt-4 rounded-2xl bg-[#e4ece7] p-4 text-sm">
              <p className="font-bold">Ready to complete</p>
              <p className="mt-1 leading-relaxed text-[#435c54]">
                Completion saves the latest revision and locks this document.
              </p>
            </div>
          )}
          {isFailed && (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-900"
            >
              Prescription could not be completed. Your draft is still here.
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              ref={completeButtonRef}
              type="button"
              onClick={onComplete}
              disabled={problems.length > 0 || isCompleting}
              className="primary-action min-h-11 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCompleting
                ? "Completing prescription…"
                : isFailed
                  ? "Retry completion"
                  : "Complete prescription"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isCompleting}
              className="min-h-11 rounded-full bg-white px-5 py-2.5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d85f39] disabled:opacity-50"
            >
              Return to editing
            </button>
          </div>
        </section>
        <div className="review-preview-panel min-w-0 rounded-[20px] bg-[#123930] p-3 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-white">
            <p className="text-sm font-bold">Prescription preview</p>
            <div
              className="flex items-center gap-1 rounded-full bg-white/10 p-1"
              aria-label="Prescription zoom controls"
              role="group"
            >
              <button
                type="button"
                className="review-zoom-button"
                aria-label="Zoom out"
                aria-controls="review-prescription-canvas"
                disabled={reviewZoom === 100}
                onClick={() =>
                  setReviewZoom((current) => Math.max(100, current - 25))
                }
              >
                <Minus size={16} weight="bold" />
              </button>
              <output
                className="min-w-12 text-center text-sm font-bold tabular-nums"
                aria-label="Review zoom"
              >
                {reviewZoom}%
              </output>
              <button
                type="button"
                className="review-zoom-button"
                aria-label="Zoom in"
                aria-controls="review-prescription-canvas"
                disabled={reviewZoom === 200}
                onClick={() =>
                  setReviewZoom((current) => Math.min(200, current + 25))
                }
              >
                <Plus size={16} weight="bold" />
              </button>
              <button
                type="button"
                className="review-fit-button"
                aria-controls="review-prescription-canvas"
                disabled={reviewZoom === 100}
                onClick={() => {
                  setReviewZoom(100);
                  reviewCanvasRef.current?.scrollTo({ left: 0, top: 0 });
                }}
              >
                Fit width
              </button>
            </div>
          </div>
          <div
            ref={reviewCanvasRef}
            id="review-prescription-canvas"
            className="review-prescription-canvas"
            role="region"
            aria-label="Prescription preview canvas"
            tabIndex={0}
          >
            <div
              className="review-document-scale"
              style={{
                width: `${reviewZoom}%`,
                height: reviewDocumentHeight
                  ? `${reviewDocumentHeight * (reviewZoom / 100)}px`
                  : undefined,
              }}
            >
              <div
                ref={reviewDocumentRef}
                style={{
                  width: `${10_000 / reviewZoom}%`,
                  transform: `scale(${reviewZoom / 100})`,
                }}
              >
                <PrescriptionReviewDocument consultation={consultation} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}

// The patient and visit details stay editable while a follow-up waits for its
// earlier prescription; everything clinical is locked until it is linked.
export const fieldsOpenBeforeLinking = new Set([
  "prior-visit",
  "prescription-type-new",
  "patient-name",
  "patient-date-of-birth",
  "patient-age",
  "patient-sex",
  "consultation-date",
]);

