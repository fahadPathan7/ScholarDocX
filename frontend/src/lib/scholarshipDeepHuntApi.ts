import { api } from "./api";
import { ScholarshipOpportunity } from "./scholarshipOpportunitiesApi";
// SCHOLARDOCX-0175: pure helpers + cost/progress types live in a DOM-free
// module so they can be unit-tested. Imported here for local use and
// re-exported for back-comat with existing importers.
import {
  formatCostEstimate,
  shouldShowFunnel,
  DEFAULT_MAX_SOURCES,
  DEFAULT_MAX_CREDITS,
  type RunCostEstimate,
  type DeepHuntRunProgress,
} from "./scholarshipHuntHelpers";

export {
  formatCostEstimate,
  shouldShowFunnel,
  DEFAULT_MAX_SOURCES,
  DEFAULT_MAX_CREDITS,
};
export type { RunCostEstimate, DeepHuntRunProgress };

export type DeepHuntRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type CreateDeepHuntRunRequest = {
  goal: string;
  degree_level?: string;
  destinations?: string[];
  intake_term?: string;
  field_of_study?: string;
};

// SCHOLARDOCX-0178: an accepted, deduped Search result before it is saved to
// the Opportunity Library. Shaped like the extraction contract (not the
// persisted ScholarshipOpportunity record — there is no `id`/`status` until
// the user explicitly saves it). `in_library`/`opportunity_id` are computed
// live on the backend by checking the user's existing normalized_urls, so a
// re-opened run correctly shows previously-saved results as saved.
export type DeepHuntResult = {
  normalized_url: string;
  source_url: string;
  source_title: string;
  relevance_score: number;
  canonical_name: string;
  sponsor: string | null;
  degree_levels: string[];
  fields_of_study: string[];
  destination_countries: string[];
  eligible_nationalities: string[];
  funding: { coverage?: "full" | "partial"; notes?: string | null };
  deadlines: { date: string; label?: string | null }[];
  requirements: string[];
  application_url: string | null;
  in_library: boolean;
  opportunity_id: string | null;
};

// SCHOLARDOCX-0175: cost estimate returned on run creation so the UI can show
// the worst-case ceiling before/at submit. Actual charges scale with real
// sources scanned. Type re-exported from scholarshipHuntHelpers above.

export type DeepHuntRun = {
  id: string;
  goal: string;
  degree_level: string | null;
  destinations: string[];
  intake_term: string | null;
  status: DeepHuntRunStatus;
  current_stage: string;
  progress: DeepHuntRunProgress;
  result_count: number;
  live_opportunity_count?: number;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  created_at: string;
  updated_at: string;
  // SCHOLARDOCX-0178: results are shown unsaved; a result only becomes a
  // ScholarshipOpportunity (Library row) once explicitly saved.
  results?: DeepHuntResult[];
  // Only present on the create response.
  cost_estimate?: RunCostEstimate;
};

export const scholarshipDeepHuntApi = {
  createRun: (payload: CreateDeepHuntRunRequest) =>
    api.post<DeepHuntRun>("/scholarship-deep-hunt/runs", payload),
  listRuns: () => api.get<DeepHuntRun[]>("/scholarship-deep-hunt/runs"),
  getRun: (runId: string) => api.get<DeepHuntRun>(`/scholarship-deep-hunt/runs/${runId}`),
  cancelRun: (runId: string) =>
    api.post<DeepHuntRun>(`/scholarship-deep-hunt/runs/${runId}/cancel`, {}),
  resumeRun: (runId: string) =>
    api.post<DeepHuntRun>(`/scholarship-deep-hunt/runs/${runId}/resume`, {}),
  deleteRun: (runId: string) => api.delete(`/scholarship-deep-hunt/runs/${runId}`),
  saveResult: (runId: string, normalizedUrl: string) =>
    api.post<ScholarshipOpportunity>(`/scholarship-deep-hunt/runs/${runId}/results/save`, {
      normalized_url: normalizedUrl,
    }),
};
