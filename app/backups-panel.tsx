"use client";

import { useEffect, useState } from "react";
import {
  getClinicPc,
  minimumPassphraseLength,
  type BackupOverview,
  type RestoreResult,
  type UsbDrive,
} from "./clinic-pc";

const cardClass =
  "col-span-12 rounded-[30px] border border-[#15362f]/10 bg-[#fbfaf5] p-6 lg:p-9";
const primaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-[#15362f] px-5 py-2 text-sm font-bold text-white disabled:opacity-50";
const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-[#15362f]/20 bg-white px-4 py-2 text-sm font-bold text-[#15362f] disabled:opacity-50";

const reasonLabels = {
  daily: "Daily",
  "on-close": "When the app closed",
  manual: "Taken by hand",
  "before-restore": "Before a restore",
} as const;

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function confirmRestore(when: string) {
  return window.confirm(
    `Replace all current records with the backup from ${formatWhen(when)}?\n\n` +
      "A safety copy of the current records is saved first.",
  );
}

function PassphraseCard({
  hasPassphrase,
  onSaved,
}: {
  hasPassphrase: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(!hasPassphrase);
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const tooShort = passphrase.length < minimumPassphraseLength;
  const mismatch = confirmation !== passphrase;

  const save = async () => {
    try {
      await getClinicPc()!.backups.setPassphrase(passphrase);
      setPassphrase("");
      setConfirmation("");
      setEditing(false);
      setMessage("Backup passphrase saved on this computer.");
      onSaved();
    } catch {
      setMessage("The passphrase could not be saved. Try again.");
    }
  };

  return (
    <article aria-labelledby="backup-passphrase-heading" className={cardClass}>
      <h2 id="backup-passphrase-heading" className="text-2xl font-medium tracking-[-.03em]">
        Backup passphrase
      </h2>
      <p className="mt-2 max-w-2xl text-base leading-relaxed text-[#536760]">
        USB backups are locked with this passphrase. Write it down and keep it
        at the clinic: without it, a USB backup cannot be restored on another
        computer.
      </p>
      {!editing ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold">Passphrase is set on this computer.</p>
          <button type="button" className={secondaryButtonClass} onClick={() => setEditing(true)}>
            Change passphrase
          </button>
        </div>
      ) : (
        <form
          className="mt-5 grid max-w-xl gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!tooShort && !mismatch) void save();
          }}
        >
          <label className="grid gap-1 text-sm font-semibold">
            New passphrase
            <input
              type="password"
              className="input-field"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Type it again
            <input
              type="password"
              className="input-field"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="new-password"
            />
          </label>
          <p className="text-sm text-[#536760]">
            {tooShort
              ? `Use at least ${minimumPassphraseLength} characters.`
              : mismatch
                ? "The two entries do not match yet."
                : "Ready to save."}
          </p>
          <div>
            <button type="submit" className={primaryButtonClass} disabled={tooShort || mismatch}>
              Save passphrase
            </button>
          </div>
        </form>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm font-semibold">
          {message}
        </p>
      )}
    </article>
  );
}

