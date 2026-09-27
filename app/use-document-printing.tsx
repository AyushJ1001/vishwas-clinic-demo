"use client";

import { useState } from "react";

import { getClinicPc, type ClinicPrinter } from "./clinic-pc";

export type PrintFeedback = {
  kind: "status" | "error";
  text: string;
};

function printerLabel(
  printerName: string | null,
  printers: ClinicPrinter[],
) {
  const printer = printerName
    ? printers.find((candidate) => candidate.name === printerName)
    : printers.find((candidate) => candidate.isDefault);
  if (printer) return printer.displayName || printer.name;
  return printerName || "the system default printer";
}

function failureText(message: string) {
  const detail = message.trim().replace(/[.]+$/, "");
  return `Printing failed: ${detail}. Check the printer, then try again.`;
}

export function useDocumentPrinting(webFailureMessage: string) {
  const clinicPc = getClinicPc();
  const [feedback, setFeedback] = useState<PrintFeedback | null>(null);
  const [printing, setPrinting] = useState(false);

  const startPrint = async (withOptions: boolean) => {
    setFeedback(null);
    if (!clinicPc) {
      try {
        window.print();
      } catch {
        setFeedback({ kind: "error", text: webFailureMessage });
      }
      return;
    }

    setPrinting(true);
    try {
      const settings = await clinicPc.printing.settings();
      let printers: ClinicPrinter[] = [];
      try {
        printers = await clinicPc.printing.listPrinters();
      } catch {
        // The main print call reports a useful failure if printer discovery
        // itself is unavailable.
      }
      document.documentElement.dataset.printPaper = settings.paper;
      try {
        const result = await (withOptions
          ? clinicPc.printing.printWithOptions()
          : clinicPc.printing.print());
        if (result.status === "printed") {
          setFeedback({
            kind: "status",
            text: `Sent to ${printerLabel(settings.printerName, printers)}.`,
          });
        } else if (result.status === "cancelled") {
          setFeedback({ kind: "status", text: "Printing was cancelled." });
        } else if (result.status === "no-printer") {
          setFeedback({
            kind: "error",
            text: "No printer was found. Connect or install a printer, then try again.",
          });
        } else {
          setFeedback({ kind: "error", text: failureText(result.message) });
        }
      } finally {
        delete document.documentElement.dataset.printPaper;
      }
    } catch {
      setFeedback({
        kind: "error",
        text: "Printing could not start. Check the printer, then try again.",
      });
    } finally {
      setPrinting(false);
    }
  };

  return {
    feedback,
    isClinicPc: clinicPc !== null,
    print: () => void startPrint(false),
    printWithOptions: () => void startPrint(true),
    printing,
  };
}

export function PrintFeedbackNotice({
  feedback,
}: {
  feedback: PrintFeedback | null;
}) {
  if (!feedback) return null;
  return (
    <p
      role={feedback.kind === "error" ? "alert" : "status"}
      className={
        feedback.kind === "error"
          ? "notice notice-error mt-3"
          : "status-line"
      }
    >
      {feedback.text}
    </p>
  );
}
