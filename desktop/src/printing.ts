import type { WebContents } from "electron";
import {
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import type {
  ClinicPrinter,
  PrintResult,
  PrintSettings,
} from "../shared/local-database-protocol";

const defaultSettings: PrintSettings = {
  printerName: null,
  paper: "a5",
  askEveryTime: false,
};

function isPrintSettings(value: unknown): value is PrintSettings {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PrintSettings>;
  return (
    (candidate.printerName === null ||
      typeof candidate.printerName === "string") &&
    (candidate.paper === "a5" || candidate.paper === "a5-on-a4-top") &&
    typeof candidate.askEveryTime === "boolean"
  );
}

function failed(message: string): PrintResult {
  return { status: "failed", message };
}

/** Owns the Clinic PC's persisted printer choices and Electron print jobs. */
export class Printing {
  private readonly settingsFile: string;

  constructor(dataDirectory: string) {
    this.settingsFile = path.join(dataDirectory, "printing.json");
  }

  settings(): PrintSettings {
    if (!existsSync(this.settingsFile)) return { ...defaultSettings };
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.settingsFile, "utf8"));
      return isPrintSettings(parsed) ? parsed : { ...defaultSettings };
    } catch {
      return { ...defaultSettings };
    }
  }

  saveSettings(settings: PrintSettings): void {
    if (!isPrintSettings(settings)) {
      throw new Error("The print settings were not valid.");
    }
    writeFileSync(this.settingsFile, `${JSON.stringify(settings, null, 2)}\n`);
  }

  async listPrinters(contents: WebContents): Promise<ClinicPrinter[]> {
    const printers = await contents.getPrintersAsync();
    return printers.map(({ name, displayName, isDefault }) => ({
      name,
      displayName,
      isDefault,
    }));
  }

  async print(
    contents: WebContents,
    alwaysShowOptions = false,
  ): Promise<PrintResult> {
    try {
      const printers = await this.listPrinters(contents);
      if (printers.length === 0) return { status: "no-printer" };

      const settings = this.settings();
      return await new Promise<PrintResult>((resolve) => {
        try {
          contents.print(
            {
              silent: alwaysShowOptions ? false : !settings.askEveryTime,
              printBackground: true,
              ...(settings.printerName
                ? { deviceName: settings.printerName }
                : {}),
              pageSize: settings.paper === "a5" ? "A5" : "A4",
              margins: { marginType: "none" },
            },
            (success, failureReason) => {
              if (success) {
                resolve({ status: "printed" });
              } else if (/cancel/i.test(failureReason)) {
                resolve({ status: "cancelled" });
              } else {
                resolve(failed(failureReason || "The printer did not accept the job"));
              }
            },
          );
        } catch (error) {
          resolve(
            failed(
              error instanceof Error ? error.message : "The print job could not start",
            ),
          );
        }
      });
    } catch (error) {
      return failed(
        error instanceof Error ? error.message : "The printers could not be checked",
      );
    }
  }
}
