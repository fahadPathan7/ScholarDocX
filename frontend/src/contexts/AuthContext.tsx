import React, { createContext, useContext, useEffect, useState } from "react";
import { decodeToken, getToken, isAuthenticated as checkIsAuthenticated, User, clearToken } from "../lib/auth";
import { api } from "../lib/api";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
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
    if (checkIsAuthenticated()) {
      const token = getToken();
      if (token) {
        const payload = decodeToken(token);
        // Load initial user from token payload
        setUser({
          id: payload.user_id,
          email: payload.email,
          display_name: payload.display_name,
          roles: payload.roles || [],
        });
        setIsAuthenticated(true);
        // Background refresh to get latest user details from server
        try {
          const latestUser = await api.get<User>("/auth/me");
          setUser(latestUser);
        } catch (error) {
          // If 401, token might be revoked
          console.error("Failed to refresh user", error);
        }
      }
    } else {
      setUser(null);
      setIsAuthenticated(false);
    }
    if (!isRefresh) setIsLoading(false);
  };

  useEffect(() => {
    initAuth();
  }, []);

  const logout = () => {
    clearToken();
    setUser(null);
    setIsAuthenticated(false);
    window.location.href = "/login";
  };

  const refreshUser = async () => {
    await initAuth(true);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