function UsbCard({
  hasPassphrase,
  onRestored,
}: {
  hasPassphrase: boolean;
  onRestored: () => void;
}) {
  const [drives, setDrives] = useState<UsbDrive[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [passphraseFor, setPassphraseFor] = useState<{
    driveId: string;
    backupId: string;
  } | null>(null);
  const [typedPassphrase, setTypedPassphrase] = useState("");

  const [drivesCheck, setDrivesCheck] = useState(0);

  useEffect(() => {
    let current = true;
    void getClinicPc()!
      .backups.listUsbDrives()
      .then((found) => {
        if (current) setDrives(found);
      });
    return () => {
      current = false;
    };
  }, [drivesCheck]);

  const checkDrives = () => {
    setDrives(null);
    setDrivesCheck((check) => check + 1);
  };

  const backUp = async (drive: UsbDrive) => {
    setBusy(true);
    setMessage(`Backing up to ${drive.label}…`);
    try {
      const backup = await getClinicPc()!.backups.backUpToUsb(drive.id);
      setMessage(`Backup saved and checked on ${drive.label} (${formatSize(backup.bytes)}).`);
      checkDrives();
    } catch {
      setMessage(`The backup to ${drive.label} failed. Check the drive and try again.`);
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreResult = (result: RestoreResult, target: { driveId: string; backupId: string }) => {
    if (result.status === "restored") return onRestored();
    if (result.status === "passphrase-required") {
      setPassphraseFor(target);
      setMessage("Type the passphrase this backup was locked with to restore it.");
    } else if (result.status === "wrong-passphrase") {
      setMessage("That passphrase does not unlock this backup.");
    } else {
      setMessage(result.message);
    }
  };

  const restore = async (driveId: string, backupId: string, when: string, passphrase?: string) => {
    if (passphrase === undefined && !confirmRestore(when)) return;
    setBusy(true);
    setMessage("Restoring…");
    try {
      handleRestoreResult(
        await getClinicPc()!.backups.restoreUsb(driveId, backupId, passphrase),
        { driveId, backupId },
      );
    } catch {
      setMessage("The restore failed. The current records were not changed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article aria-labelledby="usb-backup-heading" className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="usb-backup-heading" className="text-2xl font-medium tracking-[-.03em]">
            USB drive
          </h2>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-[#536760]">
            Plug in a USB drive to keep a locked copy of every record away from
            this computer.
          </p>
        </div>
        <button type="button" className={secondaryButtonClass} onClick={checkDrives} disabled={busy}>
          Check for USB drives
        </button>
      </div>
      {drives === null ? (
        <p className="mt-5 text-sm">Looking for USB drives…</p>
      ) : drives.length === 0 ? (
        <p className="mt-5 text-sm font-semibold">No USB drive found. Plug one in, then check again.</p>
      ) : (
        <ul className="mt-5 grid gap-5">
          {drives.map((drive) => (
            <li key={drive.id} className="rounded-2xl border border-[#15362f]/10 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <b>{drive.label}</b>
                <button
                  type="button"
                  className={primaryButtonClass}
                  disabled={busy || !hasPassphrase}
                  onClick={() => void backUp(drive)}
                >
                  Back up to {drive.label}
                </button>
              </div>
              {!hasPassphrase && (
                <p className="mt-2 text-sm text-[#536760]">Set the backup passphrase first.</p>
              )}
              {drive.backups.length > 0 && (
                <ul aria-label={`Backups on ${drive.label}`} className="mt-4 grid gap-2">
                  {drive.backups.map((backup) => (
                    <li key={backup.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-[#15362f]/8 pt-2 text-sm">
                      <span>
                        {formatWhen(backup.createdAt)} · {formatSize(backup.bytes)}
                      </span>
                      <button
                        type="button"
                        className={secondaryButtonClass}
                        disabled={busy}
                        onClick={() => void restore(drive.id, backup.id, backup.createdAt)}
                      >
                        Restore this backup
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {passphraseFor && (
        <form
          className="mt-5 flex max-w-xl flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const backup = drives
              ?.find((drive) => drive.id === passphraseFor.driveId)
              ?.backups.find((b) => b.id === passphraseFor.backupId);
            if (backup) {
              void restore(passphraseFor.driveId, passphraseFor.backupId, backup.createdAt, typedPassphrase);
            }
          }}
        >
          <label className="grid flex-1 gap-1 text-sm font-semibold">
            Passphrase for this backup
            <input
              type="password"
              className="input-field"
              value={typedPassphrase}
              onChange={(event) => setTypedPassphrase(event.target.value)}
            />
          </label>
          <button type="submit" className={primaryButtonClass} disabled={busy || !typedPassphrase}>
            Unlock and restore
          </button>
        </form>
      )}
      {message && (
        <p role="status" className="mt-4 text-sm font-semibold">
          {message}
        </p>
      )}
    </article>
  );
}

function LocalBackupsCard({
  overview,
  onChanged,
  onRestored,
}: {
  overview: BackupOverview;
  onChanged: () => void;
  onRestored: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const latest = overview.localBackups[0];

  const backUpNow = async () => {
    setBusy(true);
    try {
      await getClinicPc()!.backups.backUpNow();
      setMessage("Backup saved on this computer.");
      onChanged();
    } catch {
      setMessage("The backup could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const restore = async (backupId: string, when: string) => {
    if (!confirmRestore(when)) return;
    setBusy(true);
    setMessage("Restoring…");
    try {
      const result = await getClinicPc()!.backups.restoreLocal(backupId);
      if (result.status === "restored") return onRestored();
      setMessage(result.status === "failed" ? result.message : "The restore failed.");
    } catch {
      setMessage("The restore failed. The current records were not changed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article aria-labelledby="local-backups-heading" className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="local-backups-heading" className="text-2xl font-medium tracking-[-.03em]">
            On this computer
          </h2>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-[#536760]">
            A copy is saved every day and whenever the app closes. The last 30
            are kept.{" "}
            {latest ? `Latest: ${formatWhen(latest.createdAt)}.` : "No backup yet."}
          </p>
        </div>
        <button type="button" className={primaryButtonClass} disabled={busy} onClick={() => void backUpNow()}>
          Back up now
        </button>
      </div>
      {message && (
        <p role="status" className="mt-4 text-sm font-semibold">
          {message}
        </p>
      )}
      {overview.localBackups.length > 0 && (
        <ul aria-label="Backups on this computer" className="mt-5 grid gap-2">
          {overview.localBackups.map((backup) => (
            <li key={backup.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-[#15362f]/8 pt-2 text-sm">
              <span>
                {formatWhen(backup.createdAt)} · {reasonLabels[backup.reason]} · {formatSize(backup.bytes)}
              </span>
              <button
                type="button"
                className={secondaryButtonClass}
                disabled={busy}
                onClick={() => void restore(backup.id, backup.createdAt)}
              >
                Restore this backup
              </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function BackupsPanel() {
  const [overview, setOverview] = useState<BackupOverview | null>(null);
  const clinicPc = getClinicPc();

  const [overviewCheck, setOverviewCheck] = useState(0);

  useEffect(() => {
    let current = true;
    void getClinicPc()
      ?.backups.overview()
      .then((found) => {
        if (current) setOverview(found);
      });
    return () => {
      current = false;
    };
  }, [overviewCheck]);

  const reload = () => setOverviewCheck((check) => check + 1);

  // Every screen reads records afresh after a restore.
  const onRestored = () => window.location.assign("/backups?restored=1");

  if (!clinicPc) {
    return (
      <section className="mx-auto max-w-[1500px] px-5 pb-40 lg:px-10">
        <p>Backups are managed on the Clinic PC.</p>
      </section>
    );
  }

  const restored =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("restored");

  return (
    <section className="mx-auto grid max-w-[1500px] grid-cols-12 items-start gap-5 px-5 pb-40 lg:px-10">
      {restored && (
        <p role="status" className="col-span-12 rounded-2xl bg-[#15362f] px-5 py-4 font-semibold text-white">
          Backup restored. A safety copy of the previous records is listed below.
        </p>
      )}
      {overview === null ? (
        <p className="col-span-12">Loading backups…</p>
      ) : (
        <>
          <PassphraseCard hasPassphrase={overview.hasPassphrase} onSaved={reload} />
          <UsbCard hasPassphrase={overview.hasPassphrase} onRestored={onRestored} />
          <LocalBackupsCard overview={overview} onChanged={reload} onRestored={onRestored} />
        </>
      )}
    </section>
  );
}
