"use client";

import { useEffect, useState } from "react";

import { clinicDoctors } from "./clinic-facts";
import type { ClinicDoctorName } from "./consultation-model";

export const authorStorageKey = "vishwas-clinic-author";
const defaultAuthor: ClinicDoctorName = "Dr. Makarand Vishwas Apte";

export function useAuthor() {
  const [doctorName, setDoctorNameState] =
    useState<ClinicDoctorName>(defaultAuthor);
  useEffect(() => {
    const saved = window.localStorage.getItem(authorStorageKey);
    if (!saved || !(saved in clinicDoctors)) return;
    const timer = window.setTimeout(
      () => setDoctorNameState(saved as ClinicDoctorName),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);
  const setDoctorName = (name: ClinicDoctorName) => {
    setDoctorNameState(name);
    window.localStorage.setItem(authorStorageKey, name);
  };
  return { doctorName, setDoctorName };
}
