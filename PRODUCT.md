# Product

<!-- impeccable:product-schema 1 -->

## Platform

desktop (Windows 8.1 Clinic PC, offline) and web (phone, through the Cloud copy)

## Users

The primary users are Dr. Makarand Vishwas Apte and Dr. Gauri Makarand Apte. They work mainly from a desktop during consultations at Vishwas Clinic. They may also use the product from a phone at home when they need to prepare and send an urgent prescription.

## Product Purpose

Vishwas Clinic is the clinic's working consultation and document system. The doctors fill a prescription and see the A5 document as it will print, issue receipts and medical certificates, keep patient records with clinic patient numbers, and review monthly counts. The Clinic PC holds the master records and works without internet (ADR 0001, 0002); a phone can issue prescriptions and certificates through the Cloud copy (ADR 0003).

## Positioning

The product keeps the clinic's familiar prescription workflow while adding built-in, searchable clinical information. It can carry consultation details into related documents so the doctors do not have to re-enter the same information.

## Operating Context

- The main setting is an active consultation on a clinic desktop.
- The secondary setting is occasional phone use away from the clinic, including preparing and sending an urgent prescription.
- The current workflows cover prescriptions, consultation receipts, medical certificates, and monthly summaries.
- Prescriptions use searchable catalogs for complaints, findings, diagnoses, medicines, advice, and investigations. Doctors can add clinic catalog entries when a term is missing.

## Capabilities and Constraints

- The Clinic PC is an old Windows 8.1 computer running the app as an Electron 22 (Chromium 108) desktop app, with records in a local SQLite database. Everything except sending and cloud backup works offline.
- Patient records are real clinical records. They are backed up daily, on close, and to encrypted USB drives (ADR 0004).
- The interface is English-only for now.
- Desktop is the primary device class, but the prescription workflow must remain usable on a phone.

## Brand Commitments

The Vishwas Clinic name and all doctor-related information in the project are real and must remain accurate. This includes doctor names, qualifications, registration numbers, specialties, contact details, and clinic details. Future work must not replace these facts with invented alternatives.

## Evidence on Hand

- Real clinic and doctor details are in `app/clinic-facts.ts`.
- The requirements for each document are in the doctors' requirements document (A5 layout, patient number, numbered receipts, unnumbered certificates, monthly summary).
- Seeded clinical catalogs are in `app/clinic-data.ts`; clinic catalog entries are stored alongside the records.
- Summary figures must be counted from the records, never estimated or invented.

## Product Principles

- Keep the doctors inside one clear workflow during a consultation.
- Reduce repeated entry by carrying confirmed visit information into related documents.
- Preserve the clinic's real identity and doctor details exactly.
- Design desktop-first interactions that remain practical for urgent phone use.
- Put predictability and speed ahead of visual flourish. The clinic is busy and patients are waiting, so avoid decorative motion and make every action look finished the moment it happens, while keeping the interface tidy.

## Accessibility & Inclusion

Screens are checked against WCAG 2.1 AA with axe in the tests. Everything is usable by keyboard, and targets are at least 44 px on the phone.
