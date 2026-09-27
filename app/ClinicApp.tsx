"use client";

import Link from "next/link";
import Image from "next/image";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowClockwise,
  CaretDown,
  ChartLineUp,
  Check,
  DownloadSimple,
  FloppyDisk,
  MagnifyingGlass,
  Minus,
  Plus,
  Printer,
  Pulse,
  Receipt,
  SealCheck,
  ShareNetwork,
  UploadSimple,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import {
  advice,
  diagnoses,
  findings,
  ingredientByMedicine,
  investigations,
  medicines,
  symptoms,
  type CatalogGroup,
} from "./clinic-data";
import {
  ageOn,
  formatConsultationDate,
  formatPriorVisitDate,
  type ClinicDoctorName,
  type Consultation,
  type PatientImportSummary,
  type PatientRecord,
  type PatientSex,
  type PrescribedMedicine,
  type CompletedPrescriptionSnapshot,
} from "./consultation-model";
import { parsePatientImportText } from "./patient-import";
import {
  clinicDoctors,
  clinicIdentity,
  resolveMedicineComposition,
} from "./clinic-facts";
import {
  validateConsultation,
  type ConsultationProblem,
} from "./consultation-validation";
import {
  useConsultationDraft,
  type CompletionState,
  type DraftSaveState,
} from "./use-consultation-draft";
import {
  createCompletedPrescriptionDocument,
  createPrescriptionDocumentPages,
  formatPrescriptionPatientLine,
  formatPrescriptionVitals,
  prescriptionFooter,
  prescriptionTypography,
  type PrescriptionDocumentPage,
} from "./prescription-document";
import { prescriptionTextFontFace } from "./prescription-fonts";
import {
  downloadPrescriptionPdf,
  preparePrescriptionPdf,
  retryPrescriptionPdf,
} from "./prescription-output";
import { describePatient, PatientNameSearch } from "./patient-search";
import { BackupsPanel } from "./backups-panel";
import { getClinicPc } from "./clinic-pc";

gsap.registerPlugin(ScrollTrigger);
export type RouteName =
  | "prescription"
  | "patients"
  | "receipts"
  | "certificate"
  | "summaries"
  | "backups";

const allRoutes: {
  href: string;
  label: string;
  key: RouteName;
  clinicPcOnly?: boolean;
}[] = [
  { href: "/", label: "Prescription", key: "prescription" },
  { href: "/patients", label: "Patients", key: "patients" },
  { href: "/receipts", label: "Receipts", key: "receipts" },
  {
    href: "/medical-certificate",
    label: "Medical certificate",
    key: "certificate",
  },
  { href: "/summaries", label: "Summaries", key: "summaries" },
  { href: "/backups", label: "Backups", key: "backups", clinicPcOnly: true },
];

function getVisitTypeLabel(visitType: Consultation["visitType"]) {
  if (visitType === "new") return "New consultation";
  if (visitType === "followup") return "Follow-up consultation";
  return "Prescription type needed";
}

