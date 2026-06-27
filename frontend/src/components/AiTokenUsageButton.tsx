import { useTokenEconomy } from "../contexts/TokenEconomyContext";
import { Zap } from "lucide-react";

export function AiTokenUsageButton() {
  const { balance } = useTokenEconomy();

  if (!balance) return null;

  if (balance.is_unlimited) {
    return null;
  }

  // "Used" is tracked explicitly per period (subscription_used) — never derived
  // from allowance − remaining, which collapses to 0 after a mid-period plan
  // change. The pool is used + remaining so the two always add up, even when the
  // live subscription bucket was granted at a higher tier than the current plan.
  const used = balance.subscription_used + Math.max(0, balance.purchased_total - balance.purchased_remaining);
  const totalRemaining = Math.max(0, balance.subscription_remaining) + balance.purchased_remaining;
  const totalPool = used + totalRemaining;

  if (totalPool <= 0) {
    return null;
  }

  const percentage = Math.round((used / totalPool) * 100);

  return (
    <div className="token-usage-badge custom-tooltip-container">
      {percentage}%
      <div className="custom-tooltip">
        AI Credits Used: {percentage}%<br/>
        <span style={{opacity: 0.8, fontSize: '11px'}}>{used.toLocaleString()} of {totalPool.toLocaleString()} limit</span>
      </div>
    </div>
  );
}
