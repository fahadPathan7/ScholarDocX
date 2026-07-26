import { api } from "./api";
import { ScholarshipOpportunity } from "./scholarshipOpportunitiesApi";

export type DeepHuntRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type CreateDeepHuntRunRequest = {
  goal: string;
  degree_level?: string;
  destinations?: string[];
  intake_term?: string;
  field_of_study?: string;
};

export type DeepHuntRun = {
  id: string;
  goal: string;
  degree_level: string | null;
  destinations: string[];
  intake_term: string | null;
  status: DeepHuntRunStatus;
  current_stage: string;
  progress: { completed?: number; total?: number | null; message?: string };
  result_count: number;
  live_opportunity_count?: number;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  created_at: string;
  updated_at: string;
  opportunities?: ScholarshipOpportunity[];
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
};
