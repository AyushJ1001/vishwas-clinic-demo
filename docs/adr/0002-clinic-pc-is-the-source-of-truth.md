# The Clinic PC holds the master copy; the cloud follows it

The Clinic PC's local database is the authoritative copy of every Clinic record. The Cloud copy (Cloudflare D1) is a replica that the Clinic PC keeps up to date by sending a queue of changes whenever it is online. The Cloud copy also collects Phone-issued records until the Clinic PC picks them up. We chose this direction, rather than making the cloud the master with an offline cache on the PC, for three reasons. The clinic must work for days without internet. Both doctors share the one PC, so it is effectively the only writer. And a new PC can be set up by restoring from the cloud.

## Consequences

- Records carry globally unique IDs so both sides can create them without coordinating. Human-facing sequential numbers are a separate matter: see ADR 0003.
- The Cloud copy never overwrites a Clinic record. The only data that flows from the cloud to the Clinic PC is Phone-issued records and Clinic catalog entries, which are only ever added.
- Monthly summaries are calculated on the Clinic PC, so they include Phone-issued records only after the next sync.
