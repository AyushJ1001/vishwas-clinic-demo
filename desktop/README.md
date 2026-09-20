# Clinic PC desktop app

The Electron 22 app that runs Vishwas Clinic offline on the Windows 8.1 Clinic PC. See `docs/adr/0001-electron-22-desktop-app-on-windows-8-1.md` for why.

The desktop app reuses the web app's UI (`app/`) and its API routes and database modules (`app/api/`, `db/`) unchanged:

- `renderer/` builds the UI for Chromium 108. `renderer/local-api.ts` answers `fetch("/api/*")` inside the window with the same route modules the Cloudflare Worker serves.
- `renderer/shims/` stand in for `cloudflare:workers` and the `next/*` modules in the desktop build. The `DB` binding is `renderer/local-d1.ts`, a D1-compatible handle that sends SQL to the main process.
- `src/` is the main process. It serves the UI from the `clinic://app` scheme, blocks every remote request, and keeps Clinic records in `clinic.sqlite` under `%APPDATA%\Vishwas Clinic\data`. Set `CLINIC_DATA_DIR` to use another folder.

To send Clinic record changes to the Cloud copy, set `CLINIC_CLOUD_URL` to
the deployed site's origin and set `CLINIC_SYNC_DEVICE_KEY` to the same secret
value configured for the Cloudflare Worker. The Clinic PC sends in the
background; neither setting is needed for offline work.

## Commands

From `desktop/`, once:

```sh
npm ci --ignore-scripts   # better-sqlite3 must not compile against host Node.js
npm run setup             # Electron 22 binary + better-sqlite3 build for Electron 22
```

From the repository root:

```sh
npm run desktop:build     # renderer (Chromium 108 target) + main/preload bundles
npm run desktop:start     # launch the app
npm run test:desktop      # Playwright tests against the built app
```

Windows installers (64-bit and 32-bit) are built by the "Clinic PC installers" GitHub Actions workflow. To build them on Windows yourself, run `npm run package:windows` from `desktop/` after `desktop:build`. On Linux, building the installers needs Wine.

To test an installed copy instead of the dev build, set `CLINIC_PC_EXECUTABLE` to its `Vishwas Clinic.exe` (per-user installs go to `%LOCALAPPDATA%\Programs\vishwas-clinic-desktop`) and run `npm run test:desktop`. Set `CLINIC_TEST_USB_DRIVE` to a plugged-in drive's root (for example `D:\`) to run the backup tests against that drive, found the way the app finds it, instead of a stand-in folder. The tests empty its `Vishwas Clinic Backups` folder.
