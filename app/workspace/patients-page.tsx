"use client";

import { SealCheck, UploadSimple } from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useState } from "react";
import {
  formatConsultationDate,
  type PatientImportSummary,
  type PatientRecord,
} from "../consultation-model";
import { parsePatientImportText } from "../patient-import";

import { PageHeader, Shell } from "./shell";

export type ImportState = "idle" | "importing" | "done" | "failed";

export type DirectoryState = "loading" | "ready" | "failed";

export function PatientImportCard({ onImported }: { onImported: () => void }) {
  const [text, setText] = useState("");
  const [importState, setImportState] = useState<ImportState>("idle");
  const [summary, setSummary] = useState<PatientImportSummary | null>(null);
  const [failureMessage, setFailureMessage] = useState("");
  const fileInputId = useId();
  const parsed = useMemo(() => parsePatientImportText(text), [text]);
  const hasRows = parsed.rows.length > 0;

  const importPatients = async () => {
    setImportState("importing");
    setFailureMessage("");
    try {
      const response = await fetch("/api/patients/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await response.json()) as {
        summary?: PatientImportSummary;
        error?: string;
      };
      if (!response.ok || !data.summary) {
        throw new Error(data.error ?? "Import failed");
      }
      setSummary(data.summary);
      setImportState("done");
      onImported();
    } catch {
      setSummary(null);
      setFailureMessage(
        "The import could not be saved. Check the file and try again.",
      );
      setImportState("failed");
    }
  };

  return (
    <article
      aria-labelledby="patient-import-heading"
      className="panel panel-section min-w-0 lg:col-span-5"
    >
      <h2 id="patient-import-heading" className="section-title">
        Import from the old register
      </h2>
      <p className="hint mt-2">
        Accepted columns: number, name, date of birth (dd/mm/yyyy), age,
        gender, phone. Only name is required.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label
          htmlFor={fileInputId}
          className="btn btn-secondary cursor-pointer"
        >
          <UploadSimple size={16} weight="bold" />
          Choose CSV or JSON file
        </label>
        <input
          id={fileInputId}
          className="sr-only"
          type="file"
          accept=".csv,.json,.txt,text/csv,application/json,text/plain"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setSummary(null);
            setImportState("idle");
            setText(await file.text());
            event.target.value = "";
          }}
        />
        {text && (
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              setText("");
              setSummary(null);
              setImportState("idle");
            }}
          >
            Clear
          </button>
        )}
      </div>
      <label htmlFor="patient-import-text" className="field-label mt-4">
        Or paste patient rows
      </label>
      <textarea
        id="patient-import-text"
        className="input-field min-h-32 font-mono text-sm"
        value={text}
        placeholder={"number,name,date of birth,age,sex,phone"}
        onChange={(event) => {
          setText(event.target.value);
          setImportState("idle");
          setSummary(null);
        }}
      />
      {text.trim() && (
        <div className="mt-4 border border-rule bg-paper p-3">
          {hasRows ? (
            <p className="font-semibold" role="status">
              {parsed.rows.length} patient row
              {parsed.rows.length === 1 ? "" : "s"} ready to import.
            </p>
          ) : (
            <p className="text-signal font-semibold" role="status">
              No importable patient rows were found yet.
            </p>
          )}
          {parsed.problems.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-signal">
              {parsed.problems.map((problem, index) => (
                <li key={index}>
                  <b>{problem.source}:</b> {problem.message}
                </li>
              ))}
            </ul>
          )}
          {hasRows && (
            <ul className="mt-3 divide-y divide-rule border-t border-rule">
              {parsed.rows.slice(0, 5).map((row, index) => (
                <li
                  key={index}
                  className="grid gap-1 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-4"
                >
                  <span className="min-w-0 truncate font-semibold">
                    {row.name}
                  </span>
                  <span className="flex flex-wrap gap-x-3 text-graphite">
                    <span>{row.number ? `No. ${row.number}` : "Next number"}</span>
                    <span>
                      {row.dateOfBirth
                        ? `Born ${formatConsultationDate(row.dateOfBirth)}`
                        : row.age
                          ? `Age ${row.age}`
                          : "Age not given"}
                    </span>
                    {row.sex && <span>{row.sex}</span>}
                    {row.phone && <span>{row.phone}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {parsed.rows.length > 5 && (
            <p className="hint mt-2">
              …and {parsed.rows.length - 5} more.
            </p>
          )}
        </div>
      )}
      <button
        type="button"
        className="btn btn-primary mt-4"
        disabled={!hasRows || importState === "importing"}
        onClick={() => void importPatients()}
      >
        <SealCheck size={17} weight="bold" />
        {importState === "importing"
          ? "Saving patient records…"
          : `Import ${parsed.rows.length || ""} patient${parsed.rows.length === 1 ? "" : "s"}`.trimEnd()}
      </button>
      {importState === "done" && summary && (
        <p className="notice notice-done mt-4" role="status">
          {summary.imported} new patient record
          {summary.imported === 1 ? "" : "s"} saved
          {summary.updated > 0
            ? ` · ${summary.updated} existing record${summary.updated === 1 ? "" : "s"} updated by number.`
            : "."}
          {summary.skipped > 0 &&
            ` ${summary.skipped} row${summary.skipped === 1 ? " was" : "s were"} already saved or invalid.`}
        </p>
      )}
      {importState === "failed" && (
        <p className="notice notice-error mt-4" role="alert">
          {failureMessage}
        </p>
      )}
    </article>
  );
}

export function PatientDirectoryCard({ reloadKey }: { reloadKey: number }) {
  const [search, setSearch] = useState("");
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [state, setState] = useState<DirectoryState>("loading");
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setState("loading");
      fetch(
        `/api/patients?q=${encodeURIComponent(search.trim())}&limit=25`,
        { signal: controller.signal },
      )
        .then((response) =>
          response.ok
            ? (response.json() as Promise<{ patients?: PatientRecord[] }>)
            : Promise.reject(new Error("patient directory failed")),
        )
        .then((data) => {
          setPatients(data.patients ?? []);
          setState("ready");
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setState("failed");
        });
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [reloadKey, search]);
  return (
    <article
      aria-labelledby="patient-directory-heading"
      className="panel panel-section min-w-0 lg:col-span-7"
    >
      <div className="panel-header items-end">
        <h2 id="patient-directory-heading" className="section-title">
          Saved patient records
        </h2>
        <label className="min-w-0 flex-1 sm:max-w-xs">
          <span className="field-label">Search by name, number or phone</span>
          <input
            className="input-field"
            type="search"
            aria-label="Search saved patient records"
            placeholder="e.g. Mehta"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      {state === "failed" ? (
        <p className="notice notice-error" role="alert">
          Saved patient records could not be loaded.
        </p>
      ) : state === "loading" ? (
        <p className="status-line" role="status">
          Loading patient records…
        </p>
      ) : patients.length === 0 ? (
        <p className="status-line" role="status">
          {search
            ? "No saved patient matches that name."
            : "No patient records yet. Import a list or complete a prescription to start the directory."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-rule text-graphite">
                <th className="py-2 pr-3 text-right font-medium">No.</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Age</th>
                <th className="px-3 py-2 font-medium">Gender</th>
                <th className="py-2 pl-3 font-medium">Phone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {patients.map((patient) => (
                <tr key={patient.id}>
                  <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-graphite">
                    {patient.number ?? "Pending patient number"}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-semibold">{patient.name}</span>
                    {patient.phoneIssued && (
                      <span className="mt-1 block text-xs text-graphite">
                        Phone-issued
                      </span>
                    )}
                    {patient.possibleDuplicate && (
                      <span className="mt-1 block text-xs font-semibold text-attention">
                        Possible duplicate
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {patient.age || "—"}
                    {patient.dateOfBirth && !patient.dateOfBirthEstimated && (
                      <span className="hint ml-2 inline">
                        born {formatConsultationDate(patient.dateOfBirth)}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{patient.sex}</td>
                  <td className="whitespace-nowrap py-2 pl-3">
                    {patient.phone || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

export function PatientsPage() {
  const [reloadKey, setReloadKey] = useState(0);
  return (
    <Shell active="patients">
      <div className="page">
        <PageHeader title="Patients" />
        <section className="grid items-start gap-4 lg:grid-cols-12">
          <PatientDirectoryCard reloadKey={reloadKey} />
          <PatientImportCard
            onImported={() => setReloadKey((key) => key + 1)}
          />
        </section>
      </div>
    </Shell>
  );
}
