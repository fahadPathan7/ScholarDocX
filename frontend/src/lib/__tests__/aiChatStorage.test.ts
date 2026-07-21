import { describe, it, expect } from "vitest";
import { getChatStorageKey, LEGACY_CHAT_STORAGE_KEY } from "../assistantModels";

describe("AI Chat Local Storage User Scoping", () => {
  it("generates user-scoped storage key when user ID is present", () => {
    expect(getChatStorageKey(42)).toBe("scholardocx_chat_history_42");
    expect(getChatStorageKey("usr_abc123")).toBe("scholardocx_chat_history_usr_abc123");
  });

  it("falls back to guest key when user ID is missing or null", () => {
    expect(getChatStorageKey(null)).toBe("scholardocx_chat_history_guest");
    expect(getChatStorageKey(undefined)).toBe("scholardocx_chat_history_guest");
  });

  it("defines expected legacy key constant for cleanup", () => {
    expect(LEGACY_CHAT_STORAGE_KEY).toBe("scholardocx_chat_history");
  });
});
