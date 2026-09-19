"use client";

import { useEffect, useState } from "react";
import {
  getClinicPc,
  minimumPassphraseLength,
  type BackupOverview,
  type RestoreResult,
  type UsbDrive,
} from "./clinic-pc";

const reasonLabels = {
  daily: "Daily",
  "on-close": "When the app closed",
  manual: "Taken by hand",
  "before-restore": "Before a restore",
} as const;

type Message = {
  text: string;
  tone?: "done" | "attention" | "error";
};

function formatWhen(iso: string) {
  // Numeric day-first dates, as everywhere else in the app.
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
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

function MessageNotice({ message }: { message: Message }) {
  const toneClass =
    message.tone === "done"
      ? "notice-done"
      : message.tone === "attention"
        ? "notice-attention"
        : message.tone === "error"
          ? "notice-error"
          : "";

  return (
    <p role="status" className={`notice mt-3 ${toneClass}`}>
      {message.text}
    </p>
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
  const [message, setMessage] = useState<Message | null>(null);
  const tooShort = passphrase.length < minimumPassphraseLength;
  const mismatch = confirmation !== passphrase;

  const save = async () => {
    try {
      await getClinicPc()!.backups.setPassphrase(passphrase);
      setPassphrase("");
      setConfirmation("");
      setEditing(false);
      setMessage({
        text: "Backup passphrase saved on this computer.",
        tone: "done",
      });
      onSaved();
    } catch {
      setMessage({
        text: "The passphrase could not be saved. Try again.",
        tone: "error",
      });
    }
  };

  return (
    <article aria-labelledby="backup-passphrase-heading" className="panel">
      <div className="panel-section">
        <h2 id="backup-passphrase-heading" className="section-title">
          Backup passphrase
        </h2>
        <p className="hint mt-2 max-w-2xl">
          USB backups are locked with this passphrase. Write it down and keep
          it at the clinic: without it, a USB backup cannot be restored on
          another computer.
        </p>
        {!editing ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="m-0 font-medium">
              Passphrase is set on this computer.
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setEditing(true)}
            >
              Change passphrase
            </button>
          </div>
        ) : (
          <form
            className="mt-4 grid max-w-xl gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!tooShort && !mismatch) void save();
            }}
          >
            <label>
              <span className="field-label">New passphrase</span>
              <input
                type="password"
                className="input-field"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                autoComplete="new-password"
              />
            </label>
            <label>
              <span className="field-label">Type it again</span>
              <input
                type="password"
                className="input-field"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="new-password"
              />
            </label>
            <p className="hint">
              {tooShort
                ? `Use at least ${minimumPassphraseLength} characters.`
                : mismatch
                  ? "The two entries do not match yet."
                  : "Ready to save."}
            </p>
            <div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={tooShort || mismatch}
              >
                Save passphrase
              </button>
            </div>
          </form>
        )}
        {message && <MessageNotice message={message} />}
      </div>
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
  const [message, setMessage] = useState<Message | null>(null);
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
    setMessage({ text: `Backing up to ${drive.label}…` });
    try {
      const backup = await getClinicPc()!.backups.backUpToUsb(drive.id);
      setMessage({
        text: `Backup saved and checked on ${drive.label} (${formatSize(backup.bytes)}).`,
        tone: "done",
      });
      checkDrives();
    } catch {
      setMessage({
        text: `The backup to ${drive.label} failed. Check the drive and try again.`,
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreResult = (
    result: RestoreResult,
    target: { driveId: string; backupId: string },
  ) => {
    if (result.status === "restored") return onRestored();
    if (result.status === "passphrase-required") {
      setPassphraseFor(target);
      setMessage({
        text: "Type the passphrase this backup was locked with to restore it.",
        tone: "attention",
      });
    } else if (result.status === "wrong-passphrase") {
      setMessage({
        text: "That passphrase does not unlock this backup.",
        tone: "error",
      });
    } else {
      setMessage({ text: result.message, tone: "error" });
    }
  };

  const restore = async (
    driveId: string,
    backupId: string,
    when: string,
    passphrase?: string,
  ) => {
    if (passphrase === undefined && !confirmRestore(when)) return;
    setBusy(true);
    setMessage({ text: "Restoring…" });
    try {
      handleRestoreResult(
        await getClinicPc()!.backups.restoreUsb(
          driveId,
          backupId,
          passphrase,
        ),
        { driveId, backupId },
      );
    } catch {
      setMessage({
        text: "The restore failed. The current records were not changed.",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <article aria-labelledby="usb-backup-heading" className="panel">
      <div className="panel-section">
        <div className="panel-header items-start">
          <div>
            <h2 id="usb-backup-heading" className="section-title">
              USB drive
            </h2>
            <p className="hint mt-2 max-w-2xl">
              Plug in a USB drive to keep a locked copy of every record away
              from this computer.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={checkDrives}
            disabled={busy}
          >
            Check for USB drives
          </button>
        </div>
        {drives === null ? (
          <p className="status-line" role="status">
            Looking for USB drives…
          </p>
        ) : drives.length === 0 ? (
          <p className="status-line" role="status">
            No USB drive found. Plug one in, then check again.
          </p>
        ) : (
          <ul className="divide-y divide-rule border-t border-rule">
            {drives.map((drive) => (
              <li key={drive.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <b>{drive.label}</b>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy || !hasPassphrase}
                    onClick={() => void backUp(drive)}
                  >
                    Back up to {drive.label}
                  </button>
                </div>
                {!hasPassphrase && (
                  <p className="hint mt-2">Set the backup passphrase first.</p>
                )}
                {drive.backups.length > 0 && (
                  <ul
                    aria-label={`Backups on ${drive.label}`}
                    className="mt-3 divide-y divide-rule border-t border-rule"
                  >
                    {drive.backups.map((backup) => (
                      <li
                        key={backup.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-2"
                      >
                        <span className="flex flex-wrap gap-x-3">
                          <span>{formatWhen(backup.createdAt)}</span>
                          <span className="text-graphite">
                            {formatSize(backup.bytes)}
                          </span>
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={busy}
                          onClick={() =>
                            void restore(
                              drive.id,
                              backup.id,
                              backup.createdAt,
                            )
                          }
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
            className="mt-4 flex max-w-xl flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const backup = drives
                ?.find((drive) => drive.id === passphraseFor.driveId)
                ?.backups.find((item) => item.id === passphraseFor.backupId);
              if (backup) {
                void restore(
                  passphraseFor.driveId,
                  passphraseFor.backupId,
                  backup.createdAt,
                  typedPassphrase,
                );
              }
            }}
          >
            <label className="min-w-48 flex-1">
              <span className="field-label">Passphrase for this backup</span>
              <input
                type="password"
                className="input-field"
                value={typedPassphrase}
                onChange={(event) => setTypedPassphrase(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || !typedPassphrase}
            >
              Unlock and restore
            </button>
          </form>
        )}
        {message && <MessageNotice message={message} />}
      </div>
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
  const [message, setMessage] = useState<Message | null>(null);
  const latest = overview.localBackups[0];

  const backUpNow = async () => {
    setBusy(true);
    try {
      await getClinicPc()!.backups.backUpNow();
      setMessage({
        text: "Backup saved on this computer.",
        tone: "done",
      });
      onChanged();
    } catch {
      setMessage({
        text: "The backup could not be saved. Try again.",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const restore = async (backupId: string, when: string) => {
    if (!confirmRestore(when)) return;
    setBusy(true);
    setMessage({ text: "Restoring…" });
    try {
      const result = await getClinicPc()!.backups.restoreLocal(backupId);
      if (result.status === "restored") return onRestored();
      setMessage({
        text: result.status === "failed" ? result.message : "The restore failed.",
        tone: "error",
      });
    } catch {
      setMessage({
        text: "The restore failed. The current records were not changed.",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <article aria-labelledby="local-backups-heading" className="panel">
      <div className="panel-section">
        <div className="panel-header items-start">
          <div>
            <h2 id="local-backups-heading" className="section-title">
              On this computer
            </h2>
            <p className="hint mt-2 max-w-2xl">
              A copy is saved every day and whenever the app closes. The last
              30 are kept.{" "}
              {latest
                ? `Latest: ${formatWhen(latest.createdAt)}.`
                : "No backup yet."}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void backUpNow()}
          >
            Back up now
          </button>
        </div>
        {message && <MessageNotice message={message} />}
        {overview.localBackups.length > 0 && (
          <ul
            aria-label="Backups on this computer"
            className="mt-4 divide-y divide-rule border-t border-rule"
          >
            {overview.localBackups.map((backup) => (
              <li
                key={backup.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2"
              >
                <span className="flex flex-wrap gap-x-3">
                  <span>{formatWhen(backup.createdAt)}</span>
                  <span>{reasonLabels[backup.reason]}</span>
                  <span className="text-graphite">
                    {formatSize(backup.bytes)}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => void restore(backup.id, backup.createdAt)}
                >
                  Restore this backup
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
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
      <section className="max-w-4xl">
        <p>Backups are managed on the Clinic PC.</p>
      </section>
    );
  }

  const restored =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("restored");

  return (
    <section className="grid max-w-4xl gap-4">
      {restored && (
        <p role="status" className="notice notice-done">
          Backup restored. A safety copy of the previous records is listed
          below.
        </p>
      )}
      {overview === null ? (
        <p className="status-line" role="status">
          Loading backups…
        </p>
      ) : (
        <>
          <LocalBackupsCard
            overview={overview}
            onChanged={reload}
            onRestored={onRestored}
          />
          <UsbCard
            hasPassphrase={overview.hasPassphrase}
            onRestored={onRestored}
          />
          <PassphraseCard
            hasPassphrase={overview.hasPassphrase}
            onSaved={reload}
          />
        </>
      )}
    </section>
  );
}
