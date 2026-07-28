# SCHOLARDOCX-0187: Workspace Snapshot — Feature Library Counts (Advisor Atlas, Scholarship Hunt, Research Expert)

Status: Completed

Owner: AI Agent

Epic: Epic-DashboardAndCalendar

Created: 2026-07-28

## Summary

Added four new cards to the central Dashboard's "Workspace Snapshot" section, each showing a feature's stored-item count against its cap: Advisor Atlas research history, Scholarship Hunt's Opportunity Library and Previous Searches, and the Research Expert library. Any card at or over its cap renders in red.

## Functional Context

Documented in `AI-Context/functional/feature-dashboard-hierarchy.md` under "Workspace Snapshot Feature Library Counts".

## Technical Context

- `Store._feature_library_counts(uid)` (new, `app/services/store.py`) — scoped `COUNT(*)` queries against `advisor_atlas_runs`, `scholarship_opportunities`, `scholarship_deep_hunt_runs`, `research_papers` (none of these are in `MODEL_MAP`/`TABLE_COLUMNS`, so the existing generic `_count()` helper doesn't apply). Research Expert's cap is role-based (`max_research_papers_library` via `get_user_limit`, mirroring `ResearchPaperService.get_library_limit()`); the other three are fixed constants mirrored as plain integers (100, 100, 10) alongside a comment pointing at their real source-of-truth constant.
- `Store.dashboard_summary()` now returns a new `feature_libraries` key: `{key: {label, count, max}}`. `max` is `None` for Research Expert when the role has no library access (limit_count 0), consistent with how the equivalent backend check treats "no cap value" vs "hard-blocked".
- Frontend: `Dashboard` type gained `feature_libraries: Record<string, FeatureLibraryCount>`; `DashboardView.tsx`'s Workspace Snapshot `cards` array now includes 4 more entries with an optional `max`; a card renders `count/max` and applies `.metric-at-cap` (red) once `value >= max`.

## Scope

In scope:
- `backend/app/services/store.py`: `_feature_library_counts`, wired into `dashboard_summary()`.
- `frontend/src/App.tsx`: `Dashboard` type + `FeatureLibraryCount`.
- `frontend/src/components/DashboardView.tsx`: Workspace Snapshot cards.
- `frontend/src/styles.css`: `.metric-at-cap`.
- `AI-Context/functional/feature-dashboard-hierarchy.md`.

Also included in this pass (Advisor Atlas cap follow-through, flagged by the user as a gap in the prior SCHOLARDOCX-0186 work):
- `frontend/src/components/admin/InfoTab.tsx`: added the missing "Research History (Advisor Atlas)" row to the Save & Storage Caps table — every other fixed per-user cap in the codebase is listed there and this one wasn't.
- `frontend/src/components/AdvisorAtlasView.tsx` / `advisor-atlas/advisor-atlas.css`: added a `{count}/100` badge next to "Research history" in the sidebar, red at cap — matches Research Expert's visible "Library (X/Y)" pattern that end users already see for an equivalent cap.

Out of scope:
- Changing any of the underlying caps' values or eviction behavior (FIFO for Previous Searches, hard-reject for the other three) — unchanged.
- Making Advisor Atlas's frontend cap dynamic instead of hardcoded (see Follow-ups in SCHOLARDOCX-0186).

## Verification Plan

- Verified `feature_libraries` directly against real production data via a throwaway script: counts matched real row counts per table, Research Expert's role-based max (50, an admin-configured override on this account, not the code default of 20) resolved correctly.
- Visual check via a static HTML harness using the real CSS (no login credentials available to click through the live app) — screenshot confirms all 4 new cards render `count/max` and the at-cap card (10/10) shows red while the others don't.
- `npx tsc --noEmit` clean.

## Completion Notes

Changed files:
- `backend/app/services/store.py` — `_feature_library_counts`, `dashboard_summary()` wiring.
- `frontend/src/App.tsx` — `Dashboard`/`FeatureLibraryCount` types.
- `frontend/src/components/DashboardView.tsx` — Workspace Snapshot cards.
- `frontend/src/styles.css` — `.metric-at-cap`.
- `frontend/src/components/admin/InfoTab.tsx` — Advisor Atlas cap row (gap fix).
- `frontend/src/components/AdvisorAtlasView.tsx`, `advisor-atlas/advisor-atlas.css` — user-visible history count badge (gap fix).
- `AI-Context/functional/feature-dashboard-hierarchy.md`.

Verification completed:
- Live data check via script (see Verification Plan).
- Static CSS harness screenshot.
- `npx tsc --noEmit` clean.

Follow-ups:
- None beyond the one already logged in SCHOLARDOCX-0186 (Advisor Atlas's frontend cap constant is hardcoded, not fetched).
