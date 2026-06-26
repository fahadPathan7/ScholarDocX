// One-time migration from legacy "scholardock" / "scholarDock" / "scholar_dock"
// localStorage keys to the current "scholardocx" / "scholarDocX" / "scholar_docx"
// names. Preserves existing chat history, AI settings, and the saved login token
// so an upgrading user does not lose data or get logged out.
//
// Runs once per browser, guarded by MIGRATION_FLAG. Invoke at bootstrap
// (see main.tsx) before any code reads these keys.

const MIGRATION_FLAG = "scholarDocX_keys_migrated";

// Old key -> new key. The value is copied across only when the new key is
// absent, then the old key is removed.
const KEY_MAP: Record<string, string> = {
  scholar_dock_token: "scholar_docx_token",
  scholardock_chat_history: "scholardocx_chat_history",
  scholarDock_webSearchEnabled: "scholarDocX_webSearchEnabled",
  scholarDock_webSearchCount: "scholarDocX_webSearchCount",
  scholarDock_webSearchMaxChars: "scholarDocX_webSearchMaxChars",
  scholarDock_useSummaryContext: "scholarDocX_useSummaryContext",
  scholarDock_useExactContext: "scholarDocX_useExactContext",
  scholarDock_exactChatCount: "scholarDocX_exactChatCount",
  scholarDock_selectedModel: "scholarDocX_selectedModel",
  scholarDock_backgroundModel: "scholarDocX_backgroundModel",
};

// Legacy keys whose shape changed between versions. Each entry converts the old
// value into the appropriate current key when that current key is not yet set.
const LEGACY_CONVERTERS: Array<{
  oldKey: string;
  newKey: string;
  convert: (value: string) => string;
}> = [
  // scholarDock_webSearch was a boolean ("true"/"false"); it is now a count.
  {
    oldKey: "scholarDock_webSearch",
    newKey: "scholarDocX_webSearchCount",
    convert: (value) => (value === "true" ? "2" : "0"),
  },
];

export function migrateLegacyStorageKeys(): void {
  if (typeof window === "undefined" || window.localStorage == null) return;
  if (window.localStorage.getItem(MIGRATION_FLAG) === "1") return;

  for (const [oldKey, newKey] of Object.entries(KEY_MAP)) {
    if (window.localStorage.getItem(newKey) == null) {
      const value = window.localStorage.getItem(oldKey);
      if (value != null) {
        window.localStorage.setItem(newKey, value);
      }
    }
    window.localStorage.removeItem(oldKey);
  }

  for (const { oldKey, newKey, convert } of LEGACY_CONVERTERS) {
    if (window.localStorage.getItem(newKey) == null) {
      const value = window.localStorage.getItem(oldKey);
      if (value != null) {
        window.localStorage.setItem(newKey, convert(value));
      }
    }
    window.localStorage.removeItem(oldKey);
  }

  window.localStorage.setItem(MIGRATION_FLAG, "1");
}
