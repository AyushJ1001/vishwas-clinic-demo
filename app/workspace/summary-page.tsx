"use client";

import { ChartLineUp } from "@phosphor-icons/react";

import { PageHeader, Shell } from "./shell";

export function SummaryPage() {
  return (
    <Shell active="summaries">
      <div className="page pb-0"><PageHeader title="Summaries" /></div>
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

