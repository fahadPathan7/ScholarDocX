import { useTokenEconomy } from "../contexts/TokenEconomyContext";
import { Zap } from "lucide-react";

export function AiTokenUsageButton() {
  const { balance } = useTokenEconomy();

  if (!balance) return null;

  const totalPool = balance.monthly_allowance + balance.purchased_total;
  
  if (totalPool <= 0 || balance.is_unlimited) {
    return null;
  }

  const totalRemaining = balance.subscription_remaining + balance.purchased_remaining;
  const used = Math.max(0, totalPool - totalRemaining);
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
