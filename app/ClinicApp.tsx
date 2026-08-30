"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  CaretDown,
  ChartLineUp,
  Check,
  MagnifyingGlass,
  Plus,
  Printer,
  Pulse,
  Receipt,
  SealCheck,
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

gsap.registerPlugin(ScrollTrigger);
export type RouteName =
  "prescription" | "receipts" | "certificate" | "summaries";

const routes: { href: string; label: string; key: RouteName }[] = [
  { href: "/", label: "Prescription", key: "prescription" },
  { href: "/receipts", label: "Receipts", key: "receipts" },
  {
    href: "/medical-certificate",
    label: "Medical certificate",
    key: "certificate",
  },
  { href: "/summaries", label: "Summaries", key: "summaries" },
];

function CatalogPicker({
  label,
  catalogName,
  groups,
  value,
  onChange,
  multiple = false,
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
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(groups[0]?.group ?? "");
  const [savedGroups, setSavedGroups] = useState<CatalogGroup[]>([]);
  const [adding, setAdding] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(groups[0]?.group ?? "");
  const [newGroup, setNewGroup] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">(
    "idle",
  );
  const values = Array.isArray(value) ? value : value ? [value] : [];
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        setAdding(false);
        setQuery("");
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);
  useEffect(() => {
    let active = true;
    fetch(`/api/catalog?catalog=${catalogName}`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
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
        },
      )
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [catalogName]);
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
  const select = (item: string) => {
    if (multiple)
      onChange(
        values.includes(item)
          ? values.filter((v) => v !== item)
          : [...values, item],
      );
    else {
      onChange(item);
      setOpen(false);
    }
  };
  const saveCustomItem = async () => {
    const itemName = query.trim();
    const groupName = newGroup.trim() || selectedGroup;
    if (!itemName || !groupName) return;
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
    } catch {
      setSaveState("error");
    }
  };
  return (
    <div className="relative">
      <span className="field-label">{label}</span>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="picker-trigger"
      >
        <span className={values.length ? "" : "text-[#7b8b85]"}>
          {multiple
            ? values.length
              ? `${values.length} selected`
              : "Choose one or more"
            : values[0] || "Choose an item"}
        </span>
        <CaretDown size={15} />
      </button>
      {multiple && values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {values.map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => select(item)}
              className="selected-chip"
            >
              {item}
              <X size={11} />
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="picker-panel">
          <div className="flex items-center gap-2 border-b border-[#15362f]/10 px-3 py-2">
            <MagnifyingGlass size={15} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}`}
              className="w-full bg-transparent py-1 text-sm outline-none"
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            {filtered.map((group) => (
              <div key={group.group} className="mb-1">
                <button
                  type="button"
                  onClick={() =>
                    setExpanded(expanded === group.group ? "" : group.group)
                  }
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-bold uppercase tracking-[.11em] text-[#60736c] hover:bg-[#ece7dc]"
                >
                  <span>{group.group}</span>
                  <CaretDown
                    className={`transition ${expanded === group.group || query ? "rotate-180" : ""}`}
                    size={13}
                  />
                </button>
                {(expanded === group.group || query) && (
                  <div className="grid gap-1 py-1">
                    {group.items.map((item) => (
                      <button
                        type="button"
                        key={item}
                        onClick={() => select(item)}
                        className="flex items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-[#15362f] hover:text-white"
                      >
                        <span>{item}</span>
                        {values.includes(item) && (
                          <Check size={14} weight="bold" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {query.trim() && !exactMatch && !adding && (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="mt-2 flex w-full items-center gap-2 rounded-xl border border-dashed border-[#b85a36]/50 bg-[#fff7f0] px-3 py-3 text-left text-sm font-semibold text-[#9b492f]"
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
                <p className="mt-1 text-[11px] leading-relaxed text-[#6d7e77]">
                  Custom terms are saved for this clinic and kept distinct from
                  the standard catalog.
                </p>
                <select
                  value={selectedGroup}
                  onChange={(event) => setSelectedGroup(event.target.value)}
                  className="input-field mt-3"
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
                />
                {saveState === "error" && (
                  <p className="mt-2 text-xs text-red-700">
                    Could not save. Please try again.
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={saveCustomItem}
                    disabled={saveState === "saving"}
                    className="rounded-full bg-[#15362f] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {saveState === "saving" ? "Saving…" : "Save to catalog"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdding(false)}
                    className="rounded-full px-3 py-2 text-xs font-bold text-[#60736c]"
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
}: {
  label: string;
  value: string;
  unit: string;
  onChange: (value: string) => void;
  step?: string;
}) {
  return (
    <label>
      <span className="mb-1.5 block text-[10px] uppercase tracking-[.12em] text-[#6d7e77]">
        {label}
      </span>
      <span className="unit-input-wrap">
        <input
          className="small-input unit-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode="decimal"
          step={step}
          aria-label={label}
        />
        <span className="unit-suffix" aria-hidden="true">
          {unit}
        </span>
      </span>
    </label>
  );
}

function BloodPressureInput({
  systolic,
  diastolic,
  onSystolicChange,
  onDiastolicChange,
}: {
  systolic: string;
  diastolic: string;
  onSystolicChange: (value: string) => void;
  onDiastolicChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="mb-1.5 block text-[10px] uppercase tracking-[.12em] text-[#6d7e77]">
        BP
      </span>
      <span className="bp-input-wrap">
        <input
          className="small-input"
          value={systolic}
          onChange={(event) => onSystolicChange(event.target.value)}
          inputMode="numeric"
          aria-label="Systolic blood pressure"
        />
        <span className="bp-divider" aria-hidden="true">
          /
        </span>
        <input
          className="small-input"
          value={diastolic}
          onChange={(event) => onDiastolicChange(event.target.value)}
          inputMode="numeric"
          aria-label="Diastolic blood pressure"
        />
      </span>
      <span className="mt-1 block text-[10px] text-[#7b8b85]">mmHg</span>
    </label>
  );
}

function Shell({
  active,
  children,
}: {
  active: RouteName;
  children: React.ReactNode;
}) {
  return (
    <main className="w-full max-w-full overflow-x-hidden bg-[#f4f1e9] text-[#15362f]">
      <nav className="sticky top-0 z-50 border-b border-[#15362f]/10 bg-[#f4f1e9]/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-5 px-5 py-4 lg:px-10">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#15362f] text-white">
              <Pulse size={20} weight="bold" />
            </span>
            <span>
              <b className="block text-sm">Vishwas Clinic</b>
              <small className="text-[#6d7e77]">Doctor workspace</small>
            </span>
          </Link>
          <div className="hidden items-center rounded-full border border-[#15362f]/10 bg-white/70 p-1 md:flex">
            {routes.map((route) => (
              <Link
                key={route.key}
                href={route.href}
                onClick={(event) => {
                  event.preventDefault();
                  window.location.assign(route.href);
                }}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${active === route.key ? "bg-[#15362f] text-white" : "hover:bg-[#ece7dc]"}`}
              >
                {route.label}
              </Link>
            ))}
          </div>
          <button className="flex items-center gap-2 rounded-full border border-[#15362f]/15 bg-white px-4 py-2 text-xs font-semibold">
            Dr. M. V. Apte <CaretDown size={13} />
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto px-5 pb-3 md:hidden">
          {routes.map((route) => (
            <Link
              key={route.key}
              href={route.href}
              onClick={(event) => {
                event.preventDefault();
                window.location.assign(route.href);
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

function PrescriptionPage() {
  const root = useRef<HTMLDivElement>(null);
  const [patientName, setPatientName] = useState("Ananya Deshmukh");
  const [weight, setWeight] = useState("62");
  const [temperature, setTemperature] = useState("100.2");
  const [pulse, setPulse] = useState("88");
  const [systolic, setSystolic] = useState("118");
  const [diastolic, setDiastolic] = useState("76");
  const [spo2, setSpo2] = useState("98");
  const [complaints, setComplaints] = useState<string[]>([
    "Low-grade fever",
    "Dry cough",
  ]);
  const [exam, setExam] = useState<string[]>(["Throat congestion"]);
  const [diagnosis, setDiagnosis] = useState(
    "Viral upper respiratory tract infection",
  );
  const [selectedAdvice, setAdvice] = useState<string[]>([
    "Warm saline gargles",
    "Maintain hydration",
  ]);
  const [tests, setTests] = useState<string[]>([]);
  const [drugs, setDrugs] = useState<string[]>([
    "Paracetamol 500 mg tablet",
    "Levocetirizine 5 mg tablet",
  ]);
  const [visitType, setVisitType] = useState<"new" | "followup" | null>(null);
  useGSAP(
    () => {
      gsap.fromTo(
        ".document-preview",
        { scale: 0.9, opacity: 0.55 },
        {
          scale: 1,
          opacity: 1,
          scrollTrigger: {
            trigger: ".workspace-grid",
            start: "top 74%",
            end: "top 25%",
            scrub: true,
          },
        },
      );
    },
    { scope: root },
  );
  return (
    <Shell active="prescription">
      <div ref={root}>
        <header className="mx-auto grid max-w-[1500px] gap-8 px-5 pb-14 pt-14 lg:grid-cols-[1.1fr_.9fr] lg:px-10 lg:pb-20 lg:pt-20">
          <div>
            <p className="eyebrow">
              {visitType === "followup"
                ? "Follow-up consultation · VC-1048"
                : visitType === "new"
                  ? "New consultation · VC-1048"
                  : "Consultation type required · VC-1048"}
            </p>
            <h1 className="max-w-6xl text-[clamp(2.8rem,5vw,5.5rem)] font-medium leading-[.94] tracking-[-.055em]">
              Write the prescription. See the paper take shape.
            </h1>
          </div>
          <div className="flex items-end">
            <p className="max-w-xl text-lg leading-relaxed text-[#60736c]">
              The digital form follows the clinic’s printed sheet, while
              searchable clinical catalogs make repeated work faster.
            </p>
          </div>
        </header>
        <section className="workspace-grid mx-auto grid-flow-dense grid max-w-[1500px] grid-cols-12 items-start gap-5 px-5 pb-40 lg:px-10">
          <div className="col-span-12 rounded-[30px] border border-[#15362f]/10 bg-[#fbfaf5] p-6 shadow-[0_24px_70px_rgba(21,54,47,.08)] lg:col-span-7 lg:p-9">
            <fieldset className="mb-8 rounded-[24px] border border-[#b85a36]/25 bg-[#fff7f0] p-5">
              <legend className="px-2 text-xs font-extrabold uppercase tracking-[.12em] text-[#9b492f]">
                Required before prescribing
              </legend>
              <p className="text-base font-bold">
                Is this a new prescription or a follow-up?
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  [
                    "new",
                    "New prescription",
                    "Create a new consultation record",
                  ],
                  [
                    "followup",
                    "Follow-up prescription",
                    "Link this visit to prior clinical history",
                  ],
                ].map(([key, title, copy]) => (
                  <button
                    type="button"
                    key={key}
                    onClick={() => setVisitType(key as "new" | "followup")}
                    className={`rounded-2xl border p-4 text-left transition ${visitType === key ? "border-[#15362f] bg-[#15362f] text-white" : "border-[#15362f]/15 bg-white hover:border-[#15362f]/45"}`}
                  >
                    <span className="flex items-center justify-between text-sm font-bold">
                      {title}{" "}
                      {visitType === key && <Check size={16} weight="bold" />}
                    </span>
                    <span
                      className={`mt-1 block text-xs ${visitType === key ? "text-white/70" : "text-[#6d7e77]"}`}
                    >
                      {copy}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-5 sm:grid-cols-2">
              <label>
                <span className="field-label">Patient</span>
                <input
                  className="input-field"
                  value={patientName}
                  onChange={(event) => setPatientName(event.target.value)}
                />
              </label>
              <label>
                <span className="field-label">Visit type</span>
                <select
                  className="input-field"
                  value={visitType ?? ""}
                  onChange={(event) =>
                    setVisitType(event.target.value as "new" | "followup")
                  }
                  required
                >
                  <option value="" disabled>
                    Select visit type
                  </option>
                  <option value="new">New prescription</option>
                  <option value="followup">Follow-up prescription</option>
                </select>
              </label>
            </div>
            <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <UnitInput
                label="Weight"
                value={weight}
                unit="kg"
                onChange={setWeight}
              />
              <UnitInput
                label="Temperature"
                value={temperature}
                unit="°F"
                onChange={setTemperature}
              />
              <UnitInput
                label="Pulse"
                value={pulse}
                unit="/min"
                onChange={setPulse}
              />
              <BloodPressureInput
                systolic={systolic}
                diastolic={diastolic}
                onSystolicChange={setSystolic}
                onDiastolicChange={setDiastolic}
              />
              <UnitInput
                label="SpO₂"
                value={spo2}
                unit="%"
                onChange={setSpo2}
              />
            </div>
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              <CatalogPicker
                label="Major complaints"
                catalogName="symptoms"
                groups={symptoms}
                value={complaints}
                onChange={(v) => setComplaints(v as string[])}
                multiple
              />
              <CatalogPicker
                label="Examination findings"
                catalogName="findings"
                groups={findings}
                value={exam}
                onChange={(v) => setExam(v as string[])}
                multiple
              />
            </div>
            <div className="mt-7">
              <CatalogPicker
                label="Provisional diagnosis"
                catalogName="diagnoses"
                groups={diagnoses}
                value={diagnosis}
                onChange={(v) => setDiagnosis(v as string)}
              />
            </div>
            <div className="mt-7 grid gap-6 sm:grid-cols-2">
              <CatalogPicker
                label="Advice"
                catalogName="advice"
                groups={advice}
                value={selectedAdvice}
                onChange={(v) => setAdvice(v as string[])}
                multiple
              />
              <CatalogPicker
                label="Investigations"
                catalogName="investigations"
                groups={investigations}
                value={tests}
                onChange={(v) => setTests(v as string[])}
                multiple
              />
            </div>
            <div className="mt-8 border-t border-[#15362f]/10 pt-8">
              <CatalogPicker
                label="Medicines"
                catalogName="medicines"
                groups={medicines}
                value={drugs}
                onChange={(v) => setDrugs(v as string[])}
                multiple
              />
              <div className="mt-5 space-y-3">
                {drugs.map((drug, i) => (
                  <div
                    key={drug}
                    className="grid gap-3 rounded-2xl border border-[#15362f]/10 bg-white p-4 sm:grid-cols-[1fr_110px_100px_auto]"
                  >
                    <div>
                      <b className="text-sm">
                        {i + 1}. {drug}
                      </b>
                      <p className="mt-1 text-[10px] text-[#6d7e77]">
                        {ingredientByMedicine[drug] ||
                          "Composition from medicine catalog"}
                      </p>
                    </div>
                    <div className="select-field min-h-10 py-2 text-xs">
                      1–0–1 <CaretDown size={12} />
                    </div>
                    <div className="select-field min-h-10 py-2 text-xs">
                      5 days <CaretDown size={12} />
                    </div>
                    <button
                      onClick={() =>
                        setDrugs(drugs.filter((item) => item !== drug))
                      }
                      className="grid h-10 w-10 place-items-center rounded-xl bg-[#f0ece3]"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-8 rounded-2xl bg-[#ece7dc] px-4 py-3 text-[11px] leading-relaxed text-[#60736c]">
              <b className="text-[#15362f]">Clinical catalog note:</b> seeded
              terms are organised around ABDM-recognised terminology patterns
              and India-relevant primary-care workflows. Clinic-added terms
              remain local entries and should be reviewed before use as
              standardised clinical data.
            </div>
          </div>
          <div className="preview-wrap col-span-12 lg:col-span-5">
            <PrescriptionPreview
              complaints={complaints}
              diagnosis={diagnosis}
              adviceItems={selectedAdvice}
              tests={tests}
              drugs={drugs}
              patientName={patientName}
              weight={weight}
              temperature={temperature}
              pulse={pulse}
              bloodPressure={`${systolic}/${diastolic}`}
              spo2={spo2}
            />
          </div>
        </section>
      </div>
    </Shell>
  );
}

function PrescriptionPreview({
  complaints,
  diagnosis,
  adviceItems,
  tests,
  drugs,
  patientName,
  weight,
  temperature,
  pulse,
  bloodPressure,
  spo2,
}: {
  complaints: string[];
  diagnosis: string;
  adviceItems: string[];
  tests: string[];
  drugs: string[];
  patientName: string;
  weight: string;
  temperature: string;
  pulse: string;
  bloodPressure: string;
  spo2: string;
}) {
  return (
    <div className="rounded-[30px] bg-[#123930] p-5 text-white shadow-[0_30px_80px_rgba(21,54,47,.2)]">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[.18em] text-white/60">
          A5 prescription preview
        </span>
        <button className="rounded-full bg-white p-2.5 text-[#15362f]">
          <Printer size={16} />
        </button>
      </div>
      <article className="document-preview mx-auto min-h-[667px] w-full max-w-[470px] bg-[#fffef9] p-6 text-[#202c29] shadow-2xl sm:p-8">
        <header className="text-center">
          <h2 className="text-2xl font-black tracking-[.04em]">
            VISHWAS CLINIC
          </h2>
          <div className="mt-2 grid grid-cols-[1fr_auto] items-start border-b-2 border-[#202c29] pb-2 text-left">
            <div>
              <b className="text-[11px]">Dr Makarand Vishwas Apte</b>
              <p className="text-[8px]">MBBS, MD (Anatomy) · Reg. No. 87352</p>
              <b className="text-[9px]">Mobile: 9730034907</b>
            </div>
            <Pulse size={27} weight="duotone" />
          </div>
          <div className="space-y-1 border-b-2 py-2 text-[7px]">
            <p>
              Shop No. 6, Amrapali Apartments, Right Bhusari Colony, Paud Road,
              Kothrud, Pune 411038
            </p>
            <p className="font-bold">
              Associate Panel Consultant: Deenanath Mangeshkar Hospital
            </p>
            <p>
              Time: 6.30 pm to 9.30 pm, Monday to Saturday · Sunday by
              appointment only
            </p>
            <p>
              Emergency Home Visits · ECG · Nebulization · Blood Sugar
              Monitoring
            </p>
          </div>
        </header>
        <div className="mt-3 grid grid-cols-[1.4fr_.6fr_.6fr] text-[8px]">
          <span>
            Name: <b>{patientName || "—"}</b>
          </span>
          <span>Age/Sex: 32/F</span>
          <span>Date: 30/08/26</span>
        </div>
        <div className="mt-3 grid grid-cols-5 text-[8px]">
          <span>Wt: {weight || "—"}</span>
          <span>Temp: {temperature || "—"} °F</span>
          <span>Pulse: {pulse || "—"} /min</span>
          <span>BP: {bloodPressure || "—"}</span>
          <span>SpO₂: {spo2 || "—"}%</span>
        </div>
        <p className="mt-4 text-[8px]">
          <b>Major complaints:</b> {complaints.join(", ")}
        </p>
        <p className="mt-5 border-b pb-2 text-[8px]">
          <b>Provisional diagnosis:</b> {diagnosis}
        </p>
        <div className="grid min-h-[52%] grid-cols-[32%_68%]">
          <aside className="border-r px-1 py-3 text-[7px]">
            <b>Advice</b>
            <ul className="mt-2 list-disc space-y-1 pl-3">
              {adviceItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <b className="mt-5 block">Investigations</b>
            <ul className="mt-2 list-disc space-y-1 pl-3">
              {tests.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </aside>
          <section className="p-3">
            <div className="flex items-start justify-between">
              <span className="font-serif text-3xl italic">Rx</span>
              <span className="text-[6px]">
                Read the instructions carefully
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {drugs.map((drug, i) => (
                <div key={drug} className="text-[8px]">
                  <b>
                    {i + 1}. {drug}
                  </b>
                  <p className="text-[6px] text-[#65716d]">
                    {ingredientByMedicine[drug] ||
                      "Composition from medicine catalog"}
                  </p>
                  <p className="mt-1">1–0–1 · after food · 5 days</p>
                </div>
              ))}
            </div>
          </section>
        </div>
        <footer className="border-t pt-2 text-center text-[6px]">
          <p>No substitutes · Bring the prescription at the next visit</p>
          <p>Prescription is valid for the given person and duration only</p>
        </footer>
      </article>
    </div>
  );
}

function ReceiptPage() {
  const [amount, setAmount] = useState("600");
  const [patientName, setPatientName] = useState("Ananya Deshmukh");
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
              <span>Dr. M. V. Apte</span>
            </div>
          </A5Document>
        }
      />
    </Shell>
  );
}

function CertificatePage() {
  const [patientName, setPatientName] = useState("Ananya Deshmukh");
  const [diagnosis, setDiagnosis] = useState(
    "Viral upper respiratory tract infection",
  );
  const [treatmentDate, setTreatmentDate] = useState("26/08/26");
  const [restDays, setRestDays] = useState("4 days");
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
            <p className="mt-24 text-right text-sm font-bold">Dr. M. V. Apte</p>
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
      <p className="self-end max-w-xl text-lg leading-relaxed text-[#60736c]">
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
    <article className="mx-auto min-h-[667px] w-full max-w-[470px] bg-[#fffef9] p-8 text-[#202c29] shadow-2xl">
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

export default function ClinicApp({ route }: { route: RouteName }) {
  if (route === "receipts") return <ReceiptPage />;
  if (route === "certificate") return <CertificatePage />;
  if (route === "summaries") return <SummaryPage />;
  return <PrescriptionPage />;
}
