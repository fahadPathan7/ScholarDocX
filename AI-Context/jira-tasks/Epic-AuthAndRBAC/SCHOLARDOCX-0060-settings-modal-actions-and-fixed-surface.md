# SCHOLARDOCX-0060 — Settings Modal Actions And Fixed Surface

Status: Done


Owner: AI Agent

Epic: Epic-AuthAndRBAC

Created: 2026-05-31

## Summary
Refactor Settings view so the right content surface is not a long scrolling page. Replace inline settings sections with action buttons that open modal panels for Usage Limits and Notification Settings.

## Functional Context
Links:

- Functional file: `AI-Context/functional/feature-about-profile.md`

Requirements:

- FR-8.10: Settings root page should present concise action-entry cards/buttons instead of rendering all large settings sections inline.
- FR-8.11: Settings detail surfaces (usage limits and notification preferences) should open in modal dialogs with blurred content backdrop and internal modal scrolling.

## Technical Context
Links:

- Technical file: `AI-Context/technical/frontend-visual-system.md`

Technical notes:

- Use modal pattern consistent with existing in-app overlays.
- Blur only the main content work surface (not top bar or sidebar).
- Keep modal body scrollable when content exceeds viewport.

## Scope
In scope:

- Settings landing surface with two action buttons.
- Usage modal.
- Notification settings modal.
- Blur backdrop + close interactions.

Out of scope:

- Backend schema/API changes.
- New settings categories.

## Acceptance Criteria

- Settings root no longer shows long inline usage + notification content.
- Root includes buttons: `Your Current Usage & Limits` and `Notification Settings`.
- Clicking each button opens a modal with backdrop blur and close support.
- Modal content scrolls internally when needed.

## Verification Plan

- `npm --prefix frontend run build`

## Completion Notes
Changed files:

- `frontend/src/components/SettingsView.tsx`
- `AI-Context/functional/feature-about-profile.md`
- `AI-Context/jira-tasks/SCHOLARDOCX-0060-settings-modal-actions-and-fixed-surface.md`

Verification completed:

- `npm --prefix frontend run build`
