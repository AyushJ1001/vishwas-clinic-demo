"use client";

import { CaretDown, Pulse } from "@phosphor-icons/react";
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
  { href: "/receipts", label: "Receipts", key: "receipts" },
  {
    href: "/medical-certificate",
    label: "Medical certificate",
    key: "certificate",
  },
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

export function RouteHeader({
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

