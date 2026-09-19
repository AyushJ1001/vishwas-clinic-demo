# Vishwas Clinic

The consultation and document system for Vishwas Clinic. Two doctors use it on one shared clinic computer during consultations, and occasionally on a phone away from the clinic.

## Language

### Places and copies

**Clinic PC**:
The single shared Windows computer at the clinic that holds the master copy of all clinic records and works without internet.
_Avoid_: Server, desktop, local machine

**Clinic record**:
Any patient, consultation, issued document, or clinic catalog entry as held by the Clinic PC, which is the authoritative version.
_Avoid_: Local data, offline data

**Cloud copy**:
The readable copy of clinic records kept online so the phone can look up patients; it follows the Clinic PC and is never the authority.
_Avoid_: Cloud database, backend, master

**Phone-issued**:
Describes a document or new patient created on a phone through the Cloud copy rather than on the Clinic PC.
_Avoid_: Remote, mobile record

**Sync**:
The exchange in which the Clinic PC sends its changes to the Cloud copy and collects anything Phone-issued since the last exchange.
_Avoid_: Upload, refresh

### Patients

**Patient**:
One individual the clinic treats, identified by exactly one Patient number for life.

**Patient number**:
The sequential, human-facing number a Patient keeps across every visit and document; only the Clinic PC assigns it.
_Avoid_: Patient ID, registration number, UHID

**Pending patient number**:
The state of a Phone-issued Patient who has not yet received a Patient number because the Clinic PC has not synced since they were registered.
_Avoid_: Temporary ID, provisional number

**Possible duplicate**:
A flag on two Patients who may be the same individual (same name and mobile number), awaiting a doctor's decision; never resolved automatically.

**Merge**:
A doctor's confirmation that two Patients are the same individual, keeping the Clinic PC's Patient number.

**Imported patient**:
A Patient brought over from the doctors' previous system, who keeps their original Patient number.

### Consultations and documents

**Consultation**:
One visit by a Patient to a doctor, first or follow-up, from which issued documents are produced.
_Avoid_: Visit record, encounter, case

**Draft**:
A Consultation or document still being edited; it stays on the device where it was started.

**Issued document**:
A Prescription, Receipt, or Medical certificate that has been finalised; it is never edited afterwards.
_Avoid_: Output, generated document

**Author**:
The doctor under whose name and registration details an Issued document is produced.
_Avoid_: User, owner

**Prescription**:
The A5 Issued document listing the Consultation's findings, advice, investigations, and medicines.

**Receipt**:
The A5 Issued document acknowledging a consultation payment; issued only on the Clinic PC.

**Receipt number**:
The sequential number on every Receipt, assigned only by the Clinic PC.

**Medical certificate**:
The A5 Issued document certifying a Patient's illness and fitness to resume duties; it carries no serial number.
_Avoid_: Certificate number

**Clinic catalog entry**:
A complaint, finding, diagnosis, medicine, advice, or investigation that the doctors added beyond the built-in catalog; entries are only ever added, never edited.
_Avoid_: Custom item

### Safekeeping and sending

**Local backup**:
A dated copy of all Clinic records kept on the Clinic PC itself.

**USB backup**:
A copy of all Clinic records written to a removable drive whenever a doctor chooses.

**Cloud backup**:
A copy of all Clinic records stored online for disaster recovery, separate from the Cloud copy.

**Backup passphrase**:
The clinic's secret, kept on paper at the clinic, without which a USB backup or Cloud backup cannot be restored.

**Outbox**:
The list of messages to patients (WhatsApp, email) waiting for an internet connection to be sent.
