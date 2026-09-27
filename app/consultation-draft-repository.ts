import type {
  CompleteConsultationDraftResult,
  Consultation,
  ListPriorVisitsResult,
  PriorVisitSnapshot,
  SaveConsultationDraftResult,
  SavedConsultationDraft,
} from "./consultation-model";

export const demoDraftIdStorageKey = "vishwas-clinic-demo-draft-id";

export interface ConsultationDraftRepository {
  load(): Promise<SavedConsultationDraft | null>;
  startNew(consultation: Consultation): Promise<SavedConsultationDraft>;
  listPriorVisits(patientId: string): Promise<PriorVisitSnapshot[]>;
  save(
    consultation: Consultation,
    revision: number,
  ): Promise<SaveConsultationDraftResult>;
  complete(
    revision: number,
    expectedConsultation: Consultation,
  ): Promise<CompleteConsultationDraftResult>;
}

function getOrCreateDemoDraftId() {
  const savedId = window.localStorage.getItem(demoDraftIdStorageKey);
  if (savedId) return savedId;

  const id = `draft-${window.crypto.randomUUID()}`;
  window.localStorage.setItem(demoDraftIdStorageKey, id);
  return id;
}

export function createConsultationDraftRepository(): ConsultationDraftRepository {
  // Other tabs may advance the recovery pointer without changing this editor.
  let activeDraftId: string | undefined;
  const getActiveDraftId = () => (activeDraftId ??= getOrCreateDemoDraftId());
  const request = async <T>(url: string, init?: RequestInit) => {
    const response = await fetch(url, init);
    if (!response.ok) {
      throw new Error(`Draft request failed with status ${response.status}`);
    }
    return response.json() as Promise<T>;
  };
  const saveToId = (id: string, consultation: Consultation, revision: number) =>
    request<SaveConsultationDraftResult>(
      `/api/consultation-drafts/${encodeURIComponent(id)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultation, revision }),
      },
    );

  return {
    async startNew(consultation) {
      const id = `draft-${window.crypto.randomUUID()}`;
      const result = await saveToId(id, consultation, 1);
      if (!result.accepted || result.draft.lifecycle !== "editing") {
        throw new Error("The next consultation could not be created.");
      }
      // Keep reopening the completed prescription until its successor is saved.
      window.localStorage.setItem(demoDraftIdStorageKey, id);
      activeDraftId = id;
      return result.draft;
    },
    async load() {
      const response = await fetch(
        `/api/consultation-drafts/${encodeURIComponent(getActiveDraftId())}`,
      );
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`Draft request failed with status ${response.status}`);
      }
      const body = (await response.json()) as { draft: SavedConsultationDraft };
      return body.draft;
    },
    async listPriorVisits(patientId) {
      const body = await request<ListPriorVisitsResult>(
        `/api/prior-visits?patientId=${encodeURIComponent(patientId)}`,
      );
      return body.visits;
    },
    async save(consultation, revision) {
      return saveToId(getActiveDraftId(), consultation, revision);
    },
    async complete(revision, expectedConsultation) {
      return request<CompleteConsultationDraftResult>(
        `/api/consultation-drafts/${encodeURIComponent(getActiveDraftId())}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision, expectedConsultation }),
        },
      );
    },
  };
}
