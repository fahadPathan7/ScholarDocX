import { api } from "./api";

export type SearchMode = "department" | "professor";

export type ResearchProfile = {
  interests: string[];
};

export type CreateAdvisorRun = {
  mode: SearchMode;
  university_name?: string;
  university_url?: string;
  department?: string;
  professor_name?: string;
  degree_target?: string;
  intake_term?: string;
  research_profile: ResearchProfile;
  approved_domains?: string[];
};

export type AdvisorCandidate = {
  id: number;
  run_id: number;
  display_name: string;
  title?: string;
  institution?: string;
  department?: string;
  email?: string;
  official_profile_url?: string;
  linkedin_url?: string;
  google_scholar_url?: string;
  lab_name?: string;
  lab_url?: string;
  research_summary?: string;
  match_score: number;
  evidence_confidence: number;
  recruitment_state: string;
  recruitment_summary?: string;
  decision_lane: string;
  shortlist_status: string;
  user_notes?: string;
  coverage: Record<string, string>;
  risk_flags: string[];
  saved_professor_id?: number;
};

export type AdvisorRun = {
  id: number;
  mode: SearchMode;
  university_name?: string;
  university_url?: string;
  department?: string;
  professor_name?: string;
  degree_target?: string;
  intake_term?: string;
  research_profile: ResearchProfile;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  current_stage: string;
  progress: { completed?: number; total?: number | null; message?: string };
  action_center: Record<string, any>;
  error_message?: string;
  created_at: string;
  completed_at?: string;
  candidate_count?: number;
  shortlist_count?: number;
  candidates?: AdvisorCandidate[];
};

export type AdvisorPublication = {
  id: number;
  title: string;
  authors: string[];
  publication_year?: number;
  venue?: string;
  doi?: string;
  source_url?: string;
  relevance_reason?: string;
  reading_priority: number;
  reading_status: "unread" | "read_next" | "reading" | "read";
  user_note?: string;
};

export type AdvisorEvidence = {
  id: number;
  source_url: string;
  source_type: string;
  page_title?: string;
  claim_type: string;
  claim_text: string;
  evidence_excerpt?: string;
  confidence: number;
  published_at?: string;
  retrieved_at: string;
};

export type AdvisorDossier = {
  decision_snapshot?: Record<string, any>;
  research_bridge?: Record<string, any>;
  method_bridge?: Record<string, any>;
  lab_environment?: Record<string, any>;
  trajectory?: Record<string, any>;
  application_fit?: Record<string, any>;
  verification_questions?: string[];
  next_actions?: Array<{ type: string; label: string }>;
};

export type AdvisorCandidateDetail = AdvisorCandidate & {
  evidence: AdvisorEvidence[];
  publications: AdvisorPublication[];
  dossier: AdvisorDossier;
  watch_events: Array<Record<string, any>>;
};

export const advisorAtlasApi = {
  createRun: (payload: CreateAdvisorRun) =>
    api.post<AdvisorRun>("/advisor-atlas/runs", payload),
  listRuns: () => api.get<AdvisorRun[]>("/advisor-atlas/runs"),
  getRun: (runId: number) =>
    api.get<AdvisorRun>(`/advisor-atlas/runs/${runId}`),
  deleteRun: (runId: number) =>
    api.delete(`/advisor-atlas/runs/${runId}`),
  cancelRun: (runId: number) =>
    api.post<AdvisorRun>(`/advisor-atlas/runs/${runId}/cancel`, {}),
  resumeRun: (runId: number) =>
    api.post<AdvisorRun>(`/advisor-atlas/runs/${runId}/resume`, {}),
  getCandidate: (candidateId: number) =>
    api.get<AdvisorCandidateDetail>(`/advisor-atlas/candidates/${candidateId}`),
  updateCandidate: (candidateId: number, payload: Record<string, any>) =>
    api.patch<AdvisorCandidateDetail>(`/advisor-atlas/candidates/${candidateId}`, payload),
  updatePublication: (
    candidateId: number,
    publicationId: number,
    payload: Record<string, any>,
  ) =>
    api.patch<AdvisorCandidateDetail>(
      `/advisor-atlas/candidates/${candidateId}/publications/${publicationId}`,
      payload,
    ),
  refreshCandidate: (candidateId: number) =>
    api.post<AdvisorCandidateDetail>(`/advisor-atlas/candidates/${candidateId}/refresh`, {}),
  saveCandidate: (candidateId: number) =>
    api.post<Record<string, any>>(`/advisor-atlas/candidates/${candidateId}/save`, {}),
};
