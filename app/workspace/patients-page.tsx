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

const importBatchSize = 500;
const visibleImportProblemLimit = 50;

function formatImportCount(count: number) {
  return count.toLocaleString("en-IN");
}

function emptyImportSummary(): PatientImportSummary {
  return {
    requested: 0,
    imported: 0,
    updated: 0,
    skipped: 0,
    problems: [],
  };
}

export function PatientImportCard({ onImported }: { onImported: () => void }) {
  const [text, setText] = useState("");
  const [importState, setImportState] = useState<ImportState>("idle");
  const [summary, setSummary] = useState<PatientImportSummary | null>(null);
  const [failureMessage, setFailureMessage] = useState("");
  const [completedRows, setCompletedRows] = useState(0);
  const fileInputId = useId();
  const parsed = useMemo(() => parsePatientImportText(text), [text]);
  const hasRows = parsed.rows.length > 0;

  const importPatients = async () => {
    setImportState("importing");
    setSummary(null);
    setFailureMessage("");
    setCompletedRows(0);
    const orderedRows = [
      ...parsed.rows.filter((row) => row.number),
      ...parsed.rows.filter((row) => !row.number),
    ];
    const combinedSummary = emptyImportSummary();
    try {
      for (let offset = 0; offset < orderedRows.length; offset += importBatchSize) {
        const batch = orderedRows.slice(offset, offset + importBatchSize);
        const response = await fetch("/api/patients/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patients: batch }),
        });
        const data = (await response.json().catch(() => null)) as {
          summary?: PatientImportSummary;
          error?: string;
        } | null;
        if (!response.ok || !data?.summary) {
          throw new Error(data?.error ?? "Import failed");
        }
        combinedSummary.requested += data.summary.requested;
        combinedSummary.imported += data.summary.imported;
        combinedSummary.updated += data.summary.updated;
        combinedSummary.skipped += data.summary.skipped;
        combinedSummary.problems.push(...data.summary.problems);
        setCompletedRows(Math.min(offset + batch.length, orderedRows.length));
      }
      setSummary(combinedSummary);
      setImportState("done");
      onImported();
    } catch {
      setSummary(combinedSummary);
      const saved = combinedSummary.imported + combinedSummary.updated;
      setFailureMessage(
        `The import stopped after ${formatImportCount(combinedSummary.requested)} of ${formatImportCount(orderedRows.length)} rows. ${formatImportCount(saved)} patient record${saved === 1 ? " was" : "s were"} confirmed saved. Press Import again; records already saved will not be duplicated.`,
      );
      setImportState("failed");
      // Batches before the failure are saved, so the directory shows them.
      if (saved > 0) onImported();
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
        From Excel, select the columns including the header row, copy, and
        paste below. Or save as CSV UTF-8 and choose the file. Only name is
        required.
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
          disabled={importState === "importing"}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setSummary(null);
            setImportState("idle");
            setCompletedRows(0);
            setText(await file.text());
            event.target.value = "";
          }}
        />
        {text && (
          <button
            type="button"
            className="btn btn-quiet"
            disabled={importState === "importing"}
            onClick={() => {
              setText("");
              setSummary(null);
              setImportState("idle");
              setCompletedRows(0);
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
        disabled={importState === "importing"}
        onChange={(event) => {
          setText(event.target.value);
          setImportState("idle");
          setSummary(null);
          setCompletedRows(0);
        }}
      />
      {text.trim() && (
        <div className="mt-4 border border-rule bg-paper p-3">
          {hasRows ? (
            <p className="font-semibold" role="status">
              {formatImportCount(parsed.rows.length)} patient row
              {parsed.rows.length === 1 ? "" : "s"} ready to import.
            </p>
          ) : (
            <p className="text-signal font-semibold" role="status">
              No importable patient rows were found yet.
            </p>
          )}
          {parsed.problems.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-signal">
              {parsed.problems
                .slice(0, visibleImportProblemLimit)
                .map((problem, index) => (
                  <li key={index}>
                    <b>{problem.source}:</b> {problem.message}
                  </li>
                ))}
            </ul>
          )}
          {parsed.problems.length > visibleImportProblemLimit && (
            <p className="hint mt-2">
              …and {parsed.problems.length - visibleImportProblemLimit} more.
            </p>
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
              …and {formatImportCount(parsed.rows.length - 5)} more.
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
          ? `Saving patient records… ${formatImportCount(completedRows)} of ${formatImportCount(parsed.rows.length)}`
          : `Import ${parsed.rows.length ? formatImportCount(parsed.rows.length) : ""} patient${parsed.rows.length === 1 ? "" : "s"}`.trimEnd()}
      </button>
      {importState === "done" && summary && (
        <p className="notice notice-done mt-4" role="status">
          {formatImportCount(summary.imported)} new patient record
          {summary.imported === 1 ? "" : "s"} saved
          {summary.updated > 0
            ? ` · ${formatImportCount(summary.updated)} existing record${summary.updated === 1 ? "" : "s"} updated by number.`
            : "."}
          {summary.skipped > 0 &&
            ` ${formatImportCount(summary.skipped)} row${summary.skipped === 1 ? " was" : "s were"} already saved or invalid.`}
        </p>
      )}
      {importState === "failed" && (
        <p className="notice notice-error mt-4" role="alert">
          {failureMessage}
        </p>
      )}
      {summary && summary.problems.length > 0 && (
        <div className="mt-3 border border-rule bg-paper p-3">
          <p className="font-semibold">Problems found while saving:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-signal">
            {summary.problems
              .slice(0, visibleImportProblemLimit)
              .map((problem, index) => (
                <li key={index}>{problem}</li>
              ))}
          </ul>
          {summary.problems.length > visibleImportProblemLimit && (
            <p className="hint mt-2">
              …and {summary.problems.length - visibleImportProblemLimit} more.
            </p>
          )}
        </div>
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
