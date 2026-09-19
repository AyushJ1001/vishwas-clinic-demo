"use client";

import { Printer } from "@phosphor-icons/react";



export function RouteWorkspace({
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

export function A5Document({
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

