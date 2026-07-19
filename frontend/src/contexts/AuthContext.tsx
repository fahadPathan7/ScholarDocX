import React, { createContext, useContext, useEffect, useState } from "react";
import { decodeToken, getToken, setToken as persistToken, isAuthenticated as checkIsAuthenticated, User, clearToken } from "../lib/auth";
import { api } from "../lib/api";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: User, remember?: boolean) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: () => {},
  logout: () => {},
  refreshUser: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const initAuth = async (isRefresh = false) => {
    if (!isRefresh) setIsLoading(true);
    try {
      if (checkIsAuthenticated()) {
        const token = getToken();
        const payload = token ? decodeToken(token) : null;
        if (token && payload && payload.user_id) {
          // Load initial user from token payload and unblock the UI immediately.
          // The token already carries id/email/display_name/roles, so the
          // SplashScreen / ProtectedRoute gate does not need to wait on /auth/me.
          setUser({
            id: payload.user_id,
            email: payload.email,
            display_name: payload.display_name,
            roles: payload.roles || [],
          });
          setIsAuthenticated(true);
          if (!isRefresh) setIsLoading(false);
          // Background refresh to pick up latest plan/role details from server.
          // Non-blocking: failures are logged but do not gate the dashboard.
          try {
            const latestUser = await api.get<User>(`/auth/me`);
            setUser(latestUser);
          } catch (error) {
            // If 401, token might be revoked; the next protected request will
            // clear it. Keep the optimistic state in the meantime.
            console.error("Failed to refresh user", error);
          }
        } else {
          // Token missing, malformed, or un-decodable — treat as logged out
          // rather than hanging on the SplashScreen forever.
          clearToken();
          setUser(null);
          setIsAuthenticated(false);
          if (!isRefresh) setIsLoading(false);
        }
      } else {
        setUser(null);
        setIsAuthenticated(false);
        if (!isRefresh) setIsLoading(false);
      }
    } catch (error) {
      // Any unexpected failure in the synchronous bootstrap path must still
      // release the loading gate, otherwise the app hangs on refresh.
      console.error("Auth bootstrap failed", error);
      clearToken();
      setUser(null);
      setIsAuthenticated(false);
      if (!isRefresh) setIsLoading(false);
    }
  };

  useEffect(() => {
    initAuth();
  }, []);

  const login = (token: string, user: User, remember = true) => {
    persistToken(token, remember);
    setUser(user);
    setIsAuthenticated(true);
    setIsLoading(false);
    // Refresh latest server-side fields (e.g. plan dates) in the background
    // without delaying the dashboard render.
    api.get<User>(`/auth/me`)
      .then(setUser)
      .catch((error) => console.error("Failed to refresh user after login", error));
  };

  const logout = () => {
    clearToken();
    setUser(null);
    setIsAuthenticated(false);
    window.location.href = "/";
  };

  const refreshUser = async () => {
    await initAuth(true);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
