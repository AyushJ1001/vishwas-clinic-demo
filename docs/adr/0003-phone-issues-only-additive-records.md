# The phone only adds records, and only the Clinic PC assigns sequential numbers

A doctor away from the clinic may need to issue an urgent Prescription or Medical certificate, sometimes for a new Patient, while the Clinic PC is offline. The doctor wants Patient numbers and Receipt numbers to be sequential with no gaps. Two devices issuing from one sequence while offline would collide, so we limit the phone to creating new records only, and let only the Clinic PC hand out sequential numbers.

- The phone can create Prescriptions, Medical certificates, and new Patients. It cannot create Receipts, and it never edits records owned by the Clinic PC.
- A Patient registered on the phone has a Pending patient number, and the Clinic PC assigns the next real number at the next sync. A Phone-issued Prescription printed before then shows no number.
- Medical certificates carry no serial number (this matches the clinic's current format), so a certificate issued on the phone is final the moment it is issued.
- When a Phone-issued Patient and a Clinic PC Patient look like the same person (same name and mobile number), the Clinic PC flags them as a Possible duplicate for a doctor to merge. It never merges automatically, because family members often share one mobile number. The merged Patient keeps the Clinic PC's Patient number.
- Imported patients keep their original Patient numbers, and new Patients continue from the highest imported number.

## Considered options

- **Reserving a separate block of numbers for the phone.** Rejected because it produces gaps and strange-looking numbers.
- **Registering new Patients only at the clinic.** Rejected because urgent calls come from new Patients too.
