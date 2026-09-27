"use client";

import { DownloadSimple } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import { clinicDoctors } from "../clinic-facts";
import { toLocalDateInputValue, type ClinicDoctorName } from "../consultation-model";
import type { DoctorSummary, MonthlySummary } from "../issued-document-model";
import { formatRupees } from "./issued-document-sheet";
import { PageHeader, Shell } from "./shell";

const doctorNames = Object.keys(clinicDoctors) as ClinicDoctorName[];
const emptyDoctorSummary = (): DoctorSummary => ({
  patientsSeen: 0,
  newPatients: 0,
  prescriptionsNew: 0,
  prescriptionsFollowUp: 0,
  prescriptionsTotal: 0,
  receiptsIssued: 0,
  amountReceivedPaise: 0,
  medicalCertificatesIssued: 0,
});

const rows: {
  label: string;
  value: (summary: DoctorSummary) => number;
  format?: (value: number) => string;
}[] = [
  { label: "Patients seen", value: (summary) => summary.patientsSeen },
  { label: "New patients", value: (summary) => summary.newPatients },
  { label: "Prescriptions: new", value: (summary) => summary.prescriptionsNew },
  { label: "Prescriptions: follow-up", value: (summary) => summary.prescriptionsFollowUp },
  { label: "Prescriptions: total", value: (summary) => summary.prescriptionsTotal },
  { label: "Receipts issued", value: (summary) => summary.receiptsIssued },
  {
    label: "Amount received",
    value: (summary) => summary.amountReceivedPaise,
    format: formatRupees,
  },
  {
    label: "Medical certificates issued",
    value: (summary) => summary.medicalCertificatesIssued,
  },
];

function emptySummary(month: string): MonthlySummary {
  return {
    month,
    doctors: Object.fromEntries(
      doctorNames.map((doctor) => [doctor, emptyDoctorSummary()]),
    ) as Record<ClinicDoctorName, DoctorSummary>,
    total: emptyDoctorSummary(),
  };
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function SummaryPage() {
  const currentMonth = useMemo(
    () => toLocalDateInputValue(new Date()).slice(0, 7),
    [],
  );
  const [month, setMonth] = useState(currentMonth);
  const [summary, setSummary] = useState(() => emptySummary(currentMonth));
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    fetch(`/api/summaries?month=${encodeURIComponent(month)}`)
      .then((response) => {
        if (!response.ok) throw new Error("summary failed");
        return response.json() as Promise<{ summary: MonthlySummary }>;
      })
      .then(({ summary: result }) => {
        if (!active) return;
        setSummary(result);
        setState("ready");
      })
      .catch(() => {
        if (!active) return;
        setSummary(emptySummary(month));
        setState("error");
      });
    return () => {
      active = false;
    };
  }, [month]);

  const downloadCsv = () => {
    const lines = [
      ["Measure", ...doctorNames, "Total"],
      ...rows.map((row) => [
        row.label,
        ...doctorNames.map((doctor) => {
          const value = row.value(summary.doctors[doctor]);
          return row.format?.(value) ?? value;
        }),
        row.format?.(row.value(summary.total)) ?? row.value(summary.total),
      ]),
    ];
    const blob = new Blob(
      [lines.map((line) => line.map(csvCell).join(",")).join("\r\n") + "\r\n"],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vishwas-clinic-summary-${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Shell active="summaries">
      <div className="page">
        <PageHeader title="Summaries">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={downloadCsv}
            disabled={state !== "ready"}
          >
            <DownloadSimple size={18} aria-hidden="true" /> Download CSV
          </button>
        </PageHeader>
        <section className="panel" aria-labelledby="monthly-summary-heading">
          <div className="panel-section">
            <div className="panel-header">
              <h2 id="monthly-summary-heading" className="section-title">
                Monthly summary
              </h2>
              <label>
                <span className="field-label">Month</span>
                <input
                  className="input-field"
                  type="month"
                  value={month}
                  onChange={(event) => {
                    setState("loading");
                    setMonth(event.target.value);
                  }}
                />
              </label>
            </div>
            {state === "loading" && <p role="status" className="hint">Calculating summary…</p>}
            {state === "error" && (
              <p role="alert" className="notice notice-error">
                The monthly summary could not be calculated. Choose the month again to retry.
              </p>
            )}
          </div>
          <div className="document-register-wrap">
            <table className="document-register summary-table">
              <thead>
                <tr>
                  <th scope="col">Measure</th>
                  {doctorNames.map((doctor) => <th scope="col" key={doctor}>{doctor}</th>)}
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {doctorNames.map((doctor) => {
                      const value = row.value(summary.doctors[doctor]);
                      return <td key={doctor}>{row.format?.(value) ?? value}</td>;
                    })}
                    <td>{row.format?.(row.value(summary.total)) ?? row.value(summary.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint panel-section">
            Patients imported from the old register count in the total only:
            no doctor registered them.
          </p>
        </section>
      </div>
    </Shell>
  );
}
