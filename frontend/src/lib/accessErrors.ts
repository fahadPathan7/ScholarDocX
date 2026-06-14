import type { UiErrorDetail } from "./uiError";

const FEATURE_LABELS: Record<string, string> = {
  ai_messages_per_session: "AI messages per session",
  daily_ai_chats: "daily AI chats",
  monthly_ai_chats: "monthly AI chats",
  can_use_agents: "AI agent actions",
  can_use_web_search: "web search",
  web_searches_per_day: "daily web searches",
  total_projects: "total projects",
  total_sheets: "total sheets",
  sheets_per_project: "sheets per project",
  total_records: "total records",
  records_per_sheet: "records per sheet",
  total_documents_bytes: "document storage",
  total_sticky_notes: "sticky notes",
  total_whiteboards: "whiteboards",
  advisor_atlas_searches_per_month: "monthly Advisor Atlas searches and refreshes",
};

function toFeatureLabel(feature?: string) {
  if (!feature) return "this action";
  return FEATURE_LABELS[feature] || feature.replace(/_/g, " ");
}

function extractFeature(message: string): string | undefined {
  const limitMatch = message.match(/limit exceeded for ([a-z0-9_]+)/i);
  if (limitMatch?.[1]) return limitMatch[1];
  const deniedMatch = message.match(/access to ([a-z0-9_]+)/i);
  if (deniedMatch?.[1]) return deniedMatch[1];
  const permissionMatch = message.match(/permission denied for ([a-z0-9_]+)/i);
  if (permissionMatch?.[1]) return permissionMatch[1];
  return undefined;
}

export function buildAccessErrorDetail(status: number, message: string): UiErrorDetail | null {
  const raw = (message || "").trim();
  if (!raw) return null;
  const lowered = raw.toLowerCase();
  const feature = extractFeature(raw);
  const featureLabel = toFeatureLabel(feature);

  if (status === 429) {
    return {
      title: "Too many requests",
      kind: "rate",
      status,
      message: "You are sending requests too quickly. Please wait a moment and try again.",
    };
  }

  if (status !== 403) return null;

  if (lowered.includes("limit exceeded") || lowered.includes("limit reached")) {
    return {
      title: "Limit exceeded",
      kind: "limit",
      status,
      message: `This action was blocked because your ${featureLabel} limit is reached. Ask your admin to raise the limit or try again after it resets.`,
    };
  }

  if (
    lowered.includes("permission") ||
    lowered.includes("admin access required") ||
    lowered.includes("disabled for your role") ||
    lowered.includes("does not have access") ||
    lowered.includes("must have a user-level role")
  ) {
    return {
      title: "Permission denied",
      kind: "permission",
      status,
      message: `This action was blocked because your role does not allow ${featureLabel}. Ask your admin to grant access in role limits.`,
    };
  }

  return {
    title: "Action blocked",
    kind: "general",
    status,
    message: raw,
  };
}
