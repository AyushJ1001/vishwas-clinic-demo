"use client";

import Image from "next/image";
import { useLayoutEffect, useRef } from "react";

import type {
  ClinicIdentitySnapshot,
  DoctorIdentitySnapshot,
} from "../consultation-model";

export function DocumentLetterhead({
  clinic,
  doctor,
}: {
  clinic: ClinicIdentitySnapshot;
  doctor: DoctorIdentitySnapshot;
}) {
  return (
    <header className="rx-letterhead">
      <h2 className="rx-title">{clinic.name}</h2>
      <div className="rx-doctor rx-block">
        <div>
          <b>{doctor.name}</b>
          <p>
            {doctor.qualifications} ·{" "}
            <span className="rx-registration">{doctor.registration}</span>
          </p>
          {doctor.mobile && (
            <p>
              <b>Mobile: {doctor.mobile}</b>
            </p>
          )}
          {doctor.specialty && <p>{doctor.specialty}</p>}
        </div>
        {/* Replace public/icons/clinic-logo.svg with the clinic's own logo. */}
        <Image
          src="/icons/clinic-logo.svg"
          alt=""
          width={24}
          height={24}
          className="rx-clinic-mark"
        />
      </div>
      <div className="rx-clinic rx-block">
        <p>{clinic.address}</p>
        <p>{clinic.hours}</p>
        <p>{clinic.services}</p>
      </div>
    </header>
  );
}

/**
 * Shows a true-size A5 page scaled to the width available. Chromium 108 (the
 * Clinic PC) cannot divide one length by another in CSS, so the scale is
 * measured here; the stylesheet's calc() remains for printing and newer
 * browsers.
 */
export function PageFrame({ children }: { children: React.ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const scale = scaleRef.current;
    if (!frame || !scale) return;
    const fit = () => {
      const page = scale.firstElementChild as HTMLElement | null;
      if (!page?.offsetWidth) return;
      scale.style.transform = `scale(${frame.clientWidth / page.offsetWidth})`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={frameRef} className="prescription-page-frame">
      <div ref={scaleRef} className="prescription-page-scale">
        {children}
      </div>
    </div>
  );
}
