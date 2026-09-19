"use client";

export function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <span id={id} className="field-error">
      {children}
    </span>
  );
}

export function UnitInput({
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
      <span className="field-label">{label}</span>
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

export function BloodPressureInput({
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
      <span className="field-label">BP</span>
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
        <span className="unit-suffix" aria-hidden="true">
          mmHg
        </span>
      </span>
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

export function MedicineInstructionSelect({
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
        className="field-label medicine-cell-label"
      >
        {fieldLabel}
      </label>
      <select
        id={id}
        aria-label={label}
        className="input-field"
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
