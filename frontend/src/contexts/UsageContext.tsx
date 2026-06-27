import React, { createContext, useContext, useState, useEffect } from "react";
import { api } from "../lib/api";
import { useAuth } from "./AuthContext";

type UsageData = {
  limits: Record<string, number>;
  usage: Record<string, number>;
  advisor_atlas_plan_phrase?: string;
  token_packs_plan_phrase?: string;
};

type UsageContextType = {
  usageData: UsageData | null;
  refreshUsage: () => Promise<void>;
  checkLimit: (feature: string) => { isExceeded: boolean; limit: number; current: number };
};

const UsageContext = createContext<UsageContextType | undefined>(undefined);

export function UsageProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [usageData, setUsageData] = useState<UsageData | null>(null);

  const refreshUsage = async () => {
    if (!isAuthenticated) return;
    try {
      const data = await api.get<UsageData>("/auth/usage");
      setUsageData(data);
    } catch (error) {
      console.error("Failed to fetch usage data:", error);
    }
  };

  useEffect(() => {
    refreshUsage();
  }, [isAuthenticated]);

  const checkLimit = (feature: string) => {
    if (!usageData) return { isExceeded: false, limit: -1, current: 0 };
    
    const limit = usageData.limits[feature] ?? -1;
    const current = usageData.usage[feature] ?? 0;
    
    if (limit === -1) return { isExceeded: false, limit, current };
    
    return { isExceeded: current >= limit, limit, current };
  };

  return (
    <UsageContext.Provider value={{ usageData, refreshUsage, checkLimit }}>
      {children}
    </UsageContext.Provider>
  );
}

export function useUsage() {
  const context = useContext(UsageContext);
  if (context === undefined) {
    throw new Error("useUsage must be used within a UsageProvider");
  }
  return context;
}
