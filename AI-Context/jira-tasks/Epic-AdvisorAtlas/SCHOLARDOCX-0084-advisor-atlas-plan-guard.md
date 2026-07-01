# SCHOLARDOCX-0084: Advisor Atlas plan guard (Pro/Max only)

Status: In Progress
Owner: AI Agent

Epic: Epic-AdvisorAtlas
Created: 2026-06-27

## Summary

Advisor Atlas is currently usable by every plan: the nav tab shows for anyone with a
user role and the backend only checks the AI-credit balance, never the plan. Make
Advisor Atlas a premium-tier capability gated by a per-role boolean `can_use_advisor_atlas`
(reusing the existing `role_limits` mechanism). By default only Pro and Max can use it;
Free and General see a locked tab that routes to Choose Plan. Reads of existing runs stay
open so a downgraded user can still view past runs and shortlists. Follows the same shape
as the per-plan token-pack capability
([SCHOLARDOCX-0083](../Epic-BillingAndPlans/SCHOLARDOCX-0083-per-plan-token-pack-purchasing.md)).

## Confirmed Decisions

- Default seeding: `free_user` = 0, `general_user` = 0, `pro_user` = 1, `max_user` = 1
  (reset period `never`).
- Admin roles (`general_admin`, `super_admin`) are NOT seeded: the enforcement resolver
  (`get_primary_user_role`) ignores admin roles for non-`admin_` features, so admin rows
  would be inert. The seeded super_admin also holds `max_user`, so admins get Atlas via
  their user tier.
- Backend guard scope: block the work-creating endpoints only (`create_run`,
  `resume_run`, `refresh_candidate`). Reads (`list/get/delete/update/save`) stay open so a
  Pro→Free downgrade still leaves existing runs viewable.
- Ineligible UX: keep the nav tab visible but **locked** (lock icon + muted style) for
  Free/General. Clicking it routes to Choose Plan (`plans`) with a toast instead of
  opening Advisor Atlas. Backend 403 is the backstop.
- A load-flash is avoided for Pro/Max by deriving `canUseAdvisorAtlas` from the user role
  immediately, then refining from `usageData.limits.can_use_advisor_atlas` once loaded.

## Functional Context

Links:

- Functional file: [AI-Context/functional/feature-advisor-atlas.md](../../functional/feature-advisor-atlas.md)

## Technical Context

Links:

- Technical file: [AI-Context/technical/security-privacy.md](../../technical/security-privacy.md)

## Scope

In scope:

- New boolean role limit `can_use_advisor_atlas` in all four seed sources:
  `schema.py` SEED_SQL, `connection.py` migrate seed + `canonical_features`,
  `admin.py` `DEFAULT_ROLE_LIMITS`.
- `POST /advisor-atlas/runs`, `POST /advisor-atlas/runs/{id}/resume`, and
  `POST /advisor-atlas/candidates/{id}/refresh` 403 guard for ineligible plans.
- Frontend locked tab: lock icon, click → Choose Plan + toast, route render guard.
- `FEATURE_LABELS` entry in `lib/accessErrors.ts`.
- Plan-comparison boolean feature row ("Advisor Atlas") in `PlanComparisonView.tsx`.
- Admin role-limits feature-catalog entry in `AdminView.tsx`.
- Backend tests.

Out of scope:

- Changing Advisor Atlas feature behavior or quota (FR-9.53 monthly quota is unchanged).
- Restricting reads of existing runs/candidates.

## Implementation Plan

- backend/app/db/schema.py — `SEED_SQL` +4 user-tier rows.
- backend/app/db/connection.py — `canonical_features` + migration seed block
  (`advisor_atlas_permission_defaults`).
- backend/app/services/admin.py — `DEFAULT_ROLE_LIMITS` +4 user-tier entries (use the
  effective second `free_user` block; the dict has a pre-existing duplicate key).
- backend/app/api/advisor_atlas.py — `_require_advisor_atlas_access(user, session)`
  helper; call it in `create_run` (before token check), `resume_run` (add `store` dep,
  before `prepare_resume`), and `refresh_candidate` (after existence check, before token
  check).
- backend/tests/test_advisor_atlas_limits.py — neutralize guard in 3 existing tests;
  add denied-for-general-user tests (+ optional pro positive).
- frontend/src/App.tsx, lib/accessErrors.ts, components/PlanComparisonView.tsx,
  components/AdminView.tsx.

## Unit Test Plan

Unit tests needed: Yes.

- Ineligible role (free/general) `create_run` / `refresh_candidate` → 403; eligible
  (pro/max) proceeds past the guard.
- Seed/migration: 4 `can_use_advisor_atlas` rows exist after init and survive re-init.
- Existing token-gating tests remain green (guard neutralized to isolate token behavior).

## Verification Plan

- `pytest backend/tests/test_advisor_atlas_limits.py` green; broader advisor-atlas + token
  suites no regressions.
- `npx tsc --noEmit` clean; `npm run build` clean.
- Manual: Free/General → Atlas tab locked, click → Choose Plan (Atlas row ✗); Pro/Max →
  Atlas opens normally; admin role-limits editor shows the toggle and reset-to-defaults
  keeps it; downgrading a Pro user leaves old runs viewable.
