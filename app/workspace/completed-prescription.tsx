"use client";

import {
  ArrowClockwise,
  DownloadSimple,
  Plus,
  Printer,
  SealCheck,
  ShareNetwork,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatConsultationDate,
  formatPriorVisitDate,
  type CompletedPrescriptionSnapshot,
} from "../consultation-model";
import {
  createCompletedPrescriptionDocument,
} from "../prescription-document";
import {
  downloadPrescriptionPdf,
  preparePrescriptionPdf,
  retryPrescriptionPdf,
} from "../prescription-output";

import { getVisitTypeLabel } from "./prescription-page";
import { PrescriptionDocument } from "./prescription-paper";

export type PdfOutputState =
  | { status: "preparing" }
  | { status: "ready"; file: File }
  | { status: "failed" };

export function CompletedPrescriptionView({
  snapshot,
  onStartAnother,
}: {
  snapshot: CompletedPrescriptionSnapshot;
  onStartAnother: () => Promise<void>;
}) {
  const [nextConsultationState, setNextConsultationState] = useState<
    "idle" | "starting" | "failed"
  >("idle");
  const startAnotherRef = useRef<HTMLButtonElement>(null);
  const startAnother = async () => {
    setNextConsultationState("starting");
    try {
      await onStartAnother();
    } catch {
      setNextConsultationState("failed");
    }
  };
  // Focus once the failed state has re-enabled the button; focusing a
  // still-disabled button is silently ignored.
  useEffect(() => {
    if (nextConsultationState === "failed") startAnotherRef.current?.focus();
  }, [nextConsultationState]);
  const document = useMemo(
    () => createCompletedPrescriptionDocument(snapshot),
    [snapshot],
  );
  const [pdfState, setPdfState] = useState<PdfOutputState>({
    status: "preparing",
  });
  const [outputMessage, setOutputMessage] = useState<{
    kind: "status" | "error";
    text: string;
  } | null>(null);
  const [sharing, setSharing] = useState(false);
  const completedStatusRef = useRef<HTMLDivElement>(null);
  const downloadButtonRef = useRef<HTMLButtonElement>(null);
  const retryPdfButtonRef = useRef<HTMLButtonElement>(null);
  const restorePdfFocusRef = useRef(false);
  const preparePdf = (restoreFocus = false) => {
    restorePdfFocusRef.current = restoreFocus;
    setPdfState({ status: "preparing" });
    setOutputMessage(null);
    void retryPrescriptionPdf(document).then(
      (file) => {
        setPdfState({ status: "ready", file });
      },
      () => {
        restorePdfFocusRef.current = false;
        setPdfState({ status: "failed" });
        requestAnimationFrame(() => retryPdfButtonRef.current?.focus());
      },
    );
  };
  useEffect(() => {
    completedStatusRef.current?.focus();
  }, []);
  useEffect(() => {
    if (pdfState.status !== "ready" || !restorePdfFocusRef.current) return;
    restorePdfFocusRef.current = false;
    downloadButtonRef.current?.focus();
  }, [pdfState.status]);
  useEffect(() => {
    let active = true;
    void preparePrescriptionPdf(document).then(
      (file) => {
        if (active) setPdfState({ status: "ready", file });
      },
      () => {
        if (active) {
          setPdfState({ status: "failed" });
          requestAnimationFrame(() => retryPdfButtonRef.current?.focus());
        }
      },
    );
    return () => {
      active = false;
    };
  }, [document]);

  const printPrescription = () => {
    setOutputMessage(null);
    try {
      window.print();
    } catch {
      setOutputMessage({
        kind: "error",
        text: "The print dialog did not open. Try again or download the PDF.",
      });
    }
  };
  const downloadPdf = () => {
    if (pdfState.status !== "ready") return;
    setOutputMessage(null);
    try {
      downloadPrescriptionPdf(pdfState.file);
    } catch {
      setOutputMessage({
        kind: "error",
        text: "The PDF could not be downloaded. Try again.",
      });
    }
  };
  const sharePrescription = () => {
    if (pdfState.status !== "ready") return;
    setOutputMessage(null);
    const data: ShareData = {
      files: [pdfState.file],
      title: `Prescription for ${document.pages[0].patient.name}`,
      text: "Completed prescription from Vishwas Clinic",
    };
    let supportsFileShare = false;
    try {
      supportsFileShare =
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: data.files });
    } catch {
      supportsFileShare = false;
    }
    if (!supportsFileShare) {
      try {
        downloadPrescriptionPdf(pdfState.file);
        setOutputMessage({
          kind: "status",
          text: "File sharing is not supported in this browser. The same PDF was downloaded instead.",
        });
      } catch {
        setOutputMessage({
          kind: "error",
          text: "Sharing is not supported and the PDF could not be downloaded. Try the download again.",
        });
      }
      return;
    }

    try {
      setSharing(true);
      void navigator.share(data).then(
        () => {
          setSharing(false);
          setOutputMessage({ kind: "status", text: "Prescription shared." });
        },
        (error: unknown) => {
          setSharing(false);
          if (error instanceof DOMException && error.name === "AbortError")
            return;
          setOutputMessage({
            kind: "error",
            text: "The prescription could not be shared. Try again or download the PDF.",
          });
        },
      );
    } catch (error) {
      setSharing(false);
      if (error instanceof DOMException && error.name === "AbortError") return;
      setOutputMessage({
        kind: "error",
        text: "The prescription could not be shared. Try again or download the PDF.",
      });
    }
  };
  const linkedPriorVisit = snapshot.consultation.linkedPriorVisit;
  const completedTime = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(snapshot.completedAt));
  return (
    <section className="completed-prescription-layout mx-auto grid max-w-[1200px] gap-6 px-5 py-6 lg:grid-cols-[.65fr_1.35fr] lg:px-10 lg:py-16">
      <div className="min-w-0">
        <div
          ref={completedStatusRef}
          role="status"
          aria-label="Prescription completed"
          tabIndex={-1}
          className="rounded-[24px] bg-[#15362f] p-6 text-white"
        >
          <div className="flex items-center gap-3">
            <SealCheck size={26} weight="fill" className="shrink-0" />
            <h1 className="text-xl font-bold">Prescription completed</h1>
          </div>
          <p className="mt-4 break-words text-lg font-bold">
            {snapshot.consultation.patient.name}
          </p>
          <p className="mt-1 text-sm text-white/80">
            {getVisitTypeLabel(snapshot.consultation.visitType)} ·{" "}
            {formatConsultationDate(snapshot.consultation.consultationDate)}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-white/75">
            This prescription is locked. Refreshing reopens the same document.
          </p>
        </div>
        <section
          aria-labelledby="prescription-output-heading"
          className="completed-output mt-4 rounded-[24px] bg-[#fbfaf5] p-5"
        >
          <h2 id="prescription-output-heading" className="text-lg font-bold">
            Use this prescription
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-[#536760]">
            Print, download or share this locked A5 document.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
            <button
              type="button"
              onClick={printPrescription}
              className="output-action"
            >
              <Printer size={18} weight="bold" />
              Print prescription
            </button>
            <button
              ref={downloadButtonRef}
              type="button"
              onClick={downloadPdf}
              disabled={pdfState.status !== "ready"}
              className="output-action"
            >
              <DownloadSimple size={18} weight="bold" />
              {pdfState.status === "preparing"
                ? "Preparing PDF…"
                : "Download PDF"}
            </button>
            <button
              type="button"
              onClick={sharePrescription}
              disabled={pdfState.status !== "ready" || sharing}
              className="output-action"
            >
              <ShareNetwork size={18} weight="bold" />
              {sharing ? "Sharing prescription…" : "Share prescription"}
            </button>
          </div>
          {pdfState.status === "failed" && (
            <div role="alert" className="output-feedback output-feedback-error">
              <p>
                The PDF could not be prepared. The completed prescription is
                still available.
              </p>
              <button
                ref={retryPdfButtonRef}
                type="button"
                onClick={() => preparePdf(true)}
              >
                <ArrowClockwise size={16} weight="bold" />
                Retry PDF preparation
              </button>
            </div>
          )}
          {outputMessage && (
            <p
              role={outputMessage.kind === "error" ? "alert" : "status"}
              className={`output-feedback ${outputMessage.kind === "error" ? "output-feedback-error" : "output-feedback-status"}`}
            >
              {outputMessage.text}
            </p>
          )}
          <details className="mt-4 border-t border-[#15362f]/15 pt-2 text-sm">
            <summary className="min-h-11 cursor-pointer content-center font-semibold">
              Prescription details
            </summary>
            <dl className="space-y-3 py-3">
              <div>
                <dt className="text-[#536760]">Completed</dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {completedTime}
                </dd>
              </div>
              <div>
                <dt className="text-[#536760]">Prescription ID</dt>
                <dd className="mt-1 break-all font-semibold">{snapshot.id}</dd>
              </div>
            </dl>
            {linkedPriorVisit && (
              <section
                aria-label="Linked prior visit"
                className="border-t border-[#15362f]/15 py-3"
              >
                <h3 className="font-semibold">Linked prior visit</h3>
                <p className="mt-2">{linkedPriorVisit.patient.name}</p>
                <p>{formatPriorVisitDate(linkedPriorVisit.consultationDate)}</p>
                <p>{linkedPriorVisit.doctorName}</p>
                <p className="mt-2 leading-relaxed text-[#536760]">
                  {linkedPriorVisit.clinicalSummary}
                </p>
              </section>
            )}
          </details>
        </section>
        <section className="mt-4 rounded-[24px] bg-[#fbfaf5] p-5">
          <p className="mb-3 text-sm leading-relaxed text-[#536760]">
            Download or share this prescription before moving to the next
            patient. Starting another consultation leaves this completed record
            unchanged.
          </p>
          <button
            ref={startAnotherRef}
            type="button"
            onClick={() => void startAnother()}
            disabled={nextConsultationState === "starting"}
            className="output-action"
          >
            <Plus size={18} weight="bold" />
            {nextConsultationState === "starting"
              ? "Starting consultation…"
              : "Start another consultation"}
          </button>
          {nextConsultationState === "failed" && (
            <p role="alert" className="output-feedback output-feedback-error">
              The next consultation could not be started. This completed
              prescription is still available. Try again.
            </p>
          )}
        </section>
      </div>
      <div className="completed-document-shell min-w-0 rounded-[30px] bg-[#123930] p-5 shadow-[0_30px_80px_rgba(21,54,47,.2)]">
        <PrescriptionDocument
          pages={document.pages}
          ariaLabel="Completed prescription"
        />
      </div>
    </section>
  );
}

