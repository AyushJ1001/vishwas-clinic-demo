# Patient documents are kept in the database and travel in Sync

Doctors want to keep a Patient's lab reports, scans and referral letters with the Patient's record. A Patient document is a PDF, JPG or PNG of at most 10 MB, recognised by its content and not by its file name. We store its bytes inside the database, cut into 1 MB pieces, next to a row that names it. The Clinic PC adds and removes documents, and Sync carries both to the Cloud copy, where a phone can open them.

The Clinic PC holds the master copy so the clinic can work without power or internet (ADR 0002). That is not a substitute for a reliable copy online: every Clinic record, documents included, has to reach the Cloud copy.

We chose the database over a folder of files because a backup is one SQLite file (ADR 0004). Everything in it is already copied daily, sealed for USB, and restored as a unit, so a document is safe the moment it is added, with no second thing to back up.

## How a document reaches the Cloud copy

Sync sends small JSON records, so a document's bytes go separately and first. The Clinic PC sends each piece to the Sync address itself (`/api/sync?document=…&chunk=…`, so whatever lets the Clinic PC through the Cloud copy's login covers the bytes too), then announces the document in the ordinary batch. The Cloud copy refuses the announcement until every piece has arrived, so it never lists a document it cannot open. A removal is sent as the same record with the time it was removed, and the Cloud copy deletes the document and its bytes.

The Clinic PC remembers which pieces got through, so an upload cut off by a bad connection carries on where it stopped. Documents are sent after all other waiting records, and one that fails is skipped until the next exchange, so they never hold anything else back.

## Considered options

- **A folder of files beside the database.** Rejected because every backup, restore and USB archive would need to learn about the folder, and a restore could leave the two out of step.
- **Cloudflare R2 for the Cloud copy's bytes.** The better home once documents are many: D1 caps a database at 10 GB (500 MB on the free plan). Not done now because it needs a bucket provisioned and a second storage path, and D1 holds the same pieces with the code the Clinic PC already uses. Moving later changes only where the Cloud copy keeps a piece.
- **Letting the phone add documents.** Deferred. It would be a new kind of Phone-issued record (ADR 0003) whose bytes the Clinic PC collects.

## Consequences

- The database grows by the size of every document, and so does each of the 30 Local backups. The 10 MB limit keeps one document from being large; it does not cap the total. USB backups are built in memory, so a database of several gigabytes would need that changed first.
- On the Cloud copy a piece is stored as base64 text, because D1 moves text far more cheaply than a BLOB. The same column holds raw bytes on the Clinic PC.
- The app window on the Clinic PC never displays a Patient document. It writes a copy to `opened-documents` in its data folder and hands it to Windows to open, and it clears that folder when the app starts and closes. This keeps to ADR 0001: files from outside are not decoded by the unpatched Chromium. A phone opens a document in its own, current browser.
- Because Windows opens the copy by its extension, the kind is checked from the content both when a document is added and again before it is opened, and the copy is always named with the extension of its real kind.
- Removing a document deletes it everywhere Sync reaches. It remains in earlier backups until they age out.
