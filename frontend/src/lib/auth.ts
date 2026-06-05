export const TOKEN_KEY = "scholar_dock_token";

export interface User {
  id: number;
  email: string;
  display_name: string;
  avatar?: string;
  roles: string[];
  plan_started_at?: string;
  plan_ends_at?: string;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function decodeToken(token: string): any {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  
  const payload = decodeToken(token);
  if (!payload || !payload.exp) return false;
  
  // Check if token is expired
  const now = Math.floor(Date.now() / 1000);
  return payload.exp > now;
}

export function getUserRoles(): string[] {
  const token = getToken();
  if (!token) return [];
  
  const payload = decodeToken(token);
  return payload?.roles || [];
}

export function hasRole(role: string): boolean {
  const roles = getUserRoles();
  return roles.includes(role);
}

export function isAdmin(): boolean {
  return hasRole("super_admin") || hasRole("general_admin");
}
