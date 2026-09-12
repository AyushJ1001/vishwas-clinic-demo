"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  createConsultationDraftRepository,
  type ConsultationDraftRepository,
} from "./consultation-draft-repository";
import {
  createDemoConsultation,
  toLocalDateInputValue,
  type Consultation,
} from "./consultation-model";

export type DraftSaveState =
  | "loading"
  | "saved"
  | "unsaved"
  | "saving"
  | "failed";

const autosaveDelayMs = 800;

export function useConsultationDraft(): {
  consultation: Consultation;
  setConsultation: Dispatch<SetStateAction<Consultation>>;
  saveState: DraftSaveState;
  savedAt: string | null;
  hasUnconfirmedChanges: boolean;
  saveDraft: () => Promise<void>;
} {
  const repository = useMemo<ConsultationDraftRepository>(
    () => createConsultationDraftRepository(),
    [],
  );
  const [consultation, setConsultation] =
    useState<Consultation>(createDemoConsultation);
  const [saveState, setSaveState] = useState<DraftSaveState>("loading");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const consultationRef = useRef(consultation);
  const hydratedRef = useRef(false);
  const revisionRef = useRef(0);
  const editFingerprintRef = useRef("");

  useEffect(() => {
    let active = true;
    const initialConsultation = {
      ...createDemoConsultation(),
      consultationDate: toLocalDateInputValue(new Date()),
    };

    repository.load().then(
      (draft) => {
        if (!active) return;
        const restoredConsultation = draft?.consultation ?? initialConsultation;
        const fingerprint = JSON.stringify(restoredConsultation);
        revisionRef.current = draft?.revision ?? 0;
        editFingerprintRef.current = fingerprint;
        consultationRef.current = restoredConsultation;
        hydratedRef.current = true;
        setConsultation(restoredConsultation);
        setSavedAt(draft?.updatedAt ?? null);
        setSaveState("saved");
      },
      () => {
        if (!active) return;
        const fingerprint = JSON.stringify(initialConsultation);
        revisionRef.current = 1;
        consultationRef.current = initialConsultation;
        editFingerprintRef.current = fingerprint;
        hydratedRef.current = true;
        setConsultation(initialConsultation);
        setSaveState("failed");
      },
    );

    return () => {
      active = false;
    };
  }, [repository]);

  const fingerprint = useMemo(() => JSON.stringify(consultation), [consultation]);

  useEffect(() => {
    consultationRef.current = consultation;
    if (!hydratedRef.current || fingerprint === editFingerprintRef.current) {
      return;
    }
    editFingerprintRef.current = fingerprint;
    revisionRef.current += 1;
    setSaveState("unsaved");
  }, [consultation, fingerprint]);

  const performSave = useCallback(
    async (snapshot: Consultation, revision: number) => {
      const snapshotFingerprint = JSON.stringify(snapshot);
      setSaveState("saving");
      try {
        const result = await repository.save(snapshot, revision);
        const isLatestEdit =
          revision === revisionRef.current &&
          snapshotFingerprint === JSON.stringify(consultationRef.current);
        if (!isLatestEdit) return;

        const savedFingerprint = JSON.stringify(result.draft.consultation);
        if (
          result.draft.revision === revision &&
          savedFingerprint === snapshotFingerprint
        ) {
          setSavedAt(result.draft.updatedAt);
          setSaveState("saved");
          return;
        }
        setSaveState("failed");
      } catch {
        if (
          revision === revisionRef.current &&
          snapshotFingerprint === JSON.stringify(consultationRef.current)
        ) {
          setSaveState("failed");
        }
      }
    },
    [repository],
  );

  const saveDraft = useCallback(async () => {
    if (!hydratedRef.current) return;
    await performSave(consultationRef.current, revisionRef.current);
  }, [performSave]);

  useEffect(() => {
    if (saveState !== "unsaved") return;
    const timer = window.setTimeout(() => {
      void performSave(consultationRef.current, revisionRef.current);
    }, autosaveDelayMs);
    return () => window.clearTimeout(timer);
  }, [fingerprint, performSave, saveState]);

  const hasUnconfirmedChanges =
    saveState === "unsaved" ||
    saveState === "saving" ||
    saveState === "failed";
  useEffect(() => {
    if (!hasUnconfirmedChanges) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [hasUnconfirmedChanges]);

  return {
    consultation,
    setConsultation,
    saveState,
    savedAt,
    hasUnconfirmedChanges,
    saveDraft,
  };
}
