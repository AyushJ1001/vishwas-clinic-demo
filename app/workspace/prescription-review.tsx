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
      className="review-dialog m-auto bg-paper p-0 text-ink"
    >
      <div className="review-dialog-header">
        <h2 id="review-prescription-heading" className="page-title">
          Review prescription
        </h2>
        <button
          type="button"
          aria-label="Close prescription review"
          disabled={isCompleting}
          onClick={onClose}
          className="icon-button"
        >
          <X size={18} />
        </button>
      </div>
      <div className="review-dialog-body">
        <section aria-labelledby="review-check-heading" className="min-w-0">
          <h3 id="review-check-heading" className="section-title">
            Before completing
          </h3>
          {problems.length ? (
            <>
              <p
                role="alert"
                className="status-line mt-2"
                data-tone="attention"
              >
                Fix {problems.length}{" "}
                {problems.length === 1 ? "problem" : "problems"} before
                completion.
              </p>
              <ul className="mt-3 space-y-2">
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
                        className="btn btn-secondary review-problem-button"
                        aria-label={
                          mustLinkPriorVisit
                            ? `Choose the earlier prescription before fixing ${problem.fieldLabel}`
                            : `Fix ${problem.fieldLabel}`
                        }
                      >
                        <span>{problem.message}</span>
                        <span aria-hidden="true" className="tag tag-muted">
                          Fix
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="notice notice-done mt-3 font-semibold">
              Ready to complete
            </p>
          )}
          {isFailed && (
            <p
              role="alert"
              className="notice notice-error mt-3 font-semibold"
            >
              Prescription could not be completed. Your draft is still here.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              ref={completeButtonRef}
              type="button"
              onClick={onComplete}
              disabled={problems.length > 0 || isCompleting}
              className="btn btn-primary"
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
              className="btn btn-secondary"
            >
              Return to editing
            </button>
          </div>
        </section>
        <div className="review-preview-panel min-w-0">
          <div className="review-preview-toolbar">
            <p className="section-title">Prescription preview</p>
            <div
              className="review-zoom-controls"
              aria-label="Prescription zoom controls"
              role="group"
            >
              <button
                type="button"
                className="icon-button review-zoom-button"
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
                className="icon-button review-zoom-button"
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
                className="icon-button review-fit-button"
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
