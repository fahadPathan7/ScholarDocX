import { api, listRecords, updateRecord, deleteRecord } from "./api";
import { NewsResponse } from "./newsApi";

export interface CatalogEntry {
  id: string;
  canonical_name: string;
  aliases: string[];
  sponsor: string;
  levels: string[];
  destinations: string[];
  funding: { coverage: "full" | "partial"; notes?: string | null };
  cycle_months: string[];
  portal_url: string;
  blurb: string;
  in_library: boolean;
}

export interface ScholarshipOpportunity {
  id: string;
  source: "catalog" | "hunt" | "bookmark_migration" | "deep_hunt";
  canonical_name: string;
  normalized_url: string;
  status: "Found" | "Vetting" | "Applying" | "Submitted" | "Result";
  sponsor: string | null;
  degree_levels: string[];
  destinations: string[];
  eligible_nationalities: string[];
  funding: { coverage?: "full" | "partial"; notes?: string | null };
  deadlines: { date: string; label?: string | null }[];
  requirements: string[];
  field_confidence: Record<string, number>;
  application_url: string | null;
  linked_sheet_id: string | null;
  linked_row_snapshot: string | null;
  last_deadline_notified_at: string | null;
  deep_hunt_run_id: string | null;
  created_at: string;
  updated_at: string;
}

export const getScholarshipCatalog = async (filters?: {
  levels?: string[];
  destinations?: string[];
  funding_coverage?: string[];
}): Promise<CatalogEntry[]> => {
  const params = new URLSearchParams();
  (filters?.levels || []).forEach((v) => params.append("levels", v));
  (filters?.destinations || []).forEach((v) => params.append("destinations", v));
  (filters?.funding_coverage || []).forEach((v) => params.append("funding_coverage", v));
  const qs = params.toString();
  return api.get<CatalogEntry[]>(`/scholarship-catalog${qs ? `?${qs}` : ""}`);
};

export const checkScholarshipCycle = async (catalogId: string): Promise<NewsResponse> => {
  return api.post<NewsResponse>(`/scholarship-catalog/${catalogId}/check-cycle`, {});
};

export const analyzeScholarshipOpportunity = async (payload: {
  source_url: string;
  source_title?: string;
  source_snippet?: string;
}): Promise<ScholarshipOpportunity> => {
  return api.post<ScholarshipOpportunity>("/scholarship-opportunities/analyze", payload);
};

export const listScholarshipOpportunities = async (): Promise<ScholarshipOpportunity[]> => {
  return listRecords<ScholarshipOpportunity>("scholarship-opportunities");
};

export const updateScholarshipOpportunity = async (
  id: string,
  data: Partial<
    Pick<ScholarshipOpportunity, "status" | "linked_sheet_id" | "linked_row_snapshot" | "last_deadline_notified_at">
  >,
): Promise<ScholarshipOpportunity> => {
  return updateRecord<ScholarshipOpportunity>("scholarship-opportunities", id, data);
};

export const deleteScholarshipOpportunity = async (id: string): Promise<void> => {
  await deleteRecord("scholarship-opportunities", id);
};
