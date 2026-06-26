function defaultApiBase() {
  const protocol = window.location.protocol || "http:";
  const host = window.location.hostname === "0.0.0.0"
    ? "127.0.0.1"
    : window.location.hostname || "localhost";
  return `${protocol}//${host}:8000/api`;
}

export const API_BASE = import.meta.env.VITE_API_BASE_URL || defaultApiBase();
import { buildNotification, NotificationEventKey, notificationTemplates } from "../config/notificationCatalog";
import { defaultNotificationSettings, normalizeNotificationSettings } from "../config/notificationLabels";

export type RecordMap = Record<string, any>;

import { getToken } from "./auth";
import { emitUiError } from "./uiError";
import { buildAccessErrorDetail } from "./accessErrors";

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
      localStorage.removeItem("scholar_docx_token");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    const uiError = buildAccessErrorDetail(response.status, message);
    if (uiError) {
      emitUiError(uiError);
    }
    throw new Error(message || `Request failed: ${response.status}`);
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
    request<T>(path, { method: "DELETE" })
};

export async function createRecord<T>(table: string, data: RecordMap): Promise<T> {
  return api.post<T>(`/${table}`, { data });
}

export async function listRecords<T>(table: string): Promise<T[]> {
  return api.get<T[]>(`/${table}`);
}

export async function updateRecord<T>(table: string, id: number, data: RecordMap): Promise<T> {
  return api.patch<T>(`/${table}/${id}`, { data });
}

export async function deleteRecord<T>(table: string, id: number): Promise<T> {
  return api.delete<T>(`/${table}/${id}`);
}

export async function notify(
  eventKey: NotificationEventKey,
  vars: {
    project_id?: number;
    projectName?: string;
    projectId?: number;
    sheetName?: string;
    sheetId?: number;
    whiteboardName?: string;
    dueAt?: string;
    attachmentSummary?: string;
    actionLabel?: string;
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
