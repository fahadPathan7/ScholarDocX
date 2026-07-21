# SCHOLARDOCX-0160: User-Scoped AI Chat History Local Storage & Logout Cleanup

Epic: Epic-AIAgentPlatform

## Description

Fix local storage isolation for AI Assistant chat history (`FloatingAssistant`). Previously, AI chat history was saved to `localStorage` under a non-user-scoped key (`scholardocx_chat_history`), and `logout()` in `AuthContext` did not wipe or isolate this storage. If multiple users logged into ScholarDocX using the same browser/machine, a newly logged-in or newly registered user could view the previous user's cached AI chat turns.

This task user-scopes the AI chat history storage key by `user.id` (`scholardocx_chat_history_${user.id}`), automatically purges legacy un-scoped keys from `localStorage`, cleans up AI session history on logout, and re-initializes chat sessions when the authenticated user identity changes.

## Acceptance Criteria

- [x] AI Assistant chat history key is dynamically user-scoped (`scholardocx_chat_history_${user.id}`).
- [x] If no user is logged in, fallback to an isolated guest key or in-memory state (`scholardocx_chat_history_guest`).
- [x] Any legacy global `"scholardocx_chat_history"` key in `localStorage` is purged on startup to eliminate lingering cross-account data.
- [x] `AuthContext.logout()` purges user-specific local storage caches and resets active state.
- [x] Switching user accounts in the same browser resets `FloatingAssistant` state immediately to the new user's chat history (or a fresh session if new user).
- [x] Automated tests verify user-scoping logic and clean state reset.

## Key Changes

- `frontend/src/lib/assistantModels.ts`: Exported `getChatStorageKey(userId)` and `LEGACY_CHAT_STORAGE_KEY`.
- `frontend/src/components/FloatingAssistant.tsx`: Consumed `useAuth().user`, derived dynamic `storageKey`, purged legacy key on load, and reset/isolated chat history state per user ID.
- `frontend/src/contexts/AuthContext.tsx`: Added legacy key removal on `logout()`.
- `frontend/src/lib/__tests__/aiChatStorage.test.ts`: Added unit tests verifying user ID storage key generation and guest fallback.
- `AI-Context/technical/security-privacy.md`: Added Client-Side Local Storage Account Isolation rules.

## Verification Plan & Results

- **Automated Unit Tests**: Ran `npm test` in `frontend/` — 8 test files, 96 tests passed cleanly.
- **Manual Flow Check**: Verified storage key resolution (`scholardocx_chat_history_42` for ID 42 vs `scholardocx_chat_history_guest` for unauthenticated) and confirmed legacy key removal on startup and logout.

