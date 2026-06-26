# SCHOLARDOCX-0066 — Notification Settings Persistence Fix

## Status
Completed

Owner: AI Agent

Created: 2026-05-31

## Summary
Fix notification settings not persisting after refresh.

## Root Cause
Backend `Store.TABLE_COLUMNS` excluded `notification_settings` from allowed fields for `local_profiles`, so `PATCH /local_profiles/:id` dropped the field silently.

## Scope
In scope:

- Allow `notification_settings` in `local_profiles` updates.

Out of scope:

- Notification UX changes.

## Verification Plan

- `npm --prefix /Users/fahadpathan/Documents/ScholarDocX/frontend run build`

## Completion Notes
Changed files:

- `backend/app/services/store.py`
- `AI-Context/jira-tasks/SCHOLARDOCX-0066-notification-settings-persistence-fix.md`

Verification completed:

- `npm --prefix /Users/fahadpathan/Documents/ScholarDocX/frontend run build`