function CatalogPicker({
  label,
  catalogName,
  groups,
  value,
  onChange,
  multiple = false,
  inputId,
  error,
}: {
  label: string;
  catalogName:
    | "symptoms"
    | "findings"
    | "diagnoses"
    | "medicines"
    | "advice"
    | "investigations";
  groups: CatalogGroup[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  multiple?: boolean;
  inputId?: string;
  error?: string;
}) {
  const pickerId = useId();
  const labelId = `${pickerId}-label`;
  const selectionId = `${pickerId}-selection`;
  const listboxId = `${pickerId}-listbox`;
  const customErrorId = `${pickerId}-custom-error`;
  const validationErrorId = inputId ? `${inputId}-error` : undefined;
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeOption, setActiveOption] = useState("");
  const [expanded, setExpanded] = useState(groups[0]?.group ?? "");
  const [savedGroups, setSavedGroups] = useState<CatalogGroup[]>([]);
  const [loadState, setLoadState] = useState<
    "loading" | "ready" | "empty" | "error"
  >("loading");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [adding, setAdding] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(groups[0]?.group ?? "");
  const [newGroup, setNewGroup] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">(
    "idle",
  );
  const values = Array.isArray(value) ? value : value ? [value] : [];
  useEffect(() => {
    if (!open) return;
    const dismissOnOutsidePress = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setAdding(false);
        setQuery("");
        setActiveOption("");
      }
    };
    window.addEventListener("pointerdown", dismissOnOutsidePress);
    return () => {
      window.removeEventListener("pointerdown", dismissOnOutsidePress);
    };
  }, [open]);
  useEffect(() => {
    let active = true;
    fetch(`/api/catalog?catalog=${catalogName}`)
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{
              entries?: { group_name: string; item_name: string }[];
            }>)
          : Promise.reject(new Error("catalog load failed")),
      )
      .then(
        (data: { entries?: { group_name: string; item_name: string }[] }) => {
          if (!active) return;
          const map = new Map<string, string[]>();
          for (const entry of data.entries ?? []) {
            map.set(entry.group_name, [
              ...(map.get(entry.group_name) ?? []),
              entry.item_name,
            ]);
          }
          setSavedGroups([...map].map(([group, items]) => ({ group, items })));
          setLoadState(data.entries?.length ? "ready" : "empty");
        },
      )
      .catch(() => {
        if (active) setLoadState("error");
      });
    return () => {
      active = false;
    };
  }, [catalogName, loadAttempt]);
  const mergedGroups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const group of [...groups, ...savedGroups]) {
      map.set(group.group, [
        ...new Set([...(map.get(group.group) ?? []), ...group.items]),
      ]);
    }
    return [...map].map(([group, items]) => ({ group, items }));
  }, [groups, savedGroups]);
  const filtered = mergedGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        item.toLowerCase().includes(query.toLowerCase()),
      ),
    }))
    .filter(
      (group) =>
        group.items.length ||
        group.group.toLowerCase().includes(query.toLowerCase()),
    );
  const exactMatch = mergedGroups.some((group) =>
    group.items.some(
      (item) => item.toLowerCase() === query.trim().toLowerCase(),
    ),
  );
  const visibleOptions = filtered.flatMap((group) =>
    expanded === group.group || query
      ? group.items.map((item) => ({ group: group.group, item }))
      : [],
  );
  const optionKey = (group: string, item: string) => `${group}\u0000${item}`;
  const optionId = (group: string, item: string) => {
    const groupIndex = mergedGroups.findIndex((entry) => entry.group === group);
    const itemIndex = mergedGroups[groupIndex]?.items.indexOf(item) ?? -1;
    return `${pickerId}-option-${groupIndex}-${itemIndex}`;
  };
  const categoryId = (group: string) =>
    `${pickerId}-category-${mergedGroups.findIndex((entry) => entry.group === group)}`;
  const groupId = (group: string) =>
    `${pickerId}-group-${mergedGroups.findIndex((entry) => entry.group === group)}`;
  const activeOptionValue = visibleOptions.find(
    ({ group, item }) => optionKey(group, item) === activeOption,
  );
  const moveActiveOption = (direction: 1 | -1) => {
    if (!visibleOptions.length) return;
    const currentIndex = visibleOptions.findIndex(
      ({ group, item }) => optionKey(group, item) === activeOption,
    );
    const nextIndex =
      currentIndex < 0
        ? direction === 1
          ? 0
          : visibleOptions.length - 1
        : (currentIndex + direction + visibleOptions.length) %
          visibleOptions.length;
    const next = visibleOptions[nextIndex];
    setActiveOption(optionKey(next.group, next.item));
    requestAnimationFrame(() =>
      document.getElementById(optionId(next.group, next.item))?.scrollIntoView({
        block: "nearest",
      }),
    );
  };
  const closePicker = (restoreFocus = false) => {
    setOpen(false);
    setAdding(false);
    setQuery("");
    setActiveOption("");
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const openPicker = () => {
    setOpen(true);
    requestAnimationFrame(() => searchRef.current?.focus());
  };
  const select = (item: string) => {
    if (multiple) {
      onChange(
        values.includes(item)
          ? values.filter((v) => v !== item)
          : [...values, item],
      );
      requestAnimationFrame(() => searchRef.current?.focus());
    } else {
      onChange(item);
      closePicker(true);
    }
  };
  const saveCustomItem = async () => {
    const itemName = query.trim();
    const groupName = newGroup.trim() || selectedGroup;
    if (!itemName || !groupName) return;
    searchRef.current?.focus();
    setSaveState("saving");
    try {
      const response = await fetch("/api/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalog: catalogName, groupName, itemName }),
      });
      if (!response.ok) throw new Error("save failed");
      setSavedGroups((current) => {
        const existing = current.find((group) => group.group === groupName);
        if (existing)
          return current.map((group) =>
            group.group === groupName
              ? { ...group, items: [...new Set([...group.items, itemName])] }
              : group,
          );
        return [...current, { group: groupName, items: [itemName] }];
      });
      select(itemName);
      setAdding(false);
      setQuery("");
      setNewGroup("");
      setSaveState("idle");
      if (multiple) requestAnimationFrame(() => searchRef.current?.focus());
    } catch {
      setSaveState("error");
    }
  };
  return (
    <div
      className="relative"
      ref={pickerRef}
      onBlur={(event) => {
        if (!open) return;
        const nextTarget = event.relatedTarget as Node | null;
        if (!nextTarget || event.currentTarget.contains(nextTarget)) return;
        closePicker();
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          closePicker(true);
        }
      }}
    >
      <span className="field-label" id={labelId}>
        {label}
      </span>
      <span className="sr-only" id={selectionId}>
        {values.length
          ? `Selected: ${values.join(", ")}`
          : "No values selected"}
      </span>
      <button
        ref={triggerRef}
        type="button"
        id={inputId}
        onClick={() => (open ? closePicker() : openPicker())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openPicker();
          }
        }}
        className="picker-trigger"
        role="combobox"
        aria-labelledby={labelId}
        aria-describedby={
          error && validationErrorId
            ? `${selectionId} ${validationErrorId}`
            : selectionId
        }
        aria-invalid={Boolean(error)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-activedescendant={
          activeOptionValue
            ? optionId(activeOptionValue.group, activeOptionValue.item)
            : undefined
        }
      >
        <span className={values.length ? "" : "text-[#536760]"}>
          {multiple
            ? values.length
              ? `${values.length} selected`
              : "Choose one or more"
            : values[0] || "Choose an item"}
        </span>
        <CaretDown size={15} />
      </button>
      {error && validationErrorId && (
        <FieldError id={validationErrorId}>{error}</FieldError>
      )}
      {multiple && values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {values.map((item, index) => (
            <button
              type="button"
              key={item}
              onClick={() => {
                select(item);
                requestAnimationFrame(() => {
                  const remaining = pickerRef.current?.querySelectorAll<HTMLButtonElement>(
                    ".selected-chip",
                  );
                  remaining?.[Math.min(index, remaining.length - 1)]?.focus();
                  if (!remaining?.length) triggerRef.current?.focus();
                });
              }}
              className="selected-chip"
              aria-label={`Remove ${item} from ${label}`}
            >
              {item}
              <X size={11} />
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="picker-panel">
          <div className="picker-search">
            <MagnifyingGlass size={15} weight="bold" />
            <input
              ref={searchRef}
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveOption("");
                setSaveState("idle");
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  moveActiveOption(event.key === "ArrowDown" ? 1 : -1);
                } else if (event.key === "Enter" && activeOptionValue) {
                  event.preventDefault();
                  select(activeOptionValue.item);
                } else if (
                  event.key === "Backspace" &&
                  !query &&
                  multiple &&
                  values.length
                ) {
                  onChange(values.slice(0, -1));
                }
              }}
              placeholder={`Search ${label.toLowerCase()}`}
              role="combobox"
              aria-label={`Search ${label}`}
              aria-expanded="true"
              aria-controls={listboxId}
              aria-activedescendant={
                activeOptionValue
                  ? optionId(activeOptionValue.group, activeOptionValue.item)
                  : undefined
              }
            />
            {query && (
              <button
                type="button"
                className="picker-search-clear"
                aria-label={`Clear ${label} search`}
                onClick={() => {
                  setQuery("");
                  setActiveOption("");
                  requestAnimationFrame(() => searchRef.current?.focus());
                }}
              >
                <X size={13} weight="bold" />
              </button>
            )}
          </div>
          <div className="picker-scroll">
            {loadState === "loading" && (
              <p className="catalog-status catalog-loading" role="status">
                Loading clinic terms for {label}…
              </p>
            )}
            {loadState === "empty" && (
              <p className="catalog-status catalog-empty" role="status">
                No clinic terms saved for {label} yet. Standard choices are
                ready.
              </p>
            )}
            {loadState === "error" && (
              <div className="catalog-error" role="alert">
                <p>
                  Clinic terms for {label} could not be loaded. Standard choices
                  are still available.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setLoadState("loading");
                    setLoadAttempt((attempt) => attempt + 1);
                    requestAnimationFrame(() => searchRef.current?.focus());
                  }}
                  aria-label={`Retry loading clinic terms for ${label}`}
                >
                  Try again
                </button>
              </div>
            )}
            {!query && (
              <div
                role="group"
                aria-label={`${label} categories`}
                className="picker-categories"
              >
                {filtered.map((group, index) => {
                  const selectedCount = group.items.filter((item) =>
                    values.includes(item),
                  ).length;
                  const isExpanded = expanded === group.group;
                  return (
                    <button
                      type="button"
                      key={group.group}
                      id={categoryId(group.group)}
                      style={query ? undefined : { order: index * 2 }}
                      onClick={() => setExpanded(isExpanded ? "" : group.group)}
                      className="picker-category"
                      aria-label={group.group}
                      aria-expanded={isExpanded}
                      aria-controls={
                        isExpanded ? groupId(group.group) : undefined
                      }
                    >
                      <span className="picker-category-label">
                        {group.group}
                        {selectedCount > 0 && (
                          <span
                            className="picker-category-count"
                            aria-hidden="true"
                          >
                            {selectedCount}
                          </span>
                        )}
                      </span>
                      <span className="picker-category-meta" aria-hidden="true">
                        <span className="picker-category-total">
                          {group.items.length}
                        </span>
                        <CaretDown size={13} weight="bold" />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <div
              id={listboxId}
              role="listbox"
              className="picker-listbox"
              aria-label={`${label} options`}
              aria-multiselectable={multiple || undefined}
            >
              {filtered.map((group, index) => {
                const isExpanded = expanded === group.group || Boolean(query);
                if (!isExpanded) return null;
                return (
                  <div
                    key={group.group}
                    id={groupId(group.group)}
                    role="group"
                    aria-label={group.group}
                    style={query ? undefined : { order: index * 2 + 1 }}
                  >
                    <div className="picker-options">
                      {group.items.map((item) => {
                        const selected = values.includes(item);
                        return (
                          <button
                            type="button"
                            key={item}
                            id={optionId(group.group, item)}
                            onClick={() => select(item)}
                            onMouseEnter={() =>
                              setActiveOption(optionKey(group.group, item))
                            }
                            className="picker-option"
                            role="option"
                            aria-selected={selected}
                            tabIndex={-1}
                            data-active={
                              activeOption === optionKey(group.group, item)
                                ? "true"
                                : undefined
                            }
                          >
                            <span>{item}</span>
                            {selected && <Check size={14} weight="bold" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            {query.trim() && filtered.length === 0 && (
              <p className="catalog-status">No matching catalog choices.</p>
            )}
            {query.trim() && !exactMatch && !adding && (
              <button
                type="button"
                onClick={() => {
                  setAdding(true);
                  setSaveState("idle");
                }}
                className="mt-2 flex min-h-11 min-w-11 w-full items-center gap-2 rounded-xl border border-dashed border-[#b85a36]/50 bg-[#fff7f0] px-3 py-3 text-left text-sm font-semibold text-[#9b492f]"
              >
                <Plus size={15} weight="bold" /> Add “{query.trim()}” as a
                clinic term
              </button>
            )}
            {adding && (
              <div className="mt-2 rounded-2xl border border-[#b85a36]/25 bg-[#fff7f0] p-3">
                <p className="text-xs font-bold text-[#15362f]">
                  Where should this term live?
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[#536760]">
                  Custom terms are saved for this clinic and kept distinct from
                  the standard catalog.
                </p>
                <select
                  value={selectedGroup}
                  onChange={(event) => setSelectedGroup(event.target.value)}
                  className="input-field mt-3"
                  aria-label={`Category for new ${label} term`}
                  aria-describedby={
                    saveState === "error" ? customErrorId : undefined
                  }
                >
                  {mergedGroups.map((group) => (
                    <option key={group.group}>{group.group}</option>
                  ))}
                </select>
                <input
                  value={newGroup}
                  onChange={(event) => setNewGroup(event.target.value)}
                  placeholder="Or create a new category"
                  className="input-field mt-2"
                  aria-label={`New category for ${label}`}
                  aria-describedby={
                    saveState === "error" ? customErrorId : undefined
                  }
                />
                {saveState === "error" && (
                  <p
                    className="mt-2 text-xs text-red-700"
                    id={customErrorId}
                    role="alert"
                  >
                    Could not save &quot;{query.trim()}&quot; to {label}. Check
                    the connection and try again.
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={saveCustomItem}
                    disabled={saveState === "saving"}
                    className="min-h-11 min-w-11 rounded-full bg-[#15362f] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                    aria-label={`Save ${query.trim()} to ${label} catalog`}
                  >
                    {saveState === "saving"
                      ? "Saving clinic term…"
                      : saveState === "error"
                        ? "Try saving again"
                        : "Save to catalog"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdding(false);
                      setSaveState("idle");
                    }}
                    className="min-h-11 min-w-11 rounded-full px-3 py-2 text-xs font-bold text-[#536760]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function UnitInput({
  label,
  value,
  unit,
  onChange,
  step = "any",
  inputId,
  error,
}: {
  label: string;
  value: string;
  unit: string;
  onChange: (value: string) => void;
  step?: string;
  inputId: string;
  error?: string;
}) {
  return (
    <label>
      <span className="field-label mb-1.5">
        {label}
      </span>
      <span className="unit-input-wrap">
        <input
          id={inputId}
          className="small-input unit-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode="decimal"
          step={step}
          aria-label={label}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
        />
        <span className="unit-suffix" aria-hidden="true">
          {unit}
        </span>
      </span>
      {error && <FieldError id={`${inputId}-error`}>{error}</FieldError>}
    </label>
  );
}

function BloodPressureInput({
  systolic,
  diastolic,
  onSystolicChange,
  onDiastolicChange,
  systolicError,
  diastolicError,
}: {
  systolic: string;
  diastolic: string;
  onSystolicChange: (value: string) => void;
  onDiastolicChange: (value: string) => void;
  systolicError?: string;
  diastolicError?: string;
}) {
  return (
    <label>
      <span className="field-label mb-1.5">
        BP
      </span>
      <span className="bp-input-wrap">
        <input
          id="systolic-blood-pressure"
          className="small-input"
          value={systolic}
          onChange={(event) => onSystolicChange(event.target.value)}
          inputMode="numeric"
          aria-label="Systolic blood pressure"
          aria-invalid={Boolean(systolicError)}
          aria-describedby={
            systolicError ? "systolic-blood-pressure-error" : undefined
          }
        />
        <span className="bp-divider" aria-hidden="true">
          /
        </span>
        <input
          id="diastolic-blood-pressure"
          className="small-input"
          value={diastolic}
          onChange={(event) => onDiastolicChange(event.target.value)}
          inputMode="numeric"
          aria-label="Diastolic blood pressure"
          aria-invalid={Boolean(diastolicError)}
          aria-describedby={
            diastolicError ? "diastolic-blood-pressure-error" : undefined
          }
        />
      </span>
      <span className="mt-1 block text-xs text-[#536760]">mmHg</span>
      {systolicError && (
        <FieldError id="systolic-blood-pressure-error">
          {systolicError}
        </FieldError>
      )}
      {diastolicError && (
        <FieldError id="diastolic-blood-pressure-error">
          {diastolicError}
        </FieldError>
      )}
    </label>
  );
}

function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <span id={id} className="mt-2 block text-sm font-semibold text-[#9b492f]">
      {children}
    </span>
  );
}

function MedicineInstructionSelect({
  id,
  label,
  fieldLabel,
  value,
  options,
  placeholder,
  error,
  onChange,
}: {
  id: string;
  label: string;
  fieldLabel: string;
  value: string;
  options: string[];
  placeholder: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-semibold text-[#536760]"
      >
        {fieldLabel}
      </label>
      <select
        id={id}
        aria-label={label}
        className="input-field min-h-11 py-2 text-sm"
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  );
}

function Shell({
  active,
  doctorName = "Dr. Makarand Vishwas Apte",
  onDoctorChange,
  doctorSelectionLocked = false,
  shouldWarnBeforeLeaving = false,
  children,
}: {
  active: RouteName;
  doctorName?: ClinicDoctorName;
  onDoctorChange?: (doctor: ClinicDoctorName) => void;
  doctorSelectionLocked?: boolean;
  shouldWarnBeforeLeaving?: boolean;
  children: React.ReactNode;
}) {
  const doctors = Object.keys(clinicDoctors) as ClinicDoctorName[];
  const isClinicPc = getClinicPc() !== null;
  const routes = allRoutes.filter((route) => isClinicPc || !route.clinicPcOnly);
  const navigateTo = (href: string) => {
    if (
      shouldWarnBeforeLeaving &&
      !window.confirm(
        "This consultation has unsaved changes. Leave and discard them?",
      )
    ) {
      return;
    }
    window.location.assign(href);
  };
  return (
    <main className="w-full max-w-full overflow-x-hidden bg-[#f4f1e9] text-[#15362f]">
      <nav className="sticky top-0 z-50 border-b border-[#15362f]/10 bg-[#f4f1e9]/92 backdrop-blur-xl">
        <div className="nav-workspace-header mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-5 py-4 lg:px-10">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#15362f] text-white">
              <Pulse size={20} weight="bold" />
            </span>
            <span>
              <b className="block text-sm">Vishwas Clinic</b>
              <small className="text-[#536760]">Doctor workspace</small>
            </span>
          </Link>
          <div className="hidden items-center rounded-full border border-[#15362f]/10 bg-white/70 p-1 md:flex">
            {routes.map((route) => (
              <Link
                key={route.key}
                href={route.href}
                onClick={(event) => {
                  event.preventDefault();
                  navigateTo(route.href);
                }}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${active === route.key ? "bg-[#15362f] text-white" : "hover:bg-[#ece7dc]"}`}
              >
                {route.label}
              </Link>
            ))}
          </div>
          <label className="doctor-control relative flex items-center rounded-full border border-[#15362f]/15 bg-white px-4 py-2 text-xs font-semibold">
            <span className="sr-only">Select doctor</span>
            <select
              aria-label="Select doctor"
              value={doctorName}
              disabled={doctorSelectionLocked}
              onChange={(event) =>
                onDoctorChange?.(event.target.value as ClinicDoctorName)
              }
              className="min-w-0 max-w-full appearance-none bg-transparent pr-5 outline-none disabled:cursor-default"
            >
              {doctors.map((doctor) => (
                <option key={doctor}>{doctor}</option>
              ))}
            </select>
            <CaretDown
              className="pointer-events-none absolute right-3"
              size={13}
            />
          </label>
        </div>
        <div className="flex gap-2 overflow-x-auto px-5 pb-3 md:hidden">
          {routes.map((route) => (
            <Link
              key={route.key}
              href={route.href}
              onClick={(event) => {
                event.preventDefault();
                navigateTo(route.href);
              }}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold ${active === route.key ? "bg-[#15362f] text-white" : "bg-white"}`}
            >
              {route.label}
            </Link>
          ))}
        </div>
      </nav>
      {children}
    </main>
  );
}

function DraftSaveBar({
  state,
  savedAt,
  patientName,
  visitType,
  onSave,
  onReview,
}: {
  state: DraftSaveState;
  savedAt: string | null;
  patientName: string;
  visitType: Consultation["visitType"];
  onSave: () => Promise<void>;
  onReview: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const savedTime = savedAt
    ? new Intl.DateTimeFormat("en-IN", {
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(savedAt))
    : null;
  const statusCopy = {
    loading: "Checking for a saved draft…",
    saved: savedTime ? `Saved at ${savedTime}` : "Saved · Ready to edit",
    unsaved: "Unsaved changes · Autosave is waiting for a pause",
    saving: "Saving draft…",
    failed: "Draft save failed. Your changes are still here.",
  }[state];
  const isFailed = state === "failed";
  return (
    <section
      aria-label="Current consultation"
      className={`mb-7 grid gap-4 rounded-2xl px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${isFailed ? "border border-red-800/20 bg-red-50" : "bg-[#ece7dc]"}`}
    >
      <div className="min-w-0">
        <p className="field-label mb-1">Current consultation</p>
        <p className="truncate text-base font-bold">
          {patientName.trim() || "Patient not named"}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-sm text-[#435c54]">
            {getVisitTypeLabel(visitType)}
          </p>
          <div className="flex min-w-0 items-center gap-1.5">
            {isFailed ? (
              <WarningCircle
                size={16}
                weight="fill"
                className="shrink-0 text-red-800"
              />
            ) : (
              <Check size={15} weight="bold" className="shrink-0" />
            )}
            <p
              role={isFailed ? "alert" : "status"}
              aria-live={isFailed ? "assertive" : "polite"}
              aria-atomic="true"
              className={`text-sm font-semibold ${isFailed ? "text-red-900" : "text-[#435c54]"}`}
            >
              {statusCopy}
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={
            state === "loading" || state === "saving" || state === "saved"
          }
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-[#15362f] shadow-sm transition hover:bg-[#fbfaf5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d85f39] disabled:cursor-default disabled:opacity-55"
        >
          <FloppyDisk size={16} weight="bold" />
          {isFailed ? "Retry save" : "Save draft"}
        </button>
        <button
          type="button"
          className="primary-action desktop-review-action min-h-11"
          disabled={state === "loading"}
          onClick={onReview}
        >
          Review prescription
        </button>
      </div>
    </section>
  );
}

function PrescriptionPage() {
  const root = useRef<HTMLDivElement>(null);
  const reviewReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const {
    consultation,
    setConsultation,
    saveState,
    savedAt,
    hasUnconfirmedChanges,
    saveDraft,
    completionState,
    completedSnapshot,
    completePrescription,
    startAnotherConsultation,
    priorVisits,
    priorVisitsState,
    reloadPriorVisits,
  } = useConsultationDraft();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewAttempted, setReviewAttempted] = useState(false);
  const reviewProblems = useMemo(
    () => validateConsultation(consultation),
    [consultation],
  );
  const errorFor = (fieldId: string) =>
    reviewAttempted
      ? reviewProblems.find((problem) => problem.fieldId === fieldId)?.message
      : undefined;
  const openReview = (event: React.MouseEvent<HTMLButtonElement>) => {
    reviewReturnFocusRef.current = event.currentTarget;
    setReviewAttempted(true);
    setReviewOpen(true);
  };
  const closeReview = () => {
    setReviewOpen(false);
    window.requestAnimationFrame(() => reviewReturnFocusRef.current?.focus());
  };
  const focusProblem = (problem: ConsultationProblem) => {
    setReviewOpen(false);
    window.requestAnimationFrame(() => {
      const field = document.getElementById(problem.fieldId);
      field?.scrollIntoView({ block: "center" });
      field?.focus();
    });
  };
  const clinicalEntryBlocked =
    saveState === "loading" ||
    (consultation.visitType === "followup" && !consultation.linkedPriorVisit);
  const [patientSynced, setPatientSynced] = useState(false);
  const updatePatient = (
    field: "name" | "age" | "sex" | "phone",
    value: string,
  ) => {
    // A different name is a different person: typing over a chosen
    // patient's name starts a new patient instead of renaming them.
    if (field === "name") setPatientSynced(false);
    setConsultation((current) => {
      const unlink = field === "name" && current.patient.patientId !== "";
      return {
        ...current,
        linkedPriorVisit: unlink ? null : current.linkedPriorVisit,
        patient: {
          ...current.patient,
          ...(unlink ? { patientId: "", patientNumber: null } : {}),
          [field]: value,
        },
      };
    });
  };
  const updateDateOfBirth = (dateOfBirth: string) => {
    setConsultation((current) => ({
      ...current,
      patient: {
        ...current.patient,
        dateOfBirth,
        age: dateOfBirth
          ? ageOn(dateOfBirth, current.consultationDate) || current.patient.age
          : current.patient.age,
      },
    }));
  };
  const applyPatientRecord = (record: PatientRecord) => {
    setPatientSynced(true);
    setConsultation((current) => ({
      ...current,
      // Never keep an earlier prescription that belongs to someone else.
      linkedPriorVisit:
        current.linkedPriorVisit?.patientId === record.id
          ? current.linkedPriorVisit
          : null,
      patient: {
        patientId: record.id,
        patientNumber: record.number,
        name: record.name,
        // An estimated birth date only stands in for a remembered age.
        dateOfBirth: record.dateOfBirthEstimated ? "" : record.dateOfBirth,
        age:
          ageOn(record.dateOfBirth, current.consultationDate) || record.age,
        sex: record.sex,
        phone: record.phone,
      },
    }));
  };
  const updateVital = (field: keyof Consultation["vitals"], value: string) => {
    setConsultation((current) => ({
      ...current,
      vitals: { ...current.vitals, [field]: value },
    }));
  };
  const selectMedicines = (names: string[]) => {
    setConsultation((current) => ({
      ...current,
      medicines: names.map(
        (name) =>
          current.medicines.find((medicine) => medicine.name === name) ?? {
            name,
            dose: "",
            duration: "",
            method: "",
          },
      ),
    }));
  };
  const updateMedicine = (
    name: string,
    field: keyof Omit<PrescribedMedicine, "name">,
    value: string,
  ) => {
    setConsultation((current) => ({
      ...current,
      medicines: current.medicines.map((medicine) =>
        medicine.name === name ? { ...medicine, [field]: value } : medicine,
      ),
    }));
  };
  useGSAP(
    () => {
      if (completedSnapshot) return;
      const motionPreference = gsap.matchMedia();
      motionPreference.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          ".document-preview",
          { scale: 0.9 },
          {
            scale: 1,
            scrollTrigger: {
              trigger: ".workspace-grid",
              start: "top 74%",
              end: "top 25%",
              scrub: true,
             },
           },
         );
      });
      return () => motionPreference.revert();
    },
    { dependencies: [completedSnapshot] },
  );
  if (completedSnapshot) {
    return (
      <Shell
        active="prescription"
        doctorName={completedSnapshot.doctor.name}
        doctorSelectionLocked
      >
        <CompletedPrescriptionView
          snapshot={completedSnapshot}
          onStartAnother={async () => {
            await startAnotherConsultation();
            setReviewOpen(false);
            setReviewAttempted(false);
            window.requestAnimationFrame(() =>
              document.getElementById("prescription-type-new")?.focus(),
            );
          }}
        />
      </Shell>
    );
  }
  return (
    <Shell
      active="prescription"
      doctorName={consultation.doctorName}
      shouldWarnBeforeLeaving={hasUnconfirmedChanges}
      onDoctorChange={(doctorName) =>
        setConsultation((current) => ({ ...current, doctorName }))
      }
    >
      <div ref={root}>
        <header className="mx-auto grid max-w-[1500px] gap-8 px-5 pb-14 pt-14 lg:grid-cols-[1.1fr_.9fr] lg:px-10 lg:pb-20 lg:pt-20">
          <div>
            <p className="eyebrow">
              {consultation.visitType === "followup"
                ? consultation.linkedPriorVisit
                  ? "Follow-up consultation · prior visit linked"
                  : "Follow-up consultation · prior visit required"
                : consultation.visitType === "new"
                  ? "New consultation · no prior visit linked"
                  : "Choose a prescription type to begin"}
            </p>
            <h1 className="max-w-6xl text-[clamp(2.8rem,5vw,5.5rem)] font-medium leading-[.94] tracking-[-.055em]">
              Write the prescription. See the paper take shape.
            </h1>
          </div>
          <div className="flex items-end">
            <p className="max-w-xl text-lg leading-relaxed text-[#536760]">
              The digital form follows the clinic’s printed sheet, while
              searchable clinical catalogs make repeated work faster.
            </p>
          </div>
        </header>
        <section className="workspace-grid mx-auto grid-flow-dense grid max-w-[1500px] grid-cols-12 items-start gap-5 px-5 pb-40 lg:px-10">
          <section
            aria-label="Consultation form"
            className="col-span-12 rounded-[30px] border border-[#15362f]/10 bg-[#fbfaf5] p-6 shadow-[0_24px_70px_rgba(21,54,47,.08)] lg:col-span-7 lg:p-9"
          >
            <DraftSaveBar
              state={saveState}
              savedAt={savedAt}
              patientName={consultation.patient.name}
              visitType={consultation.visitType}
              onSave={saveDraft}
              onReview={openReview}
            />
            <fieldset
              role="radiogroup"
              aria-labelledby="prescription-type-label"
              aria-invalid={Boolean(errorFor("prescription-type-new"))}
              aria-describedby={
                errorFor("prescription-type-new")
                  ? "prescription-type-error"
                  : undefined
              }
              disabled={saveState === "loading"}
              aria-busy={saveState === "loading"}
              className="mb-8 min-w-0 rounded-[24px] border border-[#b85a36]/25 bg-[#fff7f0] p-5 disabled:opacity-70"
            >
              <legend
                id="prescription-type-label"
                className="px-2 text-xs font-extrabold uppercase tracking-[.12em] text-[#9b492f]"
              >
                Prescription type
              </legend>
              <p className="text-base font-bold">
                Is this a new prescription or a follow-up?
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  [
                    "new",
                    "New prescription",
                    "Start without a prior visit link",
                  ],
                  [
                    "followup",
                    "Follow-up prescription",
                    "Continues an earlier prescription for a saved patient",
                  ],
                ].map(([key, title, copy]) => {
                  const selected = consultation.visitType === key;
                  return (
                    <label key={key} className="relative block">
                      <input
                        id={`prescription-type-${key}`}
                        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                        type="radio"
                        name="prescription-type"
                        value={key}
                        checked={selected}
                        onChange={() =>
                          setConsultation((current) => ({
                            ...current,
                            visitType: key as "new" | "followup",
                            linkedPriorVisit:
                              key === "new" ? null : current.linkedPriorVisit,
                          }))
                        }
                      />
                      <span
                        className={`block min-h-24 rounded-2xl border p-4 text-left transition peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#d85f39] ${selected ? "border-[#15362f] bg-[#15362f] text-white" : "border-[#15362f]/15 bg-white hover:border-[#15362f]/45"}`}
                      >
                        <span className="flex items-center justify-between text-sm font-bold">
                          {title}
                          {selected && <Check size={16} weight="bold" />}
                        </span>
                        <span
                          className={`mt-1 block text-xs ${selected ? "text-white/75" : "text-[#536760]"}`}
                        >
                          {copy}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {errorFor("prescription-type-new") && (
                <FieldError id="prescription-type-error">
                  {errorFor("prescription-type-new")!}
                </FieldError>
              )}
            </fieldset>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <label htmlFor="patient-name" className="field-label">
                    Patient name
                  </label>
                  <span
                    id="patient-number"
                    className="text-xs font-bold text-[#435c54] tabular-nums"
                  >
                    {consultation.patient.patientNumber !== null
                      ? `Patient no. ${consultation.patient.patientNumber}`
                      : "New patient: numbered on completion"}
                  </span>
                </div>
                <PatientNameSearch
                  id="patient-name"
                  value={consultation.patient.name}
                  disabled={saveState === "loading"}
                  invalid={Boolean(errorFor("patient-name"))}
                  describedBy={
                    errorFor("patient-name")
                      ? "patient-name-error"
                      : undefined
                  }
                  onNameChange={(name) => updatePatient("name", name)}
                  onPatientSelected={applyPatientRecord}
                />
                {patientSynced && !errorFor("patient-name") && (
                  <p className="patient-sync-note">
                    <Check size={13} weight="bold" />
                    Saved patient
                  </p>
                )}
                {errorFor("patient-name") && (
                  <FieldError id="patient-name-error">
                    {errorFor("patient-name")!}
                  </FieldError>
                )}
              </div>
            </div>
            <div className="mt-5 grid gap-5 sm:grid-cols-[.6fr_1fr_1fr]">
              <label>
                <span className="field-label">Date of birth</span>
                <input
                  id="patient-date-of-birth"
                  aria-label="Date of birth"
                  className="input-field tabular-nums"
                  type="date"
                  value={consultation.patient.dateOfBirth}
                  max={consultation.consultationDate || undefined}
                  aria-invalid={Boolean(errorFor("patient-date-of-birth"))}
                  aria-describedby={
                    errorFor("patient-date-of-birth")
                      ? "patient-date-of-birth-error"
                      : undefined
                  }
                  onChange={(event) => updateDateOfBirth(event.target.value)}
                />
                {errorFor("patient-date-of-birth") && (
                  <FieldError id="patient-date-of-birth-error">
                    {errorFor("patient-date-of-birth")!}
                  </FieldError>
                )}
              </label>
              <label>
                <span className="field-label">Phone</span>
                <input
                  id="patient-phone"
                  aria-label="Phone"
                  className="input-field tabular-nums"
                  type="tel"
                  inputMode="tel"
                  value={consultation.patient.phone}
                  onChange={(event) => updatePatient("phone", event.target.value)}
                />
              </label>
            </div>
            <div className="mt-5 grid gap-5 sm:grid-cols-[.6fr_1fr_1.2fr]">
              <label>
                <span className="field-label">Age</span>
                <input
                  id="patient-age"
                  aria-label="Age"
                  className="input-field"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={consultation.patient.age}
                  readOnly={Boolean(consultation.patient.dateOfBirth)}
                  aria-invalid={Boolean(errorFor("patient-age"))}
                  aria-describedby={
                    errorFor("patient-age") ? "patient-age-error" : undefined
                  }
                    onChange={(event) =>
                      updatePatient("age", event.target.value)
                    }
                />
                {errorFor("patient-age") && (
                  <FieldError id="patient-age-error">
                    {errorFor("patient-age")!}
                  </FieldError>
                )}
              </label>
              <label>
                <span className="field-label">Gender</span>
                <select
                  id="patient-sex"
                  aria-label="Gender"
                  className="input-field"
                  value={consultation.patient.sex}
                  aria-invalid={Boolean(errorFor("patient-sex"))}
                  aria-describedby={
                    errorFor("patient-sex") ? "patient-sex-error" : undefined
                  }
                  onChange={(event) =>
                    updatePatient("sex", event.target.value as PatientSex)
                  }
                >
                  <option>Female</option>
                  <option>Male</option>
                  <option>Other</option>
                </select>
                {errorFor("patient-sex") && (
                  <FieldError id="patient-sex-error">
                    {errorFor("patient-sex")!}
                  </FieldError>
                )}
              </label>
              <label>
                <span className="field-label">Consultation date</span>
                <input
                  id="consultation-date"
                  aria-label="Consultation date"
                  className="input-field tabular-nums"
                  type="date"
                  value={consultation.consultationDate}
                  aria-invalid={Boolean(errorFor("consultation-date"))}
                  aria-describedby={
                    errorFor("consultation-date")
                      ? "consultation-date-error"
                      : undefined
                  }
                  onChange={(event) =>
                    setConsultation((current) => ({
                      ...current,
                      consultationDate: event.target.value,
                      patient: current.patient.dateOfBirth
                        ? {
                            ...current.patient,
                            age:
                              ageOn(
                                current.patient.dateOfBirth,
                                event.target.value,
                              ) || current.patient.age,
                          }
                        : current.patient,
                    }))
                  }
                />
                {errorFor("consultation-date") && (
                  <FieldError id="consultation-date-error">
                    {errorFor("consultation-date")!}
                  </FieldError>
                )}
              </label>
            </div>
            <div className="mt-8" />
            {consultation.visitType === "followup" && (
              <div className="mb-8 rounded-[24px] border border-[#15362f]/15 bg-[#ece7dc] p-5">
                <label>
                  <span className="field-label">Earlier prescription</span>
                  <select
                    id="prior-visit"
                    className="input-field"
                    value={consultation.linkedPriorVisit?.id ?? ""}
                    aria-describedby={
                      errorFor("prior-visit")
                        ? "prior-visit-error"
                        : !consultation.linkedPriorVisit &&
                            priorVisitsState !== "failed"
                          ? "prior-visit-required"
                          : undefined
                    }
                    aria-invalid={Boolean(errorFor("prior-visit"))}
                    disabled={
                      saveState === "loading" ||
                      priorVisitsState !== "ready" ||
                      !consultation.patient.patientId
                    }
                    onChange={(event) => {
                      const linkedPriorVisit = priorVisits.find(
                        (visit) => visit.id === event.target.value,
                      );
                      setConsultation((current) => ({
                        ...current,
                        linkedPriorVisit: linkedPriorVisit ?? null,
                      }));
                    }}
                  >
                    <option value="">
                      {!consultation.patient.patientId
                        ? "Choose a saved patient first"
                        : priorVisitsState === "loading"
                          ? "Loading earlier prescriptions…"
                          : priorVisits.length
                            ? "Choose an earlier prescription"
                            : "No earlier prescriptions for this patient"}
                    </option>
                    {priorVisits.map((visit) => (
                      <option key={visit.id} value={visit.id}>
                        {visit.patient.name} ·{` `}
                        {formatPriorVisitDate(visit.consultationDate)}
                      </option>
                    ))}
                  </select>
                </label>
                {errorFor("prior-visit") && (
                  <FieldError id="prior-visit-error">
                    {errorFor("prior-visit")!}
                  </FieldError>
                )}
                {priorVisitsState === "failed" && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-red-900">
                    <p role="alert">
                      Earlier prescriptions could not be loaded.
                    </p>
                    <button
                      type="button"
                      className="min-h-11 rounded-full bg-white px-4 py-2 font-bold text-[#15362f] transition hover:bg-[#fbfaf5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d85f39]"
                      onClick={() => {
                        void reloadPriorVisits().then(() =>
                          window.requestAnimationFrame(() =>
                            document.getElementById("prior-visit")?.focus(),
                          ),
                        );
                      }}
                    >
                      Try again
                    </button>
                  </div>
                )}
                {!consultation.linkedPriorVisit &&
                  priorVisitsState !== "failed" &&
                  !errorFor("prior-visit") && (
                    <p
                      id="prior-visit-required"
                      className="mt-3 text-sm font-semibold text-[#9b492f]"
                    >
                      {consultation.patient.patientId
                        ? "Choose the earlier prescription this follow-up continues."
                        : "Search for the patient by name or number, then choose their earlier prescription."}
                    </p>
                  )}
                {consultation.linkedPriorVisit && (
                  <section
                    aria-labelledby="linked-prior-visit-heading"
                    className="mt-4 min-w-0 rounded-2xl bg-white p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2
                          id="linked-prior-visit-heading"
                          className="text-sm font-extrabold"
                        >
                          Linked prior visit
                        </h2>
                        <p className="mt-1 break-words text-base font-bold">
                          {consultation.linkedPriorVisit.patient.name}
                        </p>
                        <p className="mt-1 text-sm text-[#536760]">
                          Age {consultation.linkedPriorVisit.patient.age} ·{` `}
                          {consultation.linkedPriorVisit.patient.sex}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="Remove prior visit link"
                        className="min-h-11 rounded-full bg-[#f0ece3] px-4 py-2 text-sm font-bold text-[#15362f] transition hover:bg-[#e4ded2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d85f39]"
                        onClick={() => {
                          setConsultation((current) => ({
                            ...current,
                            linkedPriorVisit: null,
                          }));
                          window.requestAnimationFrame(() =>
                            document.getElementById("prior-visit")?.focus(),
                          );
                        }}
                      >
                        Remove link
                      </button>
                    </div>
                    <dl className="mt-4 grid min-w-0 gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="field-label">Date</dt>
                        <dd className="font-semibold tabular-nums">
                          {formatPriorVisitDate(
                            consultation.linkedPriorVisit.consultationDate,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="field-label">Doctor</dt>
                        <dd className="font-semibold">
                          {consultation.linkedPriorVisit.doctorName}
                        </dd>
                      </div>
                      <div className="min-w-0 sm:col-span-2">
                        <dt className="field-label">Clinical summary</dt>
                        <dd className="break-words leading-relaxed text-[#435c54]">
                          {consultation.linkedPriorVisit.clinicalSummary}
                        </dd>
                      </div>
                    </dl>
                  </section>
                )}
              </div>
            )}
            <fieldset
              disabled={clinicalEntryBlocked}
              aria-describedby={
                clinicalEntryBlocked && saveState !== "loading"
                  ? "followup-link-required"
                  : undefined
              }
              className="m-0 min-w-0 border-0 p-0 disabled:opacity-55"
            >
              {clinicalEntryBlocked && saveState !== "loading" && (
                <span id="followup-link-required" className="sr-only">
                  Clinical entry is unavailable until an earlier prescription is
                  linked.
                </span>
              )}
            <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <UnitInput
                inputId="weight"
                label="Weight"
                value={consultation.vitals.weight}
                unit="kg"
                onChange={(value) => updateVital("weight", value)}
                error={errorFor("weight")}
              />
              <UnitInput
                inputId="temperature"
                label="Temperature"
                value={consultation.vitals.temperature}
                unit="°F"
                onChange={(value) => updateVital("temperature", value)}
                error={errorFor("temperature")}
              />
              <UnitInput
                inputId="pulse"
                label="Pulse"
                value={consultation.vitals.pulse}
                unit="/min"
                onChange={(value) => updateVital("pulse", value)}
                error={errorFor("pulse")}
              />
              <BloodPressureInput
                systolic={consultation.vitals.systolic}
                diastolic={consultation.vitals.diastolic}
                onSystolicChange={(value) => updateVital("systolic", value)}
                onDiastolicChange={(value) => updateVital("diastolic", value)}
                systolicError={errorFor("systolic-blood-pressure")}
                diastolicError={errorFor("diastolic-blood-pressure")}
              />
              <UnitInput
                inputId="spo2"
                label="SpO₂"
                value={consultation.vitals.spo2}
                unit="%"
                onChange={(value) => updateVital("spo2", value)}
                error={errorFor("spo2")}
              />
            </div>
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              <CatalogPicker
                label="Major complaints"
                inputId="complaints"
                error={errorFor("complaints")}
                catalogName="symptoms"
                groups={symptoms}
                value={consultation.complaints}
                onChange={(complaints) =>
                  setConsultation((current) => ({
                    ...current,
                    complaints: complaints as string[],
                  }))
                }
                multiple
              />
              <CatalogPicker
                label="Examination findings"
                inputId="examination-findings"
                error={errorFor("examination-findings")}
                catalogName="findings"
                groups={findings}
                value={consultation.examinationFindings}
                onChange={(examinationFindings) =>
                  setConsultation((current) => ({
                    ...current,
                    examinationFindings: examinationFindings as string[],
                  }))
                }
                multiple
              />
            </div>
            <div className="mt-7">
              <CatalogPicker
                label="Provisional diagnosis"
                inputId="provisional-diagnosis"
                error={errorFor("provisional-diagnosis")}
                catalogName="diagnoses"
                groups={diagnoses}
                value={consultation.provisionalDiagnosis}
                onChange={(provisionalDiagnosis) =>
                  setConsultation((current) => ({
                    ...current,
                    provisionalDiagnosis: provisionalDiagnosis as string,
                  }))
                }
              />
            </div>
            <div className="mt-7 grid gap-6 sm:grid-cols-2">
              <CatalogPicker
                label="Advice"
                inputId="advice"
                catalogName="advice"
                groups={advice}
                value={consultation.advice}
                onChange={(selectedAdvice) =>
                  setConsultation((current) => ({
                    ...current,
                    advice: selectedAdvice as string[],
                  }))
                }
                multiple
              />
              <CatalogPicker
                label="Investigations"
                inputId="investigations"
                catalogName="investigations"
                groups={investigations}
                value={consultation.investigations}
                onChange={(investigationsValue) =>
                  setConsultation((current) => ({
                    ...current,
                    investigations: investigationsValue as string[],
                  }))
                }
                multiple
              />
            </div>
            <div className="mt-8 border-t border-[#15362f]/10 pt-8">
              <CatalogPicker
                label="Medicines"
                inputId="medicines"
                catalogName="medicines"
                groups={medicines}
                  value={consultation.medicines.map(
                    (medicine) => medicine.name,
                  )}
                onChange={(value) => selectMedicines(value as string[])}
                multiple
              />
              <div className="medicine-list mt-5 space-y-3">
                {consultation.medicines.map((medicine, i) => (
                  <div
                    key={medicine.name}
                    className="medicine-row"
                  >
                    <div className="medicine-identity min-w-0">
                      <b className="text-sm">
                        {i + 1}. {medicine.name}
                      </b>
                      <p className="mt-1 break-words text-xs text-[#536760]">
                        {ingredientByMedicine[medicine.name] ||
                          "Composition from medicine catalog"}
                      </p>
                    </div>
                    <MedicineInstructionSelect
                      id={`medicine-${i}-dose`}
                      label={`${medicine.name} dose`}
                      fieldLabel="Dose"
                      value={medicine.dose}
                      error={errorFor(`medicine-${i}-dose`)}
                      placeholder="Choose dose"
                      options={[
                        "1–0–1",
                        "1–0–0",
                        "0–0–1",
                        "1–1–1",
                        "0–1–0",
                        "As needed",
                      ]}
                      onChange={(value) =>
                        updateMedicine(medicine.name, "dose", value)
                      }
                    />
                    <MedicineInstructionSelect
                      id={`medicine-${i}-duration`}
                      label={`${medicine.name} duration`}
                      fieldLabel="Duration"
                      value={medicine.duration}
                      error={errorFor(`medicine-${i}-duration`)}
                      placeholder="Choose duration"
                      options={[
                        "1 day",
                        "3 days",
                        "5 days",
                        "7 days",
                        "10 days",
                        "14 days",
                        "Until review",
                      ]}
                      onChange={(value) =>
                        updateMedicine(medicine.name, "duration", value)
                      }
                    />
                    <MedicineInstructionSelect
                      id={`medicine-${i}-method`}
                      label={`${medicine.name} method`}
                      fieldLabel="Method"
                      value={medicine.method}
                      error={errorFor(`medicine-${i}-method`)}
                      placeholder="Choose method"
                      options={[
                        "After food",
                        "Before food",
                        "With water",
                        "At bedtime",
                        "As needed",
                        "As directed",
                      ]}
                      onChange={(value) =>
                        updateMedicine(medicine.name, "method", value)
                      }
                    />
                    <button
                      type="button"
                      id={`medicine-${i}-remove`}
                      aria-label={`Remove ${medicine.name}`}
                      onClick={() => {
                        const remaining = consultation.medicines
                          .filter((item) => item.name !== medicine.name)
                          .map((item) => item.name);
                        selectMedicines(remaining);
                        window.requestAnimationFrame(() => {
                          const nextRemove = document.getElementById(
                            `medicine-${Math.min(i, remaining.length - 1)}-remove`,
                          );
                          (nextRemove ?? document.getElementById("medicines"))?.focus();
                        });
                      }}
                      className="medicine-remove grid min-h-11 min-w-11 place-items-center rounded-xl bg-[#f0ece3]"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            </fieldset>
            <p className="mt-8 border-t border-[#15362f]/10 pt-7 text-sm leading-relaxed text-[#60736c]">
              Review every patient, clinical, and medicine detail before the
              prescription is locked.
            </p>
          </section>
          <div className="preview-wrap col-span-12 lg:col-span-5">
            <PrescriptionPreview consultation={consultation} />
          </div>
        </section>
        <aside
          aria-label="Current consultation actions"
          role="region"
          className="mobile-consultation-actions lg:hidden"
        >
          <div className="min-w-0">
            <p className="mobile-patient-name text-sm font-bold">
              {consultation.patient.name.trim() || "Patient not named"}
            </p>
            <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-[#60736c]">
              <span>{getVisitTypeLabel(consultation.visitType)}</span>
              <span aria-hidden="true">·</span>
              <span>
                {{
                  loading: "Checking draft",
                  saved: "Saved",
                  unsaved: "Unsaved",
                  saving: "Saving",
                  failed: "Save failed",
                }[saveState]}
              </span>
            </p>
          </div>
          <button
            type="button"
            aria-label="Review prescription"
            className="primary-action mobile-review-action min-h-11 shrink-0"
            disabled={saveState === "loading"}
            onClick={openReview}
          >
            <span className="mobile-review-label-short">Review</span>
            <span className="mobile-review-label-long">Review prescription</span>
          </button>
        </aside>
        {reviewOpen && (
          <PrescriptionReviewDialog
            consultation={consultation}
            problems={reviewProblems}
            completionState={completionState}
            onClose={closeReview}
            onFixProblem={focusProblem}
            onComplete={() => void completePrescription()}
          />
        )}
      </div>
    </Shell>
  );
}

function PrescriptionPreview({ consultation }: { consultation: Consultation }) {
  const pages = createDraftPrescriptionPages(consultation);
  return (
    <div className="rounded-[30px] bg-[#123930] p-5 text-white shadow-[0_30px_80px_rgba(21,54,47,.2)]">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[.18em] text-white/70">
          Draft prescription
        </span>
        <span className="text-xs font-semibold text-white/70">
          Review before completion
        </span>
      </div>
      <PrescriptionDocument
        pages={pages}
        ariaLabel="Draft prescription preview"
      />
    </div>
  );
}

function createDraftPrescriptionPages(consultation: Consultation) {
  return createPrescriptionDocumentPages({
    clinic: clinicIdentity,
    doctor: clinicDoctors[consultation.doctorName],
    patient: consultation.patient,
    consultationDate: formatConsultationDate(consultation.consultationDate),
    vitals: consultation.vitals,
    complaints: consultation.complaints,
    examinationFindings: consultation.examinationFindings,
    provisionalDiagnosis: consultation.provisionalDiagnosis,
    advice: consultation.advice,
    investigations: consultation.investigations,
    medicines: consultation.medicines.map((medicine) => ({
      ...medicine,
      composition: resolveMedicineComposition(medicine.name),
    })),
    footer: prescriptionFooter,
  });
}

function prescriptionPageStyle({ text }: PrescriptionDocumentPage) {
  return {
    "--rx-margin": `${prescriptionTypography.pageMargin}pt`,
    "--rx-font-size": `${text.fontSize}pt`,
    "--rx-line-height": `${text.lineHeight}pt`,
    "--rx-title-size": `${prescriptionTypography.titleSize}pt`,
    "--rx-registration-size": `${text.registrationSize}pt`,
    "--rx-rule": `${prescriptionTypography.ruleThickness}pt`,
    "--rx-gap": `${text.ruleGap}pt`,
  } as CSSProperties;
}

function PrescriptionDocument({
  pages,
  ariaLabel,
}: {
  pages: readonly PrescriptionDocumentPage[];
  ariaLabel: string;
}) {
  useEffect(() => {
    const addFontFace = async (
      id: string,
      load: () => Promise<{ fontFace: string }>,
    ) => {
      if (document.getElementById(id)) return;
      const { fontFace } = await load();
      if (document.getElementById(id)) return;
      const style = document.createElement("style");
      style.id = id;
      style.textContent = fontFace;
      document.head.appendChild(style);
    };
    void addFontFace("prescription-text-font-face", async () => ({
      fontFace: prescriptionTextFontFace,
    }));
    const pageText = JSON.stringify(pages);
    if (/[\u0900-\u097f]/u.test(pageText)) {
      void addFontFace("prescription-devanagari-font-face", () =>
        import("./prescription-devanagari-font").then(
          ({ prescriptionDevanagariFontFace }) => ({
            fontFace: prescriptionDevanagariFontFace,
          }),
        ),
      );
    }
    if (/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(pageText)) {
      void addFontFace("prescription-cjk-font-face", () =>
        import("./prescription-cjk-font").then(
          ({ prescriptionCjkFontFace }) => ({
            fontFace: prescriptionCjkFontFace,
          }),
        ),
      );
    }
  }, [pages]);

  return (
    <div className="prescription-pages">
      {pages.map((page) => (
        <div className="prescription-page-frame" key={page.number}>
          <div className="prescription-page-scale">
            <article
              aria-label={ariaLabel}
              data-page-number={page.number}
              data-page-count={page.count}
              style={prescriptionPageStyle(page)}
              className="document-preview prescription-page shadow-2xl"
            >
              <header className="rx-letterhead">
                <h2 className="rx-title">{page.clinic.name}</h2>
                <div className="rx-doctor rx-block">
                  <div>
                    <b>{page.doctor.name}</b>
                    <p>
                      {page.doctor.qualifications} ·{" "}
                      <span className="rx-registration">
                        {page.doctor.registration}
                      </span>
                    </p>
                    {page.doctor.mobile && (
                      <p>
                        <b>Mobile: {page.doctor.mobile}</b>
                      </p>
                    )}
                    {page.doctor.specialty && <p>{page.doctor.specialty}</p>}
                  </div>
                  <Pulse size={24} weight="duotone" aria-hidden="true" />
                </div>
                <div className="rx-clinic rx-block">
                  <p>{page.clinic.address}</p>
                  <p>{page.clinic.hours}</p>
                  <p>{page.clinic.services}</p>
                </div>
              </header>
              <div className="rx-patient rx-block">
                <p>
                  Name: <b>{page.patient.name || "—"}</b>
                </p>
                <p className="rx-patient-row">
                  <span>{formatPrescriptionPatientLine(page.patient)}</span>
                  <span>Date: {page.consultationDate}</span>
                </p>
                <p>{formatPrescriptionVitals(page.vitals).join(" · ")}</p>
              </div>
              {page.clinical.length > 0 && (
                <div className="prescription-clinical rx-block">
                  {page.clinical.map((chunk) => (
                    <section
                      key={`${chunk.key}-${chunk.continued}`}
                      className="rx-section"
                    >
                      {chunk.continued && (
                        <b className="block">{chunk.label} (continued):</b>
                      )}
                      {chunk.lines.map((line, index) => (
                        <span key={`${line.text}-${index}`} className="block">
                          {index === 0 && !chunk.continued && (
                            <b>{chunk.label}: </b>
                          )}
                          {line.text}{" "}
                        </span>
                      ))}
                    </section>
                  ))}
                </div>
              )}
              {(page.leftColumn.length > 0 || page.medicines.length > 0) && (
                <div className="prescription-columns">
                  <aside className="rx-left-column">
                    {page.leftColumn.map((section) => (
                      <section
                        key={section.key}
                        className="prescription-list-section rx-section"
                      >
                        <b>{section.title}</b>
                        <ul>
                          {section.chunks.map((chunk) => (
                            <li key={chunk.key}>
                              {chunk.lines.map((line, index) => (
                                <span
                                  key={`${line.text}-${index}`}
                                  className="block"
                                >
                                  {line.text}{" "}
                                </span>
                              ))}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </aside>
                  <section className="rx-medicine-column">
                    {page.medicines.length > 0 && (
                      <div className="rx-medicine-heading">
                        <Image
                          src="/icons/prescription-fill.svg"
                          alt="Prescription"
                          width={34}
                          height={34}
                          className="rx-logo"
                        />
                        <span>Read the instructions carefully</span>
                      </div>
                    )}
                    <div className="prescription-medicines">
                      {page.medicines.map((medicine) => (
                        <div key={medicine.key} className="rx-section">
                          {medicine.continued && (
                            <b className="block">
                              {medicine.medicineNumber}. Medicine continued
                            </b>
                          )}
                          {medicine.lines.map((line, index) => (
                            <span
                              key={`${line.text}-${index}`}
                              className={`block ${line.tone === "strong" ? "font-bold" : line.tone === "muted" ? "rx-muted" : ""}`}
                            >
                              {line.text}{" "}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}
              <footer className="rx-footer">
                {page.footer.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                <p className="prescription-page-number">
                  Page {page.number} of {page.count}
                </p>
              </footer>
            </article>
          </div>
        </div>
      ))}
    </div>
  );
}
function PrescriptionReviewDocument({
  consultation,
}: {
  consultation: Consultation;
}) {
  const pages = createDraftPrescriptionPages(consultation);

  return (
    <div className="w-full min-w-0">
      <p className="mb-3 text-center text-xs font-bold text-[#435c54]">
        {pages.length} A5 {pages.length === 1 ? "page" : "pages"}
      </p>
      <PrescriptionDocument
        pages={pages}
        ariaLabel="Prescription under review"
      />
    </div>
  );
}
function PrescriptionReviewDialog({
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
      className="review-dialog m-auto bg-[#f4f1e9] p-0 text-[#15362f] shadow-[0_28px_90px_rgba(21,54,47,.3)] backdrop:bg-[#102c27]/70"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[#15362f]/10 bg-[#f4f1e9] px-5 py-4 sm:px-7">
        <div>
          <h2 id="review-prescription-heading" className="text-2xl font-bold">
            Review prescription
          </h2>
          <p className="mt-1 text-sm text-[#536760]">
            Check the final paper before locking this prescription.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close prescription review"
          disabled={isCompleting}
          onClick={onClose}
          className="grid min-h-11 min-w-11 place-items-center rounded-xl bg-white transition hover:bg-[#ece7dc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d85f39] disabled:opacity-50"
        >
          <X size={18} />
        </button>
      </div>
      <div className="review-dialog-body grid min-w-0 gap-6 p-5 lg:grid-cols-[minmax(0,.72fr)_minmax(0,1.28fr)] lg:p-7">
        <section aria-labelledby="review-check-heading" className="min-w-0">
          <h3 id="review-check-heading" className="text-lg font-bold">
            Completion check
          </h3>
          {problems.length ? (
            <>
              <p
                role="alert"
                className="mt-2 text-sm leading-relaxed text-[#536760]"
              >
                Fix {problems.length}{" "}
                {problems.length === 1 ? "problem" : "problems"} before
                completion.
              </p>
              <ul className="mt-4 space-y-2">
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
                        className="flex min-h-11 w-full items-start justify-between gap-4 rounded-xl bg-white px-4 py-3 text-left text-sm font-semibold transition hover:bg-[#ece7dc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d85f39]"
                        aria-label={
                          mustLinkPriorVisit
                            ? `Choose the earlier prescription before fixing ${problem.fieldLabel}`
                            : `Fix ${problem.fieldLabel}`
                        }
                      >
                        <span>{problem.message}</span>
                        <span aria-hidden="true">
                          {mustLinkPriorVisit ? "Link visit first" : "Fix"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <div className="mt-4 rounded-2xl bg-[#e4ece7] p-4 text-sm">
              <p className="font-bold">Ready to complete</p>
              <p className="mt-1 leading-relaxed text-[#435c54]">
                Completion saves the latest revision and locks this document.
              </p>
            </div>
          )}
          {isFailed && (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-900"
            >
              Prescription could not be completed. Your draft is still here.
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              ref={completeButtonRef}
              type="button"
              onClick={onComplete}
              disabled={problems.length > 0 || isCompleting}
              className="primary-action min-h-11 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="min-h-11 rounded-full bg-white px-5 py-2.5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d85f39] disabled:opacity-50"
            >
              Return to editing
            </button>
          </div>
        </section>
        <div className="review-preview-panel min-w-0 rounded-[20px] bg-[#123930] p-3 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-white">
            <p className="text-sm font-bold">Prescription preview</p>
            <div
              className="flex items-center gap-1 rounded-full bg-white/10 p-1"
              aria-label="Prescription zoom controls"
              role="group"
            >
              <button
                type="button"
                className="review-zoom-button"
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
                className="review-zoom-button"
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
                className="review-fit-button"
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
const fieldsOpenBeforeLinking = new Set([
  "prior-visit",
  "prescription-type-new",
  "patient-name",
  "patient-date-of-birth",
  "patient-age",
  "patient-sex",
  "consultation-date",
]);

type PdfOutputState =
  | { status: "preparing" }
  | { status: "ready"; file: File }
  | { status: "failed" };

function CompletedPrescriptionView({
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

function ReceiptPage() {
  const [amount, setAmount] = useState("600");
  const [patientName, setPatientName] = useState("");
  return (
    <Shell active="receipts">
      <RouteHeader
        eyebrow="Consultation payment"
        title="Receipt, without rewriting the visit."
        copy="Patient, doctor, clinic identity, date, and receipt number are carried forward automatically."
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
            <label>
              <span className="field-label">Receipt number</span>
              <input
                className="input-field"
                defaultValue="VC-R-0862"
                readOnly
              />
            </label>
            <label>
              <span className="field-label">Consultation amount</span>
              <input
                className="input-field"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <button className="primary-action">
              <Receipt size={18} /> Generate and print receipt
            </button>
          </>
        }
        preview={
          <A5Document title="RECEIPT">
            <p className="mt-12 text-center text-sm leading-9">
              Received with thanks a sum of rupees <b>₹{amount || "0"}</b> from{" "}
              <b>Ms. {patientName || "—"}</b> for consultation charges today.
            </p>
            <div className="mt-20 flex justify-between border-t pt-4 text-xs">
              <span>Receipt VC-R-0862</span>
              <span>Dr. Makarand V. Apte</span>
            </div>
          </A5Document>
        }
      />
    </Shell>
  );
}

function CertificatePage() {
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

function SummaryPage() {
  return (
    <Shell active="summaries">
      <RouteHeader
        eyebrow="August 2026"
        title="The clinic, clearly summarized."
        copy="Monthly counts connect visits, documents, follow-ups, and consultation receipts without exposing patient details."
      />
      <section className="mx-auto grid-flow-dense grid max-w-[1500px] grid-cols-12 gap-4 px-5 pb-40 lg:px-10">
        {[
          ["184", "Patients seen", "+12%"],
          ["₹1.08L", "Consultation receipts", "+8%"],
          ["176", "Prescriptions issued", "+10%"],
          ["31", "Follow-up visits", "+6%"],
        ].map(([n, l, d]) => (
          <article
            key={l}
            className="group col-span-12 overflow-hidden rounded-[28px] border border-[#15362f]/10 bg-white p-7 transition-transform duration-700 ease-out hover:-translate-y-2 sm:col-span-6 lg:col-span-3"
          >
            <ChartLineUp size={25} />
            <p className="mt-10 text-5xl font-semibold tracking-[-.05em]">
              {n}
            </p>
            <p className="mt-2 text-sm text-[#61736d]">{l}</p>
            <span className="mt-5 inline-block text-xs font-bold text-[#d85f39]">
              {d} from July
            </span>
          </article>
        ))}
        <article className="col-span-12 rounded-[30px] bg-[#15362f] p-8 text-white lg:p-10">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-[.18em] text-white/55">
                Daily consultations
              </p>
              <h2 className="mt-2 text-3xl font-medium">Patient volume</h2>
            </div>
            <button className="rounded-full bg-white px-5 py-2.5 text-xs font-bold text-[#15362f]">
              Export summary
            </button>
          </div>
          <div className="mt-12 flex h-56 items-end gap-2">
            {[
              38, 55, 42, 68, 72, 48, 85, 66, 92, 76, 63, 88, 71, 94, 84, 69,
              78, 96,
            ].map((h, i) => (
              <span
                key={i}
                className="flex-1 rounded-t-md bg-[#d85f39] transition-all duration-700 hover:bg-white"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </article>
      </section>
    </Shell>
  );
}

function RouteHeader({
  eyebrow,
  title,
  copy,
}: {
  eyebrow: string;
  title: string;
  copy: string;
}) {
  return (
    <header className="mx-auto grid max-w-[1500px] gap-8 px-5 pb-14 pt-16 lg:grid-cols-[1.1fr_.9fr] lg:px-10 lg:pb-20 lg:pt-24">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="max-w-6xl text-[clamp(2.8rem,5vw,5.5rem)] font-medium leading-[.94] tracking-[-.055em]">
          {title}
        </h1>
      </div>
      <p className="self-end max-w-xl text-lg leading-relaxed text-[#536760]">
        {copy}
      </p>
    </header>
  );
}
function RouteWorkspace({
  form,
  preview,
}: {
  form: React.ReactNode;
  preview: React.ReactNode;
}) {
  return (
    <section className="mx-auto grid-flow-dense grid max-w-[1500px] grid-cols-12 items-start gap-5 px-5 pb-40 lg:px-10">
      <div className="col-span-12 space-y-6 rounded-[30px] border border-[#15362f]/10 bg-[#fbfaf5] p-7 lg:col-span-7 lg:p-10">
        {form}
      </div>
      <div className="col-span-12 rounded-[30px] bg-[#15362f] p-5 lg:col-span-5">
        <div className="mb-4 flex justify-between text-white">
          <span className="text-xs uppercase tracking-[.18em] text-white/60">
            Live A5 preview
          </span>
          <Printer />
        </div>
        {preview}
      </div>
    </section>
  );
}
function A5Document({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto aspect-[148/210] h-auto w-full max-w-[470px] overflow-visible bg-[#fffef9] p-8 text-[#202c29] shadow-2xl">
      <header className="text-center">
        <h2 className="text-2xl font-black tracking-[.04em]">VISHWAS CLINIC</h2>
        <p className="mt-1 text-[9px]">
          Shop No. 6, Amrapali Apartments, Kothrud, Pune
        </p>
        <p className="text-[9px]">
          Dr Makarand Vishwas Apte · MBBS, MD · Reg. No. 87352
        </p>
      </header>
      <h3 className="mt-10 border-y py-3 text-center text-sm font-black tracking-[.18em]">
        {title}
      </h3>
      {children}
    </article>
  );
}

type ImportState = "idle" | "importing" | "done" | "failed";
type DirectoryState = "loading" | "ready" | "failed";

function PatientImportCard({ onImported }: { onImported: () => void }) {
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

function PatientDirectoryCard({ reloadKey }: { reloadKey: number }) {
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

function PatientsPage() {
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

function BackupsPage() {
  return (
    <Shell active="backups">
      <RouteHeader
        eyebrow="Backups"
        title="Every record, kept twice."
        copy="This computer keeps its own copies automatically. Plug in a USB drive to keep a locked copy somewhere else."
      />
      <BackupsPanel />
    </Shell>
  );
}

export default function ClinicApp({ route }: { route: RouteName }) {
  if (route === "backups") return <BackupsPage />;
  if (route === "receipts") return <ReceiptPage />;
  if (route === "patients") return <PatientsPage />;
  if (route === "certificate") return <CertificatePage />;
  if (route === "summaries") return <SummaryPage />;
  return <PrescriptionPage />;
}
