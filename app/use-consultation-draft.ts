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
  createEmptyConsultation,
  toLocalDateInputValue,
  type Consultation,
  type CompletedPrescriptionSnapshot,
  type PriorVisitSnapshot,
} from "./consultation-model";

export type DraftSaveState =
  | "loading"
  | "saved"
  | "unsaved"
  | "saving"
  | "failed";

export type PriorVisitsLoadState = "loading" | "ready" | "failed";
export type CompletionState = "idle" | "completing" | "failed" | "completed";

type PriorVisitsLoadResult =
  | { request: number; state: "ready"; visits: PriorVisitSnapshot[] }
  | { request: number; state: "failed" };

const autosaveDelayMs = 800;

export function useConsultationDraft(): {
  consultation: Consultation;
  setConsultation: Dispatch<SetStateAction<Consultation>>;
  saveState: DraftSaveState;
  savedAt: string | null;
  hasUnconfirmedChanges: boolean;
  saveDraft: () => Promise<void>;
  completionState: CompletionState;
  completedSnapshot: CompletedPrescriptionSnapshot | null;
  completePrescription: () => Promise<void>;
  startAnotherConsultation: () => Promise<void>;
  priorVisits: PriorVisitSnapshot[];
  priorVisitsState: PriorVisitsLoadState;
  reloadPriorVisits: () => Promise<void>;
} {
  const repository = useMemo<ConsultationDraftRepository>(
    () => createConsultationDraftRepository(),
    [],
  );
  const [consultation, setConsultation] =
    useState<Consultation>(createDemoConsultation);
  const [saveState, setSaveState] = useState<DraftSaveState>("loading");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [completionState, setCompletionState] =
    useState<CompletionState>("idle");
  const [completedSnapshot, setCompletedSnapshot] =
    useState<CompletedPrescriptionSnapshot | null>(null);
  const [priorVisits, setPriorVisits] = useState<PriorVisitSnapshot[]>([]);
  const [priorVisitsState, setPriorVisitsState] =
    useState<PriorVisitsLoadState>("loading");
  const consultationRef = useRef(consultation);
  const hydratedRef = useRef(false);
  const revisionRef = useRef(0);
  const editFingerprintRef = useRef("");
  const priorVisitsRequestRef = useRef(0);

  useEffect(() => {
    let active = true;
    const initialConsultation = {
      ...createDemoConsultation(),
      consultationDate: toLocalDateInputValue(new Date()),
    };

    repository.load().then(
      (draft) => {
        if (!active) return;
        const restoredConsultation = draft
          ? {
              ...draft.consultation,
              linkedPriorVisit: draft.consultation.linkedPriorVisit ?? null,
            }
          : initialConsultation;
        const fingerprint = JSON.stringify(restoredConsultation);
        revisionRef.current = draft?.revision ?? 0;
        editFingerprintRef.current = fingerprint;
        consultationRef.current = restoredConsultation;
        hydratedRef.current = true;
        setConsultation(restoredConsultation);
        setSavedAt(draft?.updatedAt ?? null);
        setCompletedSnapshot(draft?.completedSnapshot ?? null);
        setCompletionState(
          draft?.lifecycle === "completed" ? "completed" : "idle",
        );
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

  const requestPriorVisits = useCallback(
    async (): Promise<PriorVisitsLoadResult> => {
      const request = priorVisitsRequestRef.current + 1;
      priorVisitsRequestRef.current = request;
      try {
        const visits = await repository.listPriorVisits();
        return { request, state: "ready", visits };
      } catch {
        return { request, state: "failed" };
      }
    },
    [repository],
  );

  const commitPriorVisits = useCallback((result: PriorVisitsLoadResult) => {
    if (result.request !== priorVisitsRequestRef.current) return;
    if (result.state === "ready") setPriorVisits(result.visits);
    setPriorVisitsState(result.state);
  }, []);

  const reloadPriorVisits = useCallback(async () => {
    setPriorVisitsState("loading");
    commitPriorVisits(await requestPriorVisits());
  }, [commitPriorVisits, requestPriorVisits]);

  useEffect(() => {
    void requestPriorVisits().then(commitPriorVisits);
    return () => {
      priorVisitsRequestRef.current += 1;
    };
  }, [commitPriorVisits, requestPriorVisits]);

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
          return true;
        }
        setSaveState("failed");
        return false;
      } catch {
        if (
          revision === revisionRef.current &&
          snapshotFingerprint === JSON.stringify(consultationRef.current)
        ) {
          setSaveState("failed");
        }
        return false;
      }
    },
    [repository],
  );

  const saveDraft = useCallback(async () => {
    if (!hydratedRef.current) return;
    await performSave(consultationRef.current, revisionRef.current);
  }, [performSave]);

  const completePrescription = useCallback(async () => {
    if (!hydratedRef.current || completedSnapshot) return;
    setCompletionState("completing");
    const revision = revisionRef.current;
    const reviewedConsultation = consultationRef.current;
    await performSave(reviewedConsultation, revision);
    try {
      const result = await repository.complete(revision, reviewedConsultation);
      setCompletedSnapshot(result.snapshot);
      consultationRef.current = result.snapshot.consultation;
      editFingerprintRef.current = JSON.stringify(result.snapshot.consultation);
      setConsultation(result.snapshot.consultation);
      setSavedAt(result.snapshot.completedAt);
      setSaveState("saved");
      setCompletionState("completed");
    } catch {
      setCompletionState("failed");
    }
  }, [completedSnapshot, performSave, repository]);

  const startAnotherConsultation = useCallback(async () => {
    if (!completedSnapshot) return;
    const draft = await repository.startNew(
      createEmptyConsultation(
        completedSnapshot.doctor.name,
        toLocalDateInputValue(new Date()),
      ),
    );
    revisionRef.current = draft.revision;
    editFingerprintRef.current = JSON.stringify(draft.consultation);
    consultationRef.current = draft.consultation;
    setConsultation(draft.consultation);
    setSavedAt(draft.updatedAt);
    setSaveState("saved");
    setCompletionState("idle");
    setCompletedSnapshot(null);
  }, [completedSnapshot, repository]);

  useEffect(() => {
    if (saveState !== "unsaved" || completedSnapshot) return;
    const timer = window.setTimeout(() => {
      void performSave(consultationRef.current, revisionRef.current);
    }, autosaveDelayMs);
    return () => window.clearTimeout(timer);
  }, [completedSnapshot, fingerprint, performSave, saveState]);

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
    completionState,
    completedSnapshot,
    completePrescription,
    startAnotherConsultation,
    priorVisits,
    priorVisitsState,
    reloadPriorVisits,
  };
}
