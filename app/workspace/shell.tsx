"use client";

import { Pulse } from "@phosphor-icons/react";
import Link from "next/link";
import { clinicDoctors } from "../clinic-facts";
import { getClinicPc } from "../clinic-pc";
import { type ClinicDoctorName } from "../consultation-model";

export type RouteName =
  | "prescription"
  | "patients"
  | "receipts"
  | "certificate"
  | "summaries"
  | "backups";

export const allRoutes: {
  href: string;
  label: string;
  key: RouteName;
  clinicPcOnly?: boolean;
}[] = [
  { href: "/", label: "Prescription", key: "prescription" },
  { href: "/patients", label: "Patients", key: "patients" },
  { href: "/receipts", label: "Receipts", key: "receipts", clinicPcOnly: true },
  { href: "/medical-certificate", label: "Certificates", key: "certificate" },
  { href: "/summaries", label: "Summaries", key: "summaries" },
  { href: "/backups", label: "Backups", key: "backups", clinicPcOnly: true },
];

export function Shell({
  active,
  doctorName = "Dr. Makarand Vishwas Apte",
  onDoctorChange,
  doctorSelectionLocked = false,
  shouldWarnBeforeLeaving = false,
  children,
}: {
  active: RouteName;
  doctorName?: ClinicDoctorName;
  // Pages that issue documents choose their Author; the others do not show
  // the choice at all.
  onDoctorChange?: (doctor: ClinicDoctorName) => void;
  doctorSelectionLocked?: boolean;
  shouldWarnBeforeLeaving?: boolean;
  children: React.ReactNode;
}) {
  const doctors = Object.keys(clinicDoctors) as ClinicDoctorName[];
  const isClinicPc = getClinicPc() !== null;
  const routes = allRoutes.filter((route) => isClinicPc || !route.clinicPcOnly);
  const showsAuthor = Boolean(onDoctorChange) || doctorSelectionLocked;
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
    <div className="min-h-dvh overflow-x-hidden">
      <header className="app-bar">
        <div className="app-bar-inner">
          <Link
            href="/"
            className="app-bar-brand"
            onClick={(event) => {
              event.preventDefault();
              navigateTo("/");
            }}
          >
            <Pulse size={18} weight="bold" aria-hidden="true" />
            Vishwas Clinic
          </Link>
          <nav aria-label="Main" className="app-tabs">
            {routes.map((route) => (
              <Link
                key={route.key}
                href={route.href}
                aria-current={active === route.key ? "page" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  navigateTo(route.href);
                }}
                className="app-tab"
              >
                {route.label}
              </Link>
            ))}
          </nav>
          {showsAuthor && (
            <label className="author-select">
              Writing as
              <select
                value={doctorName}
                disabled={doctorSelectionLocked}
                onChange={(event) =>
                  onDoctorChange?.(event.target.value as ClinicDoctorName)
                }
              >
                {doctors.map((doctor) => (
                  <option key={doctor}>{doctor}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

/** A page's single title row, with its main actions on the right. */
export function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <h1 className="page-title">{title}</h1>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}
