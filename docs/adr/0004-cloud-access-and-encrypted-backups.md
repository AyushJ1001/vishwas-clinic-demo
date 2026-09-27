# Cloud access control and encrypted backups

Patient data is about to reach the production Cloudflare deployment, which today has no login. We put the whole site behind Cloudflare Access, with email one-time codes restricted to the two doctors. The Clinic PC syncs with its own device key.

Backups are kept in three places. The Clinic PC saves a Local backup every day and whenever the app closes, keeping the last 30. A doctor can make a USB backup at any time, with no reminders. A Cloud backup is stored as snapshots in R2, separate from the readable Cloud copy in D1, which the phone needs in order to look up Patients.

USB backups and Cloud backups are encrypted with the Backup passphrase, because USB drives get lost and old PCs get stolen. The live database on the Clinic PC is not encrypted, so it stays fast and can never lock itself. The risk is that a forgotten passphrase makes every backup useless. To guard against that, the passphrase is written on paper at the clinic and also kept in the cloud account.

## Considered options

- **Encrypting the live database too.** Rejected because on an unpatched, shared Windows account it adds a way for the database to lock itself without adding meaningful protection.
