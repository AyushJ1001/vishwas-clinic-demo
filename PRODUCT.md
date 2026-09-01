# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary users are Dr. Makarand Vishwas Apte and Dr. Gauri Makarand Apte. They work mainly from a desktop during consultations at Vishwas Clinic. They may also use the product from a phone at home when they need to prepare and send an urgent prescription.

## Product Purpose

Vishwas Clinic is a working frontend demonstration of the clinic's consultation and document workflows. It lets the doctors fill a prescription form, see the resulting document, prepare consultation receipts and medical certificates, and review clinic summaries.

The current goal is a complete, production-ready frontend whose data layer can later be replaced with or connected to the real application backend. Until then, the project should keep a small demo backend for sample patient information and other demonstrations that need persistence.

## Positioning

The product keeps the clinic's familiar prescription workflow while adding built-in, searchable clinical information. It can carry consultation details into related documents so the doctors do not have to re-enter the same information.

## Operating Context

- The main setting is an active consultation on a clinic desktop.
- The secondary setting is occasional phone use away from the clinic, including preparing and sending an urgent prescription.
- The current workflows cover prescriptions, consultation receipts, medical certificates, and monthly summaries.
- Prescriptions use searchable catalogs for complaints, findings, diagnoses, medicines, advice, and investigations. The demo also allows clinic-specific catalog entries.

## Capabilities and Constraints

- The frontend should be complete enough to transfer into the real app or connect to its database without a visual rebuild.
- The current backend is demo infrastructure, not the production patient record system.
- All patient information is fictional demo data.
- The interface is English-only for now.
- Desktop is the primary device class, but the complete workflow must remain usable on mobile.
- Production privacy, security, data retention, authentication, and regulatory requirements are open decisions for later phases.

## Brand Commitments

The Vishwas Clinic name and all doctor-related information in the project are real and must remain accurate. This includes doctor names, qualifications, registration numbers, specialties, contact details, and clinic details. Future work must not replace these facts with invented alternatives.

## Evidence on Hand

- Real clinic and doctor details appear in `app/ClinicApp.tsx`.
- The current interaction model and document workflows are implemented in `app/ClinicApp.tsx`.
- Seeded clinical catalogs are stored in `app/clinic-data.ts`.
- Clinic-specific catalog persistence is demonstrated through the D1-backed API in `app/api/catalog/route.ts` and `db/catalog.ts`.
- Patient names, visit details, and other patient information in the interface are demo data and must not be presented as real records.
- Dashboard totals and trends have not been confirmed as real clinic evidence and must not be used as factual claims.

## Product Principles

- Keep the doctors inside one clear workflow during a consultation.
- Reduce repeated entry by carrying confirmed visit information into related documents.
- Preserve the clinic's real identity and doctor details exactly.
- Keep demo data and infrastructure easy to replace when the real backend is introduced.
- Design desktop-first interactions that remain practical for urgent phone use.

## Accessibility & Inclusion

No formal accessibility standard has been set for the demo phase. Mobile-friendly behavior and a good desktop experience are required. More specific accessibility needs remain open for later phases.
