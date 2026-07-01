# SCHOLARDOCX-0065 — Sticky Note Notification Toggle Fix

Status: Done


Owner: AI Agent

Epic: Epic-StickyNotes

Created: 2026-05-31

## Summary
Fix bug where sticky note update notifications were still emitted even when the sticky-note notification option was unchecked.

## Root Cause
Notification emission treated missing settings keys as allowed. Legacy/incomplete `notification_settings` payloads could omit sticky-note keys; UI rendered those as unchecked, but backend emission logic still sent notifications because only explicit `false` was blocked.

## Scope
In scope:

- Normalize notification settings with defaults.
- Parse legacy boolean strings (`"true"`/`"false"`).
- Use normalized settings during notification emission checks.

Out of scope:

- Notification UI redesign.

## Verification Plan

- `npm --prefix frontend run build`

## Completion Notes
Changed files:

- `frontend/src/config/notificationLabels.ts`
- `frontend/src/components/SettingsView.tsx`
- `frontend/src/lib/api.ts`
- `AI-Context/jira-tasks/SCHOLARDOCX-0065-sticky-note-notification-toggle-fix.md`

Verification completed:

- `npm --prefix frontend run build`
