"use client";

import {
  CaretDown,
  Check,
  MagnifyingGlass,
  Plus,
  X,
} from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { type CatalogGroup } from "../clinic-data";

import { FieldError } from "./fields";

// What one entry in each catalog is called, for the add-a-new-term prompts.
const termNoun = {
  symptoms: "complaint",
  findings: "finding",
  diagnoses: "diagnosis",
  medicines: "medicine",
  advice: "advice",
  investigations: "investigation",
} as const;

export function CatalogPicker({
  label,
  catalogName,
  groups,
  value,
  onChange,
  multiple = false,
  showSelection = true,
  hideLabel = false,
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
  showSelection?: boolean;
  // For a picker whose section heading already names it.
  hideLabel?: boolean;
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
      <span className={hideLabel ? "sr-only" : "field-label"} id={labelId}>
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
        <span className={values.length ? "" : "picker-placeholder"}>
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
      {multiple && showSelection && values.length > 0 && (
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
                  className="btn btn-secondary"
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
                className="picker-add"
              >
                <Plus size={15} weight="bold" /> Add “{query.trim()}” as a new{" "}
                {termNoun[catalogName]}
              </button>
            )}
            {adding && (
              <div className="picker-add-form">
                <label className="field-label">
                  Category for “{query.trim()}”
                  <select
                    value={selectedGroup}
                    onChange={(event) => setSelectedGroup(event.target.value)}
                    className="input-field"
                    aria-label={`Category for new ${label} term`}
                    aria-describedby={
                      saveState === "error" ? customErrorId : undefined
                    }
                  >
                    {mergedGroups.map((group) => (
                      <option key={group.group}>{group.group}</option>
                    ))}
                  </select>
                </label>
                <input
                  value={newGroup}
                  onChange={(event) => setNewGroup(event.target.value)}
                  placeholder="Or create a new category"
                  className="input-field"
                  aria-label={`New category for ${label}`}
                  aria-describedby={
                    saveState === "error" ? customErrorId : undefined
                  }
                />
                {saveState === "error" && (
                  <p
                    className="field-error"
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
                    className="btn btn-primary"
                    aria-label={`Save ${query.trim()} to ${label} catalog`}
                  >
                    {saveState === "saving"
                      ? `Saving new ${termNoun[catalogName]}…`
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
                    className="btn btn-quiet"
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
