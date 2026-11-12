import { api } from "../../lib/api";

export type ConnectedAppScope = "read" | "read_suggest";

export interface ConnectedApp {
  id: string;
  name: string;
  scope: ConnectedAppScope;
  key_prefix: string;
  created_at: string | null;
  expires_at: string | null;
  last_used_at: string | null;
  expired: boolean;
}

export interface ConnectedAppsResponse {
  apps: ConnectedApp[];
  can_create: boolean;
  max_apps: number;
  expiry_choices_days: number[];
}

export interface Suggestion {
  id: string;
  app_name: string;
  summary: string;
  actions: string[];
  status: "pending" | "running" | "confirmed" | "dismissed" | "failed" | "expired";
  created_at: string | null;
  expires_at: string | null;
  result_message: string | null;
}

export const listConnectedApps = () => api.get<ConnectedAppsResponse>("/connected-apps");

export const createConnectedApp = (name: string, scope: ConnectedAppScope, expiresInDays: number) =>
  api.post<{ app: ConnectedApp; key: string }>("/connected-apps", {
    name,
    scope,
    expires_in_days: expiresInDays,
  });

export const revokeConnectedApp = (id: string) => api.delete<null>(`/connected-apps/${id}`);

export const listPendingSuggestions = () =>
  api.get<{ suggestions: Suggestion[] }>("/connected-apps/suggestions?status=pending");

export const confirmSuggestion = (id: string) =>
  api.post<{ status: string; message: string }>(`/connected-apps/suggestions/${id}/confirm`, {});

export const dismissSuggestion = (id: string) =>
  api.post<null>(`/connected-apps/suggestions/${id}/dismiss`, {});
