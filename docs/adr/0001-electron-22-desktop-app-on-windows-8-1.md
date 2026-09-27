# Run on the Clinic PC as an Electron 22 desktop app

The Clinic PC runs Windows 8.1 on an old CPU with about 4 GB RAM, and attempts to upgrade it have failed, so it stays on 8.1. The app has to work fully offline for days, including printing. We package the existing React UI as an Electron 22 desktop app. Electron 22 is the last version that supports Windows 7, 8, and 8.1, and it bundles Chromium 108 and Node 16. The app stores Clinic records in a SQLite file on disk. The same UI keeps running on Cloudflare for phone use, and both builds share it through the repository interfaces, with one implementation that reads the local file and one that calls the Cloudflare API over HTTP.

## Considered options

- **Offline web app (PWA) in Supermium**, a Chromium fork still maintained for Windows 7 and 8.1. It would give a current, patched Chromium and automatic updates. We rejected it because patient records would live inside the browser profile, where clearing browsing data, a damaged profile, or a bad browser update can destroy them. It also depends on a browser with one maintainer.
- **A small local server plus a browser.** We rejected it because it has two moving parts to keep alive, and current Node.js no longer installs on Windows 8.1.

## Consequences

- Chromium 108 receives no security fixes. That is acceptable only because the app loads nothing but its own bundled code and never browses the web. Do not add remote content or arbitrary links inside the app window.
- The UI must work on Chromium 108 and be tested there. Tailwind v4 officially targets Chrome 111 and later.
- Updates download quietly and apply only on the next app start. The app backs up the database before a new version migrates it, and it never forces an update in the middle of a session.
- Printing goes straight to the configured printer at A5, with no dialog. There is an explicit "Print with options…" escape for exceptions.
- When the Clinic PC is upgraded or replaced, the same app moves to a current Electron release with almost no changes.
