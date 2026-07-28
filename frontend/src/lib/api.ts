function defaultApiBase() {
  const protocol = window.location.protocol || "http:";
  const hostname = window.location.hostname || "localhost";
  // SCHOLARDOCX-0139: in local dev the FastAPI backend runs on a separate
  // port (8000) while Vite serves the frontend on 5173. In production the
  // frontend and API share an origin behind a reverse proxy, so the API is
  // reached at the same origin's /api path with no port suffix.
  const isLocalDev =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "[::1]";
  const host = hostname === "0.0.0.0" ? "127.0.0.1" : hostname;
  if (isLocalDev) {
    return `${protocol}//${host}:8000/api`;
  }
  return `${protocol}//${hostname}/api`;
}

export const API_BASE = import.meta.env.VITE_API_BASE_URL || defaultApiBase();
import { buildNotification, NotificationEventKey, notificationTemplates } from "../config/notificationCatalog";
import { defaultNotificationSettings, normalizeNotificationSettings } from "../config/notificationLabels";

export type RecordMap = Record<string, any>;

import { getToken } from "./auth";
import { emitUiError } from "./uiError";
import { buildAccessErrorDetail } from "./accessErrors";
import { emitOutOfTokens } from "./tokenEvents";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...options.headers
    }
  });
  
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const parsed = JSON.parse(text);
      if (parsed.detail) message = parsed.detail;
      else if (parsed.message) message = parsed.message;
    } catch (e) {}
    
    if (response.status === 401) {
      // SCHOLARDOCX-0169: Only /auth/me is authoritative for auth state.
      // A 401 from other endpoints during a Render cold-start race can be
      // transient — wiping the token there logs users out even though
      // their token is valid. Let AuthContext.initAuth() (which calls
      // /auth/me) be the single source of truth for clearing/redirecting.
      if (path === "/auth/me") {
        localStorage.removeItem("scholar_docx_token");
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }
    }
    if (response.status === 402) {
      // Out of AI tokens — surface the buy-packs flow instead of a plain toast.
      emitOutOfTokens(message);
      throw new Error(message || "Out of AI tokens");
    }
    const uiError = buildAccessErrorDetail(response.status, message);
    if (uiError) {
      emitUiError(uiError);
    }
    // Keep the raw status out of the user-facing message (no "Request failed: 403").
    // It stays in the console for debugging.
    console.warn(`[api] ${path} failed with status ${response.status}`);
    throw new Error(message || "Something went wrong. Please try again.");
  }
  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return null as T;
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return null as T;
  }
  return response.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data: RecordMap) =>
    request<T>(path, { method: "POST", body: JSON.stringify(data) }),
  patch: <T>(path: string, data: RecordMap) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(data) }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: "POST", body: formData }),
  delete: <T>(path: string) =>
    request<T>(path, { method: "DELETE" }),
  /** Download a binary resource with the auth Bearer token. Returns a Blob. */
  downloadBlob: async (path: string): Promise<Blob> => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const response = await fetch(`${API_BASE}${path}`, { headers });
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status}`);
    }
    return response.blob();
  },
};

export async function createRecord<T>(table: string, data: RecordMap): Promise<T> {
  return api.post<T>(`/${table}`, { data });
}

export async function listRecords<T>(table: string): Promise<T[]> {
  return api.get<T[]>(`/${table}`);
}

export async function updateRecord<T>(table: string, id: string, data: RecordMap): Promise<T> {
  return api.patch<T>(`/${table}/${id}`, { data });
}

export async function deleteRecord<T>(table: string, id: string): Promise<T> {
  return api.delete<T>(`/${table}/${id}`);
}

export async function notify(
  eventKey: NotificationEventKey,
  vars: {
    project_id?: string;
    projectName?: string;
    projectId?: string;
    sheetName?: string;
    sheetId?: string;
    whiteboardName?: string;
    dueAt?: string;
    attachmentSummary?: string;
    actionLabel?: string;
    scholarshipName?: string;
  } = {}
): Promise<void> {
  try {
    const definition = notificationTemplates[eventKey];
    if (!definition) return;

    const profiles = await listRecords<RecordMap>("local_profiles");
    const profile = profiles[0];
    let normalizedSettings = { ...defaultNotificationSettings };
    if (profile?.notification_settings) {
      try {
        normalizedSettings = normalizeNotificationSettings(JSON.parse(profile.notification_settings));
      } catch (e) {
        console.warn("Failed to parse notification settings", e);
      }
    }
    if (normalizedSettings[definition.settingKey] === false) {
      return; // User disabled this type of notification
    }

    const payload = buildNotification(eventKey, vars, vars.project_id);
    await createRecord("notifications", payload);
  } catch (error) {
    console.error("Failed to create notification", error);
  }
}

export type ApiAiModel = {
  provider: string;
  model_id: string;
  display_name: string;
  is_active: number;
};

export async function getAiModels(): Promise<ApiAiModel[]> {
  return api.get<ApiAiModel[]>("/ai/models");
}

export type ResearchPaper = {
  id: string;
  title: string;
  authors?: string;
  journal_conference?: string;
  publication_year?: string;
  volume_issue_pages?: string;
  doi?: string;
  chunk_count: number;
  status: "processing" | "ready" | "error";
  /** Indexed before search was tuned for question-to-passage matching.
   *  Searching still works; re-reading the paper makes it sharper. */
  search_upgrade_available?: boolean;
  content_text?: string;
  created_at: string;
  updated_at: string;
  static_file_id?: string;
  chunks?: { id: string; chunk_index: number; token_count: number; snippet: string }[];
};

export type PaperAnalysisResult = {
  paper_id: string;
  prompt: string;
  answer: string;
  sources: { 
    chunk_id: string; 
    chunk_index: number; 
    similarity_score: number;
    /** Standing within this result set ("Top match" / "Close match" /
     *  "Weak match" / "Reference list"). Raw cosine barely discriminates
     *  inside one paper, so the position is the honest thing to show. */
    relevance_label?: string;
    lexical_overlap?: number;
    /** The answer cited this passage. Everything retrieved is returned, but
     *  only some of it ends up carrying a claim. */
    cited_in_answer?: boolean;
    snippet: string;
    page_numbers?: number[];
    full_text?: string;
  }[];
  model_used: string;
  usage: { input_tokens: number; output_tokens: number };
  /** Actual credits deducted from user balance for this analysis call,
   *  computed from model pricing (same formula as billing system). */
  charged_credits?: number;
};

export async function uploadResearchPaper(file: File): Promise<ResearchPaper> {
  const formData = new FormData();
  formData.append("file", file);
  return api.upload<ResearchPaper>("/research/papers/upload", formData);
}

export async function listResearchPapers(): Promise<{ papers: ResearchPaper[]; max_library_limit: number }> {
  const res = await api.get<any>("/research/papers");
  if (Array.isArray(res)) {
    return { papers: res, max_library_limit: 20 };
  }
  return {
    papers: res?.papers || [],
    max_library_limit: res?.max_library_limit || 20,
  };
}

export async function getResearchPaper(paperId: string): Promise<ResearchPaper> {
  return api.get<ResearchPaper>(`/research/papers/${paperId}`);
}

export async function deleteResearchPaper(paperId: string): Promise<{ status: string; id: string }> {
  return api.delete<{ status: string; id: string }>(`/research/papers/${paperId}`);
}

export async function retryResearchPaper(paperId: string): Promise<ResearchPaper> {
  return api.post<ResearchPaper>(`/research/papers/${paperId}/retry`, {});
}

export async function analyzeResearchPaper(paperId: string, prompt: string, topK: number = 10): Promise<PaperAnalysisResult> {
  return api.post<PaperAnalysisResult>(`/research/papers/${paperId}/analyze`, { prompt, top_k: topK });
}

// ---- Saved analysis outputs (max 10 per paper) --------------------------------
export type SavedAnalysis = {
  id: string;
  paper_id: string;
  prompt: string;
  answer: string;
  sources: PaperAnalysisResult["sources"];
  model_used?: string;
  charged_credits?: number;
  created_at: string;
};

export async function listSavedAnalyses(
  paperId: string
): Promise<{ analyses: SavedAnalysis[]; max: number; count: number }> {
  return api.get<{ analyses: SavedAnalysis[]; max: number; count: number }>(
    `/research/papers/${paperId}/analyses`
  );
}

export async function saveResearchAnalysis(
  paperId: string,
  payload: {
    prompt: string;
    answer: string;
    sources: PaperAnalysisResult["sources"];
    model_used?: string;
    charged_credits?: number;
  }
): Promise<SavedAnalysis> {
  return api.post<SavedAnalysis>(`/research/papers/${paperId}/analyses`, payload);
}

export async function deleteSavedAnalysis(
  paperId: string,
  analysisId: string
): Promise<{ status: string; id: string }> {
  return api.delete<{ status: string; id: string }>(
    `/research/papers/${paperId}/analyses/${analysisId}`
  );
}

