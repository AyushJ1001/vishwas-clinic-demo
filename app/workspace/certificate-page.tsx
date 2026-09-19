"use client";

import { SealCheck } from "@phosphor-icons/react";
import { useState } from "react";
import { diagnoses } from "../clinic-data";

import { A5Document, RouteWorkspace } from "./a5-workspace";
import { CatalogPicker } from "./catalog-picker";
import { RouteHeader, Shell } from "./shell";

export function CertificatePage() {
  const [patientName, setPatientName] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [treatmentDate, setTreatmentDate] = useState("");
  const [restDays, setRestDays] = useState("");
  const [isFit, setIsFit] = useState(true);
  return (
    <Shell active="certificate">
      <RouteHeader
        eyebrow="Medical certificate"
        title="Review the facts. Issue the certificate."
        copy="Treatment dates, diagnosis, rest period, and fitness status remain editable before the final A5 document is generated."
      />
      <RouteWorkspace
        form={
          <>
            <label>
              <span className="field-label">Patient</span>
              <input
                className="input-field"
                value={patientName}
                onChange={(event) => setPatientName(event.target.value)}
              />
            </label>
            <CatalogPicker
              label="Diagnosis"
              catalogName="diagnoses"
              groups={diagnoses}
              value={diagnosis}
              onChange={(value) => setDiagnosis(value as string)}
            />
            <div className="grid grid-cols-2 gap-4">
              <label>
                <span className="field-label">Under treatment since</span>
                <input
                  className="input-field"
                  value={treatmentDate}
                  onChange={(event) => setTreatmentDate(event.target.value)}
                />
              </label>
              <label>
                <span className="field-label">Rest advised</span>
                <input
                  className="input-field"
                  value={restDays}
                  onChange={(event) => setRestDays(event.target.value)}
                />
              </label>
            </div>
            <label className="flex items-center gap-3 rounded-2xl border border-[#15362f]/10 bg-white p-4 text-sm">
              <input
                type="checkbox"
                checked={isFit}
                onChange={(event) => setIsFit(event.target.checked)}
              />{" "}
              Fit to resume duties from next working day
            </label>
            <button className="primary-action">
              <SealCheck size={18} /> Generate medical certificate
            </button>
          </>
        }
        preview={
          <A5Document title="FITNESS CERTIFICATE">
            <p className="mt-10 text-sm leading-8">
              This is to certify that <b>Ms. {patientName || "—"}</b> has been
              under my treatment since <b>{treatmentDate || "—"}</b>. She was
              suffering from <b>{diagnosis || "—"}</b> and was advised rest for{" "}
              <b>{restDays || "—"}</b>.
            </p>
            <p className="mt-5 text-sm leading-8">
              On examination today, I found her {isFit ? "fit" : "not fit"} to
              resume duties from the next working day.
            </p>
            <p className="mt-24 text-right text-sm font-bold">
              Dr. Makarand V. Apte
            </p>
          </A5Document>
        }
      />
    </Shell>
  );
}

