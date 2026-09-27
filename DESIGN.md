---
name: Vishwas Clinic
description: A plain, fast consultation desk for a two-doctor clinic, built around the printed A5 sheet.
colors:
  logo-maroon: "#650219"
  logo-maroon-dark: "#4a0112"
  ink: "#221c1d"
  graphite: "#5e5658"
  rule: "#d6d0d1"
  desk: "#f2f0f0"
  paper: "#ffffff"
  signal-red: "#b3261e"
  attention-amber: "#7a4e00"
  attention-surface: "#fff3d6"
typography:
  family: "IBM Plex Sans Variable, IBM Plex Sans Devanagari, Arial, sans-serif"
  page-title: { fontSize: "20px", fontWeight: 600, lineHeight: 1.3 }
  section-title: { fontSize: "16px", fontWeight: 600, lineHeight: 1.35 }
  body: { fontSize: "14px", fontWeight: 400, lineHeight: 1.45 }
  label: { fontSize: "13px", fontWeight: 500, lineHeight: 1.35 }
  caption: { fontSize: "12px", fontWeight: 400, lineHeight: 1.35 }
rounded:
  control: "4px"
  panel: "6px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
---

# Design system: Vishwas Clinic

## Brief

Two doctors use one old Windows 8.1 computer (probably a 1366×768 screen) in the middle of consultations, with patients waiting. The app's job is to get a correct A5 prescription, receipt or certificate onto paper quickly, and to keep the clinic's records safe. Nobody is browsing: every screen is a task.

So the interface is a desk, not a brochure. It is dense, still, and predictable. It looks finished because it is consistent, not because it is decorated.

## Principles

1. **The paper is the product.** The live A5 sheet sits beside the form, literally white paper with the clinic's letterhead, and it is the one visual flourish. Nothing frames it in colour.
2. **One screen, one job.** A prescription fits a 1366×768 screen with little scrolling. There are no page heroes, slogans or introductions; a page opens straight onto its work.
3. **State is plain and always visible.** Whether the draft is saved, which patient number this is, and what is still missing are shown in words, where the doctor is looking.
4. **Nothing moves by itself.** No entrance animations, no scroll effects, no hover lifts. Hover and focus changes are immediate.
5. **Words are instructions.** Labels name the thing; buttons say what they do ("Complete prescription", "Back up to PNY (D:)"); errors say what to fix. No descriptive filler, no "demo".

## Colour

The app wears the maroon of the clinic's logo as its frame and uses it for the one primary action on each screen. Everything else is ink on white on a light desk grey. The logo's bright red and gold stay in the logo: red already means an error, and a second accent would blur that.

- **Logo maroon** `#650219`: the top bar, primary buttons, selected tabs and options, focus rings, and on documents the clinic's name and the letterhead's rules. White on it is 13:1, and it prints as near-black in black and white.
- **Ink** `#221c1d`: text.
- **Graphite** `#5e5658`: labels and secondary text (7:1 on white).
- **Rule** `#d6d0d1`: borders and dividers.
- **Desk** `#f2f0f0`: the page behind panels.
- **Paper** `#ffffff`: panels, inputs, and the document sheet.
- **Signal red** `#b3261e`: errors and destructive actions only.
- **Attention amber** `#7a4e00` on `#fff3d6`: something needs the doctor before they can finish (unsaved draft that failed, follow-up without its earlier prescription).

No gradients, no tinted shadows, no second accent colour.

## Type

**IBM Plex Sans** for everything, with **IBM Plex Sans Devanagari** behind it for Marathi and Hindi names. Plex is a workmanlike grotesque with clear numerals and tabular figures, which matter here: patient numbers, dates, doses and vitals are read at a glance and should line up. Both are bundled, so the Clinic PC never needs the internet for them.

Sizes: 20 (page title), 16 (section title), 14 (body and inputs), 13 (labels), 12 (captions). Weights 400, 500 and 600 only. Labels are sentence case; nothing is set in tracked capitals.

## Layout

A fixed frame: a 44 px maroon bar with the clinic name, the page tabs, and "Writing as" (the Author) on the right. Below it, each page has one title row with its main action at the right, then the work.

```
▓ Vishwas Clinic │ Prescription  Patients  Receipts  Certificates  Summaries  Backups │ Writing as Dr. M. V. Apte ▾ ▓
New prescription · Saved 3:02 pm                                    [Review and complete]
┌ Patient ──────────────────────────────────────┐  ┌──────────────┐
│ Search name, number or phone      No. 1042      │  │  A5 sheet     │
│ Date of birth  Age  Gender  Phone  Visit date   │  │  (live)       │
│ Vitals: Wt  Temp  Pulse  BP  SpO₂  (one row)    │  │               │
│ Complaints        Findings                      │  │  sticky       │
│ Diagnosis                                       │  │               │
│ Advice            Investigations                │  └──────────────┘
│ Medicines: name │ dose │ duration │ method │ ×  │
└─────────────────────────────────────────────────┘
```

Content is left-aligned. Sections inside a panel are separated by rules, not by more rounded boxes. Panels have a 1 px rule border and a 6 px radius; controls a 4 px radius. There are no shadows except under open menus and dialogs, where they show what is on top.

Controls are 36 px tall for a mouse and keyboard; below 1024 px wide (the phone), targets grow to 44 px.

## What was deliberately not done

The usual clinic-dashboard kit (rounded cards with soft shadows, big stat tiles with trend percentages, a blue primary colour, a sidebar) was considered and rejected: the tiles invite invented numbers, the cards waste the small screen, and the sidebar costs width the paper preview needs. The monthly summary is a plain table of counts, like the clinic's register.

Warm cream with a terracotta accent and big display headlines (the previous look) was also dropped: it read as a marketing page and pushed the form below the fold.
