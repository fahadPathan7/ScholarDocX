import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "./AuthContext";
import { OutOfTokensModal } from "../components/OutOfTokensModal";
import { emitNavigate } from "../lib/tokenEvents";

export type AiTokenBalance = {
  subscription_remaining: number; // -1 = unlimited
  subscription_used: number; // tokens consumed from the subscription bucket this period
  purchased_remaining: number;
  purchased_total: number;
  subscription_period: string | null;
  monthly_allowance: number; // -1 = unlimited
  is_unlimited: boolean;
  total_spent_tokens: number;
  total_spent_usd: number;
  tokens_per_dollar: number;
  can_purchase_packs: boolean;
};

type TokenEconomyContextType = {
  balance: AiTokenBalance | null;
  loading: boolean;
  refresh: () => Promise<void>;
  openBuyTokens: () => void;
  canPurchasePacks: boolean;
};

const TokenEconomyContext = createContext<TokenEconomyContextType | undefined>(undefined);

export function TokenEconomyProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [balance, setBalance] = useState<AiTokenBalance | null>(null);
  const [loading, setLoading] = useState(false);
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

  // Buy flow is a full page (SCHOLARDOCX-0085); navigate to it instead of a modal.
  const openBuyTokens = useCallback(() => emitNavigate("buy-credits"), []);

  return (
    <TokenEconomyContext.Provider
      value={{ balance, loading, refresh, openBuyTokens, canPurchasePacks: balance?.can_purchase_packs ?? true }}
    >
      {children}
      <OutOfTokensModal
        open={outOpen}
        onClose={() => setOutOpen(false)}
        onBuyTokens={() => {
          setOutOpen(false);
          emitNavigate("buy-credits");
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
