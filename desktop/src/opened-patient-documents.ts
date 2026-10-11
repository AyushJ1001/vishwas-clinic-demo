import { shell } from "electron";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  patientDocumentFileName,
  patientDocumentTypeOf,
  type OpenPatientDocumentResult,
} from "../../app/patient-document-model";

/**
 * ADR 0005: the app window never displays a Patient document itself. A copy
 * is written beside the Clinic records and handed to Windows to open, and
 * the copies are thrown away when the app starts and when it closes.
 */
export class OpenedPatientDocuments {
  private readonly directory: string;

  constructor(dataDirectory: string) {
    this.directory = path.join(dataDirectory, "opened-documents");
    this.clear();
  }

  async open(name: string, bytes: Uint8Array): Promise<OpenPatientDocumentResult> {
    // Checked again here: Windows runs whatever a file's extension says it is.
    const contentType = patientDocumentTypeOf(bytes);
    if (!contentType) {
      return { status: "failed", message: "This file is not a PDF, JPG or PNG." };
    }
    try {
      const folder = path.join(this.directory, randomUUID());
      mkdirSync(folder, { recursive: true });
      const file = path.join(folder, patientDocumentFileName(name, contentType));
      writeFileSync(file, bytes);
      const problem = await shell.openPath(file);
      return problem
        ? { status: "failed", message: problem }
        : { status: "opened" };
    } catch (error) {
      return {
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  clear() {
    try {
      rmSync(this.directory, { recursive: true, force: true });
    } catch {
      // A viewer still has a copy open; it goes the next time.
    }
  }
}
