import type { ConnectedAppScope } from "./connectedAppsApi";

/** User-facing words for connected apps. Kept together so a test can lint them. */
export const CONNECTED_APPS_COPY = {
  title: "Connected apps",
  hint: "Let an AI app you use, like Claude, read your workspace and suggest changes. By default nothing changes until you approve it here.",
  readLabel: "Can read",
  suggestLabel: "Can read and suggest changes",
  directLabel: "Can read and make changes directly",
  directHint: "It can also change your workspace without asking you first. Use this only if your AI app has its own safeguards that you control. Deleting and bulk edits are still blocked.",
  directAck: "I understand this app can change my workspace without my approval.",
  reviewTitle: "Review suggested changes",
  keyLabel: "Access key",
  keyWarning: "Copy this access key now. For your safety it is shown only once.",
  suggestedTitle: "Suggested changes",
  suggestedEmpty: "No suggestions waiting. When a connected app suggests a change, it appears here for you to approve.",
  notIncluded: "Connected apps are not included in your plan.",
  setupIntro: "Add it to your AI app with one of these:",
} as const;

export const EXPIRY_LABELS: Record<number, string> = {
  30: "30 days",
  90: "90 days",
  365: "1 year",
};

export function scopeLabel(scope: ConnectedAppScope): string {
  if (scope === "read_write") return CONNECTED_APPS_COPY.directLabel;
  return scope === "read_suggest" ? CONNECTED_APPS_COPY.suggestLabel : CONNECTED_APPS_COPY.readLabel;
}

/** The backend serves the connection endpoint next to /api, so swap the suffix. */
export function mcpUrlFromApiBase(apiBase: string): string {
  const base = apiBase.replace(/\/+$/, "").replace(/\/api$/, "");
  return `${base}/mcp`;
}

export function buildClaudeCodeCommand(url: string, key: string): string {
  return `claude mcp add --transport http scholardocx ${url} --header "Authorization: Bearer ${key}"`;
}

export function buildJsonConfig(url: string, key: string): string {
  return JSON.stringify(
    { mcpServers: { scholardocx: { url, headers: { Authorization: `Bearer ${key}` } } } },
    null,
    2,
  );
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "Never" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Words that must not reach users (AGENTS.md jargon rule). */
export const BANNED_COPY_PATTERNS: RegExp[] = [
  /\bMCP\b/i,
  /\btoken/i,
  /\bSupabase\b|\bRender\b|\bPostgres|\bFastAPI\b|\bVite\b/i,
  /\bembedding|\bvector\b|\bpgvector\b/i,
];
