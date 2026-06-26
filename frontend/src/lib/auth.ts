export const TOKEN_KEY = "scholar_docx_token";

export interface User {
  id: number;
  email: string;
  display_name: string;
  avatar?: string;
  roles: string[];
  plan_started_at?: string;
  plan_ends_at?: string;
  is_active?: boolean;
  is_blocked?: boolean;
}

export type UserPlanStatus = "no_plan" | "active" | "warning" | "expired";

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

export function isUser(): boolean {
  return hasRole("general_user") || hasRole("pro_user") || hasRole("max_user");
}

export function hasUserTierRole(roles: string[] | undefined | null): boolean {
  return (roles || []).some((role) => ["general_user", "pro_user", "max_user"].includes(role));
}

export function hasAdminRole(roles: string[] | undefined | null): boolean {
  return (roles || []).some((role) => ["super_admin", "general_admin"].includes(role));
}

export function isUserPlanExpired(planEndsAt?: string): boolean {
  if (!planEndsAt) return false;
  const parsed = new Date(planEndsAt);
  if (Number.isNaN(parsed.getTime())) return false;

  const endDate = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return endDate < today;
}

export function getUserPlanStatus(planEndsAt?: string): UserPlanStatus {
  if (!planEndsAt) return "no_plan";
  const parsed = new Date(planEndsAt);
  if (Number.isNaN(parsed.getTime())) return "no_plan";

  const endDate = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysUntilExpiry = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntilExpiry < 0) return "expired";
  if (daysUntilExpiry <= 7) return "warning";
  return "active";
}

export function getPlanDaysRemaining(planEndsAt?: string): number | null {
  if (!planEndsAt) return null;
  const parsed = new Date(planEndsAt);
  if (Number.isNaN(parsed.getTime())) return null;

  const endDate = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function hasActiveUserPlan(user?: Pick<User, "roles" | "plan_ends_at"> | null): boolean {
  if (!user || !hasUserTierRole(user.roles)) return false;
  return getUserPlanStatus(user.plan_ends_at) !== "expired";
}
