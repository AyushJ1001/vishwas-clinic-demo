"use client";

import { SealCheck, UploadSimple } from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useState } from "react";
import {
  formatConsultationDate,
  type PatientImportSummary,
  type PatientRecord,
} from "../consultation-model";
import { parsePatientImportText } from "../patient-import";
import { describePatient } from "../patient-search";

import { RouteHeader, Shell } from "./shell";

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
      className="col-span-12 rounded-[30px] border border-[#15362f]/10 bg-[#fbfaf5] p-6 lg:col-span-7 lg:p-9"
    >
      <p className="eyebrow">Bulk import</p>
      <h2
        id="patient-import-heading"
        className="mt-2 text-3xl font-medium tracking-[-.03em]"
      >
        Import existing patient details
      </h2>
      <p className="mt-3 max-w-xl text-base leading-relaxed text-[#536760]">
        Paste rows from the clinic register, or upload a CSV or JSON export.
        Only the name is required. Patients keep the number from the old
        register if a number column is included; everyone else gets the next
        number. Two patients with the same name stay separate.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label
          htmlFor={fileInputId}
          className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-[#15362f] shadow-sm transition hover:bg-[#f0ece3] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#d85f39]"
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
            className="min-h-11 rounded-full px-4 py-2 text-sm font-bold text-[#536760] transition hover:text-[#15362f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d85f39]"
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
      <label htmlFor="patient-import-text" className="field-label mt-6 block">
        Or paste patient rows
      </label>
      <textarea
        id="patient-import-text"
        className="input-field min-h-40 font-mono text-sm"
        value={text}
        placeholder={"number,name,date of birth,age,sex,phone"}
        onChange={(event) => {
          setText(event.target.value);
          setImportState("idle");
          setSummary(null);
        }}
      />
      {text.trim() && (
        <div className="mt-4 rounded-2xl border border-[#15362f]/10 bg-white p-4">
          {hasRows ? (
            <p className="text-sm font-bold" role="status">
              {parsed.rows.length} patient row
              {parsed.rows.length === 1 ? "" : "s"} ready to import.
            </p>
          ) : (
            <p className="text-sm font-semibold text-[#9b492f]" role="status">
              No importable patient rows were found yet.
            </p>
          )}
          {parsed.problems.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#9b492f]">
              {parsed.problems.map((problem, index) => (
                <li key={index}>
                  <b>{problem.source}:</b> {problem.message}
                </li>
              ))}
            </ul>
          )}
          {hasRows && (
            <ul className="mt-3 divide-y divide-[#15362f]/8">
              {parsed.rows.slice(0, 5).map((row, index) => (
                <li
                  key={index}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 py-2 text-sm"
                >
                  <span className="font-bold">{row.name}</span>
                  <span className="text-[#536760]">
                    {[
                      row.number ? `No. ${row.number}` : "Next number",
                      row.dateOfBirth
                        ? `Born ${formatConsultationDate(row.dateOfBirth)}`
                        : row.age
                          ? `Age ${row.age}`
                          : "Age not given",
                      row.sex,
                      row.phone,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {parsed.rows.length > 5 && (
            <p className="mt-2 text-xs text-[#536760]">
              …and {parsed.rows.length - 5} more.
            </p>
          )}
        </div>
      )}
      <button
        type="button"
        className="primary-action mt-6 min-h-11"
        disabled={!hasRows || importState === "importing"}
        onClick={() => void importPatients()}
      >
        <SealCheck size={17} weight="bold" />
        {importState === "importing"
          ? "Saving patient records…"
          : `Import ${parsed.rows.length || ""} patient${parsed.rows.length === 1 ? "" : "s"}`.trimEnd()}
      </button>
      {importState === "done" && summary && (
        <p
          className="mt-4 rounded-2xl bg-[#eef3ec] px-4 py-3 text-sm font-bold text-[#2c5e42]"
          role="status"
        >
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
        <p
          className="mt-4 rounded-2xl border border-red-800/20 bg-red-50 px-4 py-3 text-sm font-bold text-red-900"
          role="alert"
        >
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
      className="col-span-12 rounded-[30px] border border-[#15362f]/10 bg-[#fbfaf5] p-6 lg:p-9"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Directory</p>
          <h2
            id="patient-directory-heading"
            className="mt-2 text-2xl font-medium tracking-[-.03em]"
          >
            Saved patient records
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#536760]">
            These records power the patient name search on the prescription
            form. Completed prescriptions are added here automatically.
          </p>
        </div>
        <label className="min-w-0 flex-1 sm:max-w-xs">
          <span className="field-label">Search by name</span>
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
        <p className="mt-5 text-sm font-bold text-red-900" role="alert">
          Saved patient records could not be loaded.
        </p>
      ) : state === "loading" ? (
        <p className="mt-5 text-sm font-semibold text-[#536760]" role="status">
          Loading patient records…
        </p>
      ) : patients.length === 0 ? (
        <p className="mt-5 text-sm font-semibold text-[#536760]" role="status">
          {search
            ? "No saved patient matches that name."
            : "No patient records yet. Import a list or complete a prescription to start the directory."}
        </p>
      ) : (
        <ul className="mt-5 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
          {patients.map((patient) => (
            <li
              key={patient.id}
              className="flex min-w-0 items-baseline justify-between gap-4 border-b border-[#15362f]/8 py-3"
            >
              <span className="min-w-0 truncate text-sm font-bold">
                {patient.name}
              </span>
              <span className="flex-none text-xs font-semibold text-[#536760]">
                {describePatient(patient)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function PatientsPage() {
  const [reloadKey, setReloadKey] = useState(0);
  return (
    <Shell active="patients">
      <RouteHeader
        eyebrow="Patient records"
        title="Bring the register. The clinic remembers."
        copy="Import an existing patient list once, then pick any saved patient by typing their name on the prescription form."
      />
      <section className="mx-auto grid max-w-[1500px] grid-cols-12 items-start gap-5 px-5 pb-40 lg:px-10">
        <PatientImportCard onImported={() => setReloadKey((key) => key + 1)} />
        <PatientDirectoryCard reloadKey={reloadKey} />
      </section>
    </Shell>
  );
}

