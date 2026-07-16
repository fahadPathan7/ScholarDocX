import { api } from "./api";

export type SearchMode = "department" | "professor";

export type ResearchProfile = {
  interests: string[];
};

export type AdvisorDepartmentRelation = {
  name?: string;
  relation?: "direct" | "adjacent" | "interdisciplinary" | string;
  relevance_score?: number;
  reason?: string;
  source_url?: string;
  confidence?: number;
  faculty_count?: number;
  research_match_count?: number;
  opportunity_count?: number;
};

export type AdvisorOpportunityOutlook = {
  status?: "current_open" | "high_likelihood" | "possible" | "low_likelihood" | "unknown" | string;
  likelihood?: number;
  confidence?: number;
  likely_semesters?: string[];
  signals?: string[];
  counter_signals?: string[];
  limitation?: string;
};

export type AdvisorIntelligence = {
  is_research_match?: boolean;
  semantic_score?: number;
  matched_interests?: string[];
  match_reasons?: string[];
  matching_method?: string;
  matching_limitation?: string;
  department_relation?: AdvisorDepartmentRelation;
  opportunity_outlook?: AdvisorOpportunityOutlook;
  background?: Record<string, any>;
  funding?: Record<string, any>;
  lab_members?: Record<string, any>;
  research_interests?: {
    summary?: string;
    themes?: string[];
    methods?: string[];
    applications?: string[];
  };
  academic_profiles?: Record<string, any>;
  contact?: Record<string, any>;
  collaborations?: Record<string, any>;
  recent_activity?: Record<string, any>;
  research_depth?: "deep" | "screened" | string;
  research_metrics?: {
    tavily_searches?: number;
    pages_crawled?: number;
    ai_calls?: number;
    estimated_input_tokens?: number;
    estimated_output_tokens?: number;
    estimated_total_tokens?: number;
    sources_inspected?: number;
    elapsed_seconds?: number;
    token_measurement?: string;
  };
  source_gaps?: string[];
};

export type AdvisorDiscoverySummary = {
  mode?: SearchMode;
  requested_field?: string;
  department_map?: AdvisorDepartmentRelation[];
  coverage?: {
    units_mapped?: number;
    direct_units?: number;
    adjacent_units?: number;
    interdisciplinary_units?: number;
    sources_inspected?: number;
    directories_inspected?: number;
    directories_accessible?: number;
    directories_inaccessible?: number;
    verified_faculty?: number;
    research_matches?: number;
    opportunity_matches?: number;
    completeness?: string;
    completeness_note?: string;
    coverage_gaps?: string[];
  };
  faculty_ids?: string[];
  research_match_ids?: string[];
  opportunity_match_ids?: string[];
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
  id: string;
  run_id: string;
  display_name: string;
  title?: string;
  institution?: string;
  department?: string;
  email?: string;
  official_profile_url?: string;
  personal_url?: string;
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
  intelligence: AdvisorIntelligence;
  shortlist_status: string;
  user_notes?: string;
  coverage: Record<string, string>;
  risk_flags: string[];
  saved_professor_id?: string;
};

export type AdvisorRun = {
  id: string;
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
  id: string;
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
  id: string;
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
  getRun: (runId: string) =>
    api.get<AdvisorRun>(`/advisor-atlas/runs/${runId}`),
  deleteRun: (runId: string) =>
    api.delete(`/advisor-atlas/runs/${runId}`),
  cancelRun: (runId: string) =>
    api.post<AdvisorRun>(`/advisor-atlas/runs/${runId}/cancel`, {}),
  resumeRun: (runId: string) =>
    api.post<AdvisorRun>(`/advisor-atlas/runs/${runId}/resume`, {}),
  getCandidate: (candidateId: string) =>
    api.get<AdvisorCandidateDetail>(`/advisor-atlas/candidates/${candidateId}`),
  updateCandidate: (candidateId: string, payload: Record<string, any>) =>
    api.patch<AdvisorCandidateDetail>(`/advisor-atlas/candidates/${candidateId}`, payload),
  updatePublication: (
    candidateId: string,
    publicationId: string,
    payload: Record<string, any>,
  ) =>
    api.patch<AdvisorCandidateDetail>(
      `/advisor-atlas/candidates/${candidateId}/publications/${publicationId}`,
      payload,
    ),
  refreshCandidate: (candidateId: string) =>
    api.post<AdvisorCandidateDetail>(`/advisor-atlas/candidates/${candidateId}/refresh`, {}),
  saveCandidate: (candidateId: string) =>
    api.post<Record<string, any>>(`/advisor-atlas/candidates/${candidateId}/save`, {}),
};
