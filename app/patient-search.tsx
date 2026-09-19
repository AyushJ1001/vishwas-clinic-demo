"use client";

import { useEffect, useRef, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import type { PatientRecord } from "./consultation-model";

type PatientSearchState = "idle" | "loading" | "ready" | "failed";

export function describePatient(patient: PatientRecord) {
  const parts = [
    patient.number !== null ? `No. ${patient.number}` : "Number pending",
    patient.age ? `Age ${patient.age}` : "",
    patient.sex,
    patient.phone,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function PatientNameSearch({
  id,
  value,
  disabled = false,
  invalid = false,
  describedBy,
  onNameChange,
  onPatientSelected,
}: {
  id: string;
  value: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onNameChange: (name: string) => void;
  onPatientSelected: (patient: PatientRecord) => void;
}) {
  const listboxId = `${id}-patient-listbox`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<PatientRecord[]>([]);
  const [state, setState] = useState<PatientSearchState>("idle");
  const [activeIndex, setActiveIndex] = useState(-1);
  const query = value.trim();
  const panelOpen = open && !disabled && Boolean(query);
  const listboxShown = panelOpen && results.length > 0;
  const emptyMessage =
    state === "ready" && results.length === 0
      ? `No saved patient matches “${query}”. They will be registered with the next patient number when this prescription is completed.`
      : "";

  useEffect(() => {
    if (!open) return;
    const dismissOnOutsidePress = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", dismissOnOutsidePress);
    return () => {
      window.removeEventListener("pointerdown", dismissOnOutsidePress);
    };
  }, [open]);

  useEffect(() => {
    if (disabled || !panelOpen) return;
    const request = requestRef.current + 1;
    requestRef.current = request;
    const timer = window.setTimeout(() => {
      setState("loading");
      fetch(
        `/api/patients?q=${encodeURIComponent(query)}&limit=8`,
      )
        .then((response) =>
          response.ok
            ? (response.json() as Promise<{ patients?: PatientRecord[] }>)
            : Promise.reject(new Error("patient search failed")),
        )
        .then((data) => {
          if (requestRef.current !== request) return;
          const patients = data.patients ?? [];
          setResults(patients);
          setActiveIndex(patients.length ? 0 : -1);
          setState("ready");
        })
        .catch(() => {
          if (requestRef.current !== request) return;
          setResults([]);
          setActiveIndex(-1);
          setState("failed");
        });
    }, 160);
    return () => window.clearTimeout(timer);
  }, [disabled, panelOpen, query]);

  const openDropdown = () => {
    if (disabled) return;
    setOpen(true);
  };

  const selectPatient = (patient: PatientRecord) => {
    setOpen(false);
    setActiveIndex(-1);
    setResults([]);
    requestRef.current += 1;
    onPatientSelected(patient);
  };

  const moveActive = (delta: number) => {
    if (!results.length) return;
    setActiveIndex((current) => {
      const next = current + delta;
      if (next < 0) return results.length - 1;
      if (next >= results.length) return 0;
      return next;
    });
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        id={id}
        className="input-field pr-9"
        type="text"
        autoComplete="off"
        role="combobox"
        aria-expanded={listboxShown}
        aria-haspopup="listbox"
        aria-controls={listboxShown ? listboxId : undefined}
        aria-activedescendant={
          listboxShown && activeIndex >= 0
            ? `${id}-patient-option-${activeIndex}`
            : undefined
        }
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        placeholder="Name, patient number or phone"
        value={value}
        onChange={(event) => {
          onNameChange(event.target.value);
          openDropdown();
        }}
        onFocus={openDropdown}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!open) {
              openDropdown();
            } else {
              moveActive(1);
            }
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            moveActive(-1);
          } else if (event.key === "Enter" && listboxShown && activeIndex >= 0) {
            event.preventDefault();
            const patient = results[activeIndex];
            if (patient) selectPatient(patient);
          } else if (event.key === "Escape" && open) {
            event.stopPropagation();
            setOpen(false);
          }
        }}
      />
      <MagnifyingGlass
        aria-hidden="true"
        size={15}
        weight="bold"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#536760]"
      />
      {panelOpen && (
        <div className="picker-panel">
          <div className="picker-scroll patient-search-scroll">
            {state === "loading" && (
              <p className="patient-search-status">Searching patient records…</p>
            )}
            {state === "failed" && (
              <p className="patient-search-status" role="alert">
                Patient records could not be searched. You can still type the
                name.
              </p>
            )}
            {emptyMessage && (
              <p className="patient-search-status">{emptyMessage}</p>
            )}
            {results.length > 0 && (
              <div
                id={listboxId}
                role="listbox"
                aria-label="Matching patient records"
              >
                {results.map((patient, index) => (
                  <button
                    type="button"
                    key={patient.id}
                    id={`${id}-patient-option-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    data-active={index === activeIndex ? "true" : undefined}
                    tabIndex={-1}
                    className="picker-option patient-search-option"
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectPatient(patient)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">
                        {patient.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs font-semibold text-[#536760]">
                        {describePatient(patient)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Announced without a status role so the page keeps a single status
          region for the consultation save state. */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {panelOpen && state === "ready"
          ? emptyMessage ||
            `${results.length} saved patient${results.length === 1 ? "" : "s"} found.`
          : ""}
      </span>
    </div>
  );
}
