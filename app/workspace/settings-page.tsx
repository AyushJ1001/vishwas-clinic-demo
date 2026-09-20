"use client";

import { Printer } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import {
  getClinicPc,
  type ClinicPrinter,
  type PrintSettings,
} from "../clinic-pc";
import {
  PrintFeedbackNotice,
  useDocumentPrinting,
} from "../use-document-printing";

import { PageHeader, Shell } from "./shell";

export function SettingsPage() {
  const clinicPc = getClinicPc();
  const [printers, setPrinters] = useState<ClinicPrinter[]>([]);
  const [settings, setSettings] = useState<PrintSettings | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const saveSequence = useRef(0);
  const printing = useDocumentPrinting(
    "The print dialog did not open. Check the printer, then try again.",
  );

  useEffect(() => {
    if (!clinicPc) return;
    let current = true;
    void Promise.all([
      clinicPc.printing.settings(),
      clinicPc.printing.listPrinters(),
    ]).then(
      ([savedSettings, foundPrinters]) => {
        if (!current) return;
        setSettings(savedSettings);
        setPrinters(foundPrinters);
      },
      () => {
        if (current) setLoadFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [clinicPc]);

  const save = (next: PrintSettings) => {
    if (!clinicPc) return;
    const sequence = saveSequence.current + 1;
    saveSequence.current = sequence;
    setSettings(next);
    setSaveState("saving");
    void clinicPc.printing.saveSettings(next).then(
      () => {
        if (saveSequence.current === sequence) setSaveState("saved");
      },
      () => {
        if (saveSequence.current === sequence) setSaveState("error");
      },
    );
  };

  return (
    <Shell active="settings">
      <div className="page">
        <PageHeader title="Settings" />
        <section className="panel" aria-labelledby="printing-settings-heading">
          <div className="panel-section">
            <div className="panel-header">
              <h2 id="printing-settings-heading" className="section-title">
                Printing
              </h2>
              {saveState === "saving" && (
                <span className="status-line" role="status">
                  Saving…
                </span>
              )}
              {saveState === "saved" && (
                <span className="status-line" role="status">
                  Saved
                </span>
              )}
            </div>
            {loadFailed ? (
              <p role="alert" className="notice notice-error">
                Print settings could not be loaded. Close and reopen the app,
                then try again.
              </p>
            ) : settings ? (
              <div className="grid max-w-2xl gap-4">
                <label>
                  <span className="field-label">Printer</span>
                  <select
                    className="input-field"
                    value={settings.printerName ?? ""}
                    onChange={(event) =>
                      save({
                        ...settings,
                        printerName: event.target.value || null,
                      })
                    }
                  >
                    <option value="">Use the system default printer</option>
                    {printers.map((printer) => (
                      <option key={printer.name} value={printer.name}>
                        {printer.displayName || printer.name}
                      </option>
                    ))}
                  </select>
                </label>

                <fieldset>
                  <legend className="field-label">Paper</legend>
                  <div className="segmented">
                    <label>
                      <input
                        type="radio"
                        name="print-paper"
                        value="a5"
                        checked={settings.paper === "a5"}
                        onChange={() => save({ ...settings, paper: "a5" })}
                      />
                      <span>A5 sheet</span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="print-paper"
                        value="a5-on-a4-top"
                        checked={settings.paper === "a5-on-a4-top"}
                        onChange={() =>
                          save({ ...settings, paper: "a5-on-a4-top" })
                        }
                      />
                      <span>A5 on A4 (top half)</span>
                    </label>
                  </div>
                </fieldset>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.askEveryTime}
                    onChange={(event) =>
                      save({ ...settings, askEveryTime: event.target.checked })
                    }
                  />
                  Ask before each print
                </label>

                <div>
                  <p className="hint mb-2">
                    This prints one A5 test sheet using the choices above.
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={printing.printing || saveState === "saving"}
                    onClick={printing.print}
                  >
                    <Printer size={18} aria-hidden="true" />
                    Send a test page
                  </button>
                  <PrintFeedbackNotice feedback={printing.feedback} />
                </div>
              </div>
            ) : (
              <p className="status-line" role="status">
                Loading print settings…
              </p>
            )}
            {saveState === "error" && (
              <p role="alert" className="notice notice-error mt-3">
                The print settings were not saved. Change the setting and try
                again.
              </p>
            )}
          </div>
        </section>

        <article
          aria-label="Printing test page"
          className="completed-document-shell print-test-document"
        >
          <div>
            <h2>Vishwas Clinic</h2>
            <p>Printing test page</p>
            <p>A5 content should start at the top of the selected paper.</p>
          </div>
        </article>
      </div>
    </Shell>
  );
}
