import type {
  Consultation,
  ListPriorVisitsResult,
  PriorVisitSnapshot,
  SaveConsultationDraftResult,
  SavedConsultationDraft,
} from "./consultation-model";

export const demoDraftIdStorageKey = "vishwas-clinic-demo-draft-id";

export interface ConsultationDraftRepository {
  load(): Promise<SavedConsultationDraft | null>;
  listPriorVisits(): Promise<PriorVisitSnapshot[]>;
  save(
    consultation: Consultation,
    revision: number,
  ): Promise<SaveConsultationDraftResult>;
}

function getOrCreateDemoDraftId() {
  const savedId = window.localStorage.getItem(demoDraftIdStorageKey);
  if (savedId) return savedId;

  const id = `demo-${window.crypto.randomUUID()}`;
  window.localStorage.setItem(demoDraftIdStorageKey, id);
  return id;
}

export function createConsultationDraftRepository(): ConsultationDraftRepository {
  const request = async <T>(url: string, init?: RequestInit) => {
    const response = await fetch(url, init);
    if (!response.ok) {
      throw new Error(`Draft request failed with status ${response.status}`);
    }
    return response.json() as Promise<T>;
  };

  return {
    async load() {
      const response = await fetch(
        `/api/consultation-drafts/${encodeURIComponent(getOrCreateDemoDraftId())}`,
      );
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`Draft request failed with status ${response.status}`);
      }
      const body = (await response.json()) as { draft: SavedConsultationDraft };
      return body.draft;
    },
    async listPriorVisits() {
      const body = await request<ListPriorVisitsResult>("/api/prior-visits");
      return body.visits;
    },
    async save(consultation, revision) {
      return request<SaveConsultationDraftResult>(
        `/api/consultation-drafts/${encodeURIComponent(getOrCreateDemoDraftId())}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ consultation, revision }),
        },
      );
    },
  };
}
