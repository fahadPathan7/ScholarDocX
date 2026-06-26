import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "./AuthContext";
import { BuyTokensModal } from "../components/BuyTokensModal";
import { OutOfTokensModal } from "../components/OutOfTokensModal";

export type AiTokenBalance = {
  subscription_remaining: number; // -1 = unlimited
  purchased_remaining: number;
  purchased_total: number;
  subscription_period: string | null;
  monthly_allowance: number; // -1 = unlimited
  is_unlimited: boolean;
  total_spent_tokens: number;
  total_spent_usd: number;
  tokens_per_dollar: number;
};

type TokenEconomyContextType = {
  balance: AiTokenBalance | null;
  loading: boolean;
  refresh: () => Promise<void>;
  openBuyTokens: () => void;
};

const TokenEconomyContext = createContext<TokenEconomyContextType | undefined>(undefined);

export function TokenEconomyProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [balance, setBalance] = useState<AiTokenBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [outOpen, setOutOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const data = await api.get<AiTokenBalance>("/ai-tokens/balance");
      setBalance(data);
    } catch {
      // Silent — balance is non-critical for rendering.
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // A 402 anywhere in the app opens the out-of-tokens flow + refreshes balance.
  useEffect(() => {
    const handler = () => {
      setOutOpen(true);
      refresh();
    };
    window.addEventListener("scholardocx:out-of-tokens", handler as EventListener);
    return () => window.removeEventListener("scholardocx:out-of-tokens", handler as EventListener);
  }, [refresh]);

  const openBuyTokens = useCallback(() => setBuyOpen(true), []);

  return (
    <TokenEconomyContext.Provider value={{ balance, loading, refresh, openBuyTokens }}>
      {children}
      <BuyTokensModal
        open={buyOpen}
        onClose={() => setBuyOpen(false)}
        onPurchased={refresh}
      />
      <OutOfTokensModal
        open={outOpen}
        onClose={() => setOutOpen(false)}
        onBuyTokens={() => {
          setOutOpen(false);
          setBuyOpen(true);
        }}
      />
    </TokenEconomyContext.Provider>
  );
}

export function useTokenEconomy() {
  const ctx = useContext(TokenEconomyContext);
  if (ctx === undefined) {
    throw new Error("useTokenEconomy must be used within a TokenEconomyProvider");
  }
  return ctx;
}
