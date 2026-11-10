# SCHOLARDOCX-0237: Header Refresh updates the whole tab group, in place

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-11-10

## Summary

Owner: Refresh should update everything under the sidebar group you are in (for example all of Projects while inside a
sheet) and stay on the same page. Audit found it only worked for part of each group.

## Audit findings (before)

- App-level refresh handled only Dashboard (summary, notifications) and Documents (files, categories); Projects, Sticky,
  Whiteboard, Profile and the rest relied on views reacting to one shared counter that reloaded every mounted view.
- Gaps: Scholarship Hunt run list/open run and plan gate; Advisor Atlas saved professors (used a local counter) and the open dossier;
  Research Expert's open paper and saved analyses; Profile (loaded once, never again); 11 of the Admin tabs (Invites, Requests,
  Role Limits, Settings, Audit, Appeals, Info, ...); the notification bell, dashboard counts, plan/usage and credit balance on
  every tab except Dashboard.
- Bug: Whiteboard refresh jumped to the most recently used board and replaced the canvas with the server copy, dropping strokes
  still waiting for autosave.
- Bug: refreshing the user briefly reset roles from the (possibly stale) token before /auth/me answered.

## Changes

- `App.tsx`: per-group counters (`refreshTriggers`, `triggerFor`, `bumpRefresh`); `refreshActiveTab` now refetches notifications,
  dashboard summary, user, usage, and credits for every group (plus files/categories for Projects and Documents) with
  `Promise.allSettled`. Lumi workspace changes bump projects/sticky/whiteboard/documents.
- Views: `DeepHuntView`, `ScholarshipNewsView`, `AdvisorAtlasView` (saved list + `AdvisorDossierDrawer` silent in-place reload that
  keeps unsaved notes), `ResearchExpertView`, `ProfileView` (draft kept when dirty), `WhiteboardView` (`refreshBoards`: flush,
  refresh list, stay on board), and all Admin tabs (`InvitesTab`, `InviteRequestsTab`, `PlanRequestsTab`,
  `TokenPurchaseRequestsTab`, `RoleLimitsTab`, `SettingsTab` + pricing/packs/models, audit, appeals, info).
- `AuthContext.initAuth`: a refresh no longer resets the user from the token before `/auth/me` answers.
- `AI-Context/technical/state-management.md` rewritten for the group model.

## Verification

Playwright with a mocked API: clicking Refresh on each tab issued only that group's requests plus the app-level ones (for
example Projects: projects, sheet counts, files, categories; Scholarship Hunt: runs; Admin > Invite Codes: invites, limits;
Profile: local profile). tsc and build pass. Not exercised end to end with real data: an open sheet / paper / dossier / board
being reloaded in place, unsaved-draft protection, and the Atlas tab (locked in the mock).

## Notes

Refresh saves the open whiteboard first, so a concurrent edit of the same board from another device is overwritten (last write
wins, as with autosave). Unmounted sub-tabs (Scholarship Hunt Library while Search is open) load fresh when opened.
