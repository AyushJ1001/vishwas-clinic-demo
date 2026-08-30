'use client';

import { useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowRight, CaretDown, ChartLineUp, Check, FileText, MagnifyingGlass, Printer, Pulse, Receipt, SealCheck, X } from '@phosphor-icons/react';

gsap.registerPlugin(ScrollTrigger);

const medicines = [
  { name: 'Paracetamol 500 mg', ingredient: 'Paracetamol IP 500 mg', timing: '1 — 0 — 1', note: 'After food', duration: '3 days' },
  { name: 'Levocetirizine 5 mg', ingredient: 'Levocetirizine dihydrochloride 5 mg', timing: '0 — 0 — 1', note: 'At bedtime', duration: '5 days' },
];

export default function Home() {
  const [stage, setStage] = useState(2);
  const [medicineOpen, setMedicineOpen] = useState(false);
  const [documentMode, setDocumentMode] = useState<'receipt' | 'fitness'>('receipt');
  const page = useRef<HTMLElement>(null);

  useGSAP(() => {
    gsap.from('.reveal-word', { opacity: 0.12, stagger: 0.035, scrollTrigger: { trigger: '.reveal-copy', start: 'top 78%', end: 'bottom 45%', scrub: true } });
    gsap.utils.toArray<HTMLElement>('.stack-card').forEach((card, index) => {
      gsap.fromTo(card, { y: 70, scale: 0.92 }, { y: 0, scale: 1, ease: 'none', scrollTrigger: { trigger: card, start: 'top 92%', end: 'top 58%', scrub: true } });
      card.style.zIndex = String(index + 1);
    });
  }, { scope: page });

  return (
    <main ref={page} className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#f4f1e9] text-[#15362f]">
      <nav className="sticky top-0 z-50 border-b border-[#15362f]/10 bg-[#f4f1e9]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between px-5 py-4 lg:px-10">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#15362f] text-white"><Pulse weight="bold" size={20} /></span><div><p className="text-[15px] font-semibold leading-none">Vishwas Clinic</p><p className="mt-1 text-[11px] text-[#527068]">Doctor workspace</p></div></div>
          <div className="hidden items-center gap-1 rounded-full border border-[#15362f]/10 bg-white/70 p-1 md:flex"><button className="rounded-full bg-[#15362f] px-5 py-2 text-xs font-semibold text-white">Consultation</button><button className="px-5 py-2 text-xs font-medium">Documents</button><button className="px-5 py-2 text-xs font-medium">Insights</button></div>
          <button className="flex items-center gap-2 rounded-full border border-[#15362f]/15 bg-white px-4 py-2 text-xs font-semibold">Dr. M. V. Apte <CaretDown size={14} /></button>
        </div>
      </nav>

      <section className="mx-auto max-w-[1480px] px-5 pb-28 pt-10 lg:px-10 lg:pt-14">
        <div className="mb-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-6xl"><p className="mb-4 text-xs font-semibold uppercase tracking-[.22em] text-[#b85a36]">Saturday clinic · 30 August</p><h1 className="max-w-6xl text-[clamp(3rem,5vw,5.5rem)] font-medium leading-[.94] tracking-[-.055em]">One calm workspace for the whole consultation.</h1></div>
          <button className="group flex w-fit items-center gap-3 rounded-full bg-[#d85f39] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(216,95,57,.2)]">View today’s queue <ArrowRight className="transition-transform group-hover:translate-x-1" /></button>
        </div>

        <div className="grid overflow-hidden rounded-[32px] border border-[#15362f]/10 bg-[#fbfaf5] shadow-[0_28px_80px_rgba(21,54,47,.09)] lg:grid-cols-[260px_minmax(0,1fr)_430px]">
          <aside className="border-b border-[#15362f]/10 bg-[#e9e4d8] p-6 lg:border-b-0 lg:border-r">
            <p className="text-[11px] font-semibold uppercase tracking-[.2em] text-[#6d7e77]">Consultation flow</p>
            <div className="mt-7 space-y-2">
              {['Patient', 'Vitals & complaints', 'Diagnosis', 'Prescription', 'Review & print'].map((item, i) => <button key={item} onClick={() => setStage(i)} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm transition ${stage === i ? 'bg-[#15362f] text-white' : 'hover:bg-white/60'}`}><span className={`grid h-7 w-7 place-items-center rounded-full text-xs ${i < stage ? 'bg-[#d85f39] text-white' : stage === i ? 'bg-white text-[#15362f]' : 'border border-current/20'}`}>{i < stage ? <Check size={13} weight="bold" /> : i + 1}</span>{item}</button>)}
            </div>
            <div className="mt-8 rounded-2xl border border-[#15362f]/10 bg-white/55 p-4"><p className="text-xs font-semibold">Existing patient</p><p className="mt-1 text-xs leading-relaxed text-[#61736d]">Patient ID and demographics remain linked across every follow-up.</p></div>
          </aside>

          <section className="p-6 sm:p-8 lg:p-10">
            <div className="mb-8 flex flex-col justify-between gap-4 border-b border-[#15362f]/10 pb-7 sm:flex-row sm:items-end"><div><p className="text-xs text-[#6d7e77]">Patient ID VC-1048</p><h2 className="mt-1 text-3xl font-medium tracking-tight">Ananya Deshmukh</h2><p className="mt-1 text-sm text-[#6d7e77]">32 years · Female · Follow-up visit</p></div><button className="flex items-center gap-2 rounded-full border border-[#15362f]/15 px-4 py-2 text-xs font-semibold"><MagnifyingGlass size={14} /> Change patient</button></div>
            <div className="grid gap-4 sm:grid-cols-5">{[['Weight','62 kg'],['Temperature','100.2 °F'],['Pulse','88 /min'],['Blood pressure','118/76'],['SpO₂','98%']].map(([label,value])=><div key={label} className="rounded-2xl border border-[#15362f]/10 bg-white p-4"><p className="text-[10px] uppercase tracking-[.14em] text-[#7a8b85]">{label}</p><p className="mt-2 text-lg font-semibold">{value}</p></div>)}</div>
            <div className="mt-8 grid gap-6 sm:grid-cols-2"><label className="block"><span className="field-label">Major complaints</span><div className="tag-field"><span>Fever <X size={12} /></span><span>Dry cough <X size={12} /></span><CaretDown className="ml-auto" size={14} /></div></label><label className="block"><span className="field-label">Examination findings</span><div className="tag-field"><span>Throat congestion <X size={12} /></span><CaretDown className="ml-auto" size={14} /></div></label></div>
            <label className="mt-6 block"><span className="field-label">Provisional diagnosis</span><input defaultValue="Viral upper respiratory tract infection" className="input-field" /></label>
            <div className="mt-6 grid gap-6 sm:grid-cols-2"><label><span className="field-label">Advice</span><div className="select-field">Warm saline gargles <CaretDown size={14} /></div></label><label><span className="field-label">Investigation suggested</span><div className="select-field text-[#7a8b85]">Select if needed <CaretDown size={14} /></div></label></div>
            <div className="mt-10 flex items-center justify-between"><button className="text-sm font-semibold text-[#6d7e77]">Save draft</button><button onClick={() => setStage(3)} className="flex items-center gap-2 rounded-full bg-[#15362f] px-6 py-3 text-sm font-semibold text-white">Continue to medicines <ArrowRight /></button></div>
          </section>

          <aside className="relative bg-[#133a32] p-5 text-white lg:p-7">
            <div className="mb-4 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[.18em] text-white/60">Live A5 preview</p><button className="rounded-full bg-white/10 p-2"><Printer size={17} /></button></div>
            <div className="paper mx-auto aspect-[148/210] w-full max-w-[360px] bg-[#fffdf8] p-7 text-[#15362f] shadow-2xl">
              <div className="flex items-start justify-between border-b border-[#15362f]/20 pb-4"><div><p className="text-xl font-bold tracking-tight">VISHWAS CLINIC</p><p className="mt-1 text-[8px] uppercase tracking-[.18em]">Care · Clarity · Continuity</p></div><Pulse size={26} weight="duotone" /></div>
              <div className="mt-4 flex justify-between text-[9px]"><div><p className="font-bold">Ananya Deshmukh</p><p>32 years · Female · VC-1048</p></div><div className="text-right"><p>30/08/26</p><p>Dr. M. V. Apte</p></div></div>
              <div className="mt-5 grid grid-cols-5 gap-1 border-y border-[#15362f]/15 py-2 text-center text-[7px]"><span>Wt<br/><b>62 kg</b></span><span>Temp<br/><b>100.2°F</b></span><span>Pulse<br/><b>88</b></span><span>BP<br/><b>118/76</b></span><span>SpO₂<br/><b>98%</b></span></div>
              <p className="mt-5 font-serif text-2xl italic">Rx</p>
              <p className="mb-3 text-[7px] uppercase tracking-[.13em] text-[#b85a36]">Read the instructions carefully</p>
              <div className="space-y-4">{medicines.map((m,i)=><div key={m.name} className="grid grid-cols-[18px_1fr] gap-2 text-[9px]"><b>{i+1}.</b><div><p className="font-bold">{m.name}</p><p className="text-[6px] text-[#6d7e77]">{m.ingredient}</p><div className="mt-1 flex justify-between"><span>{m.timing} · {m.note}</span><span>{m.duration}</span></div></div></div>)}</div>
              <button onClick={() => setMedicineOpen(!medicineOpen)} className="mt-5 flex w-full items-center justify-between border-y border-dashed border-[#15362f]/20 py-2 text-[8px] font-bold"><span>+ Add medicine</span><CaretDown size={10} /></button>
              {medicineOpen && <div className="mt-2 rounded border border-[#15362f]/15 bg-white p-2 text-[8px] shadow"><p>Azithromycin 500 mg</p><p className="mt-1">Pantoprazole 40 mg</p></div>}
              <div className="absolute bottom-7 left-7 right-7 border-t border-[#15362f]/15 pt-3 text-[6px] leading-relaxed"><p>No substitutes · Bring this prescription at the next visit.</p><p>Valid only for the named person and duration.</p></div>
            </div>
          </aside>
        </div>
      </section>

      <section className="border-y border-[#15362f]/10 bg-[#ebe5d9] px-5 py-32 md:py-48 lg:px-10">
        <div className="mx-auto max-w-[1480px]">
          <p className="reveal-copy max-w-6xl text-[clamp(2.3rem,4.6vw,5rem)] font-medium leading-[1.03] tracking-[-.045em]">{'Finish the visit without breaking your train of thought. The prescription becomes a receipt, certificate, and monthly record from the same patient details.'.split(' ').map((word, i) => <span key={`${word}-${i}`} className="reveal-word mr-[.22em] inline-block">{word}</span>)}</p>
        </div>
      </section>

      <section id="documents" className="px-5 py-32 md:py-48 lg:px-10">
        <div className="mx-auto grid max-w-[1480px] gap-12 lg:grid-cols-[.72fr_1.28fr]">
          <div className="lg:sticky lg:top-32 lg:self-start"><p className="text-xs font-semibold uppercase tracking-[.2em] text-[#b85a36]">After consultation</p><h2 className="mt-5 max-w-xl text-5xl font-medium leading-[.98] tracking-[-.045em] md:text-7xl">One patient. Every document.</h2><p className="mt-6 max-w-md text-base leading-relaxed text-[#60736c]">The clinic header, doctor profile, patient identity, date, and diagnosis carry forward automatically. The doctor only reviews what changes.</p></div>
          <div className="space-y-8">
            <article className="stack-card group overflow-hidden rounded-[30px] border border-[#15362f]/10 bg-[#15362f] p-6 text-white shadow-[0_30px_70px_rgba(21,54,47,.18)] md:p-9">
              <div className="mb-8 flex items-center justify-between"><div className="flex gap-2"><button onClick={() => setDocumentMode('receipt')} className={`rounded-full px-4 py-2 text-xs font-semibold ${documentMode === 'receipt' ? 'bg-white text-[#15362f]' : 'bg-white/10'}`}>Receipt</button><button onClick={() => setDocumentMode('fitness')} className={`rounded-full px-4 py-2 text-xs font-semibold ${documentMode === 'fitness' ? 'bg-white text-[#15362f]' : 'bg-white/10'}`}>Fitness certificate</button></div>{documentMode === 'receipt' ? <Receipt size={28} /> : <SealCheck size={28} />}</div>
              {documentMode === 'receipt' ? <div className="grid gap-7 md:grid-cols-[.8fr_1.2fr]"><div><p className="text-sm text-white/60">Receipt VC-R-0862</p><h3 className="mt-2 text-4xl font-medium">₹600</h3><label className="mt-8 block"><span className="mb-2 block text-[10px] uppercase tracking-[.16em] text-white/50">Consultation fee</span><input className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-white outline-none" defaultValue="600" /></label><button className="mt-5 flex items-center gap-2 rounded-full bg-[#d85f39] px-5 py-3 text-sm font-semibold text-white">Generate receipt <ArrowRight /></button></div><div className="group overflow-hidden rounded-2xl bg-[#fffdf8] p-7 text-[#15362f] transition-transform duration-700 ease-out group-hover:scale-[1.02]"><div className="flex items-start justify-between border-b pb-4"><div><b>VISHWAS CLINIC</b><p className="text-[10px]">Pune · +91 98220 00000</p></div><Pulse /></div><p className="mt-7 text-center text-xs uppercase tracking-[.16em]">Receipt</p><p className="mt-6 text-sm leading-8">Received with thanks a sum of rupees <b>Six Hundred only</b> from <b>Ms. Ananya Deshmukh</b> for consultation charges today.</p><div className="mt-8 flex justify-between border-t pt-4 text-xs"><span>30/08/26</span><span>Dr. M. V. Apte</span></div></div></div> : <div className="grid gap-7 md:grid-cols-[.8fr_1.2fr]"><div className="space-y-4"><label><span className="mb-2 block text-[10px] uppercase tracking-[.16em] text-white/50">Treatment since</span><input className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-white" defaultValue="26/08/26" /></label><label><span className="mb-2 block text-[10px] uppercase tracking-[.16em] text-white/50">Rest advised</span><input className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-white" defaultValue="4 days" /></label><button className="flex items-center gap-2 rounded-full bg-[#d85f39] px-5 py-3 text-sm font-semibold">Generate certificate <ArrowRight /></button></div><div className="group overflow-hidden rounded-2xl bg-[#fffdf8] p-7 text-[#15362f] transition-transform duration-700 ease-out group-hover:scale-[1.02]"><div className="flex items-start justify-between border-b pb-4"><div><b>VISHWAS CLINIC</b><p className="text-[10px]">Fitness certificate</p></div><SealCheck /></div><p className="mt-7 text-sm leading-7">This is to certify that <b>Ms. Ananya Deshmukh</b> has been under my treatment since <b>26/08/26</b> for a viral upper respiratory tract infection. On examination today, I found her fit to resume duties from the next working day.</p><p className="mt-8 text-right text-xs">Dr. M. V. Apte</p></div></div>}
            </article>

            <article className="stack-card overflow-hidden rounded-[30px] border border-[#15362f]/10 bg-[#fbfaf5] p-7 shadow-[0_25px_60px_rgba(21,54,47,.08)] md:p-10"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#b85a36]">August at a glance</p><h3 className="mt-3 text-4xl font-medium tracking-tight">Clinic activity</h3></div><ChartLineUp size={32} /></div><div className="mt-10 grid-flow-dense grid grid-cols-2 gap-3 md:grid-cols-4">{[['184','Patients'],['₹1.08L','Receipts'],['176','Prescriptions'],['31','Follow-ups']].map(([n,l]) => <div key={l} className="rounded-2xl border border-[#15362f]/10 bg-white p-5"><p className="text-3xl font-semibold tracking-tight">{n}</p><p className="mt-2 text-xs text-[#65766f]">{l}</p></div>)}</div><div className="mt-8 flex h-40 items-end gap-2">{[38,55,42,68,72,48,85,66,92,76,63,88].map((h,i)=><span key={i} className="flex-1 rounded-t-lg bg-[#d85f39] transition-all duration-500 hover:bg-[#15362f]" style={{height:`${h}%`}} />)}</div></article>
          </div>
        </div>
      </section>

      <section className="bg-[#d85f39] px-5 py-28 text-white md:py-40 lg:px-10"><div className="mx-auto flex max-w-[1480px] flex-col justify-between gap-10 md:flex-row md:items-end"><div><FileText size={42} /><h2 className="mt-8 max-w-5xl text-[clamp(3rem,6vw,6rem)] font-medium leading-[.92] tracking-[-.05em]">Ready for the next patient.</h2></div><button className="group flex w-fit items-center gap-3 rounded-full bg-white px-7 py-4 text-sm font-semibold text-[#15362f]">Start new prescription <ArrowRight className="transition-transform group-hover:translate-x-1" /></button></div><footer className="mx-auto mt-24 flex max-w-[1480px] flex-col justify-between gap-3 border-t border-white/25 pt-6 text-xs text-white/70 sm:flex-row"><span>Vishwas Clinic workflow demo</span><span>Prescription · Receipt · Fitness certificate · Summary</span></footer></section>
    </main>
  );
}
