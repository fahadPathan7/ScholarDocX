import React from "react";
import { useUsage } from "../contexts/UsageContext";
import { Zap } from "lucide-react";

export function UsageIndicator() {
  const { usageData } = useUsage();

  if (!usageData) return null;

  // Get all three AI chat limits
  const sessionLimit = usageData.limits["ai_messages_per_session"] ?? -1;
  const sessionUsage = usageData.usage["ai_messages_per_session"] ?? 0;
  
  const dailyLimit = usageData.limits["daily_ai_chats"] ?? -1;
  const dailyUsage = usageData.usage["daily_ai_chats"] ?? 0;
  
  const monthlyLimit = usageData.limits["monthly_ai_chats"] ?? -1;
  const monthlyUsage = usageData.usage["monthly_ai_chats"] ?? 0;
  
  // If all limits are unlimited, don't show the indicator
  if (sessionLimit === -1 && dailyLimit === -1 && monthlyLimit === -1) return null;
  
  // Calculate percentages for each limit
  const sessionPercentage = sessionLimit === -1 ? 0 : Math.min(100, Math.round((sessionUsage / sessionLimit) * 100));
  const dailyPercentage = dailyLimit === -1 ? 0 : Math.min(100, Math.round((dailyUsage / dailyLimit) * 100));
  const monthlyPercentage = monthlyLimit === -1 ? 0 : Math.min(100, Math.round((monthlyUsage / monthlyLimit) * 100));
  
  // Use the highest percentage to determine color
  const maxPercentage = Math.max(sessionPercentage, dailyPercentage, monthlyPercentage);
  const isNearLimit = maxPercentage >= 80;
  const isAtLimit = maxPercentage >= 100;

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-slate-100 text-xs font-medium text-slate-600 shadow-sm border border-slate-200">
      <Zap size={14} className={isAtLimit ? "text-red-500" : isNearLimit ? "text-amber-500" : "text-emerald-500"} />
      <div className="flex items-center gap-3">
        {sessionLimit !== -1 && (
          <span title="AI Messages per Session">
            Session: {sessionUsage} / {sessionLimit}
          </span>
        )}
        {dailyLimit !== -1 && (
          <span title="AI Messages per Day">
            Daily: {dailyUsage} / {dailyLimit}
          </span>
        )}
        {monthlyLimit !== -1 && (
          <span title="AI Messages per Month">
            Monthly: {monthlyUsage} / {monthlyLimit}
          </span>
        )}
      </div>
    </div>
  );
}
