# SCHOLARDOCX-0028: Chat UI Fix And Polish

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-05-27

Completed: 2026-05-27

## Summary

Fix broken chat panel UI in FloatingAssistant. The chat mode selector
(Chat / Search / Vision) had no CSS, causing all three labels to render
as unstyled inline text with no visual separation. Several other CSS
classes used by FloatingAssistant.tsx were also missing
(`.message-mode`, `.message-image`, `.attachment-badge`,
`.image-preview-container`, `.image-preview`).

Additionally polish the overall panel appearance: a cleaner header with
gradient accent, refined empty-state icon colour, better mode-button
pill styling, and a subtler send-button shape to match the app design
system.

## Functional Context

Links:
- [feature-ai-assistant.md](../../functional/feature-ai-assistant.md)

## Requirements

- Mode selector shows three clearly-separated pill buttons (Chat, Search, Vision).
- Active mode button has a filled/highlighted style.
- Image preview, attachment badge, and message-mode badge all render correctly.
- Chat panel header is visually distinct (gradient/border accent).
- No regression to other components.

## Verification Plan

- Run frontend build: `npm run build`.
- Browser-check: open AI assistant panel, verify mode buttons appear as
  pills, switch modes, send a message, check message styling.

## Completion Notes

Changed files:
- [styles.css](../../../frontend/src/styles.css)
  – Added `.chat-mode-selector`, `.mode-button`, `.mode-button.active`,
    `.message-mode`, `.message-image`, `.attachment-badge`,
    `.image-preview-container`, `.image-preview` and polished
    `.chat-dock .assistant-head`, `.chat-empty-state`, `.send-button`.

Verification:
- `npm run build` passes (✓ built in ~924ms, no errors).
- Mode selector pills (Chat / Search / Vision) now render as styled
  rounded buttons with active/hover states.
- Image preview, attachment badge, and message-mode badge CSS added.
- Chat panel header has a gradient accent; empty-state icon is more visible.

Follow-up redesign (same task):
- Removed 3-button mode selector (Chat / Search / Vision) entirely.
- Chat is always implicit — no button needed.
- Vision renamed to Attach: file input now accepts images, PDFs, and docs.
- Web search is now an opt-in toggle icon (Globe) inside the input row;
  does not guarantee a web call — backend decides based on query relevance.
- A teal hint bar appears below the input when web search hint is active.
- Panel height increased: `min-height` 400 → 520px; `max-height` uses
  `calc(100vh - 220px)` instead of `calc(100vh - 280px)`.
- `FloatingAssistant.tsx` build: ✓ 921ms, no errors.
