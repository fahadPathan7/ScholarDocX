# SCHOLARDOCX-0217: Audit remediation batch 1 — trust, error handling, modal a11y, CSS tokens

Status: Review

Owner: AI Agent

Epic: Epic-AuditRemediation

Created: 2026-11-01

## Summary

First remediation batch from the 2026-11-01 full-repo improvement audit. Fixes
the high-leverage S/M findings across billing trust, silent-failure UX, modal
accessibility, and CSS token health. Explicitly excluded by the user: the
`subscription.revoked` admin-roles wipe finding (`webhooks.py:397-403`) — do
not "fix" it in this batch.

## Business Context

Links:

- Business file: [../business/decisions.md](../../business/decisions.md) (BD-011 operator never absorbs provider cost)

Business value:

- Credit metering users can trust (no under-deduction race, live balance, correct checkout product).
- No more silent data-loss paths (whiteboard saves, uploads, profile saves).
- Accessibility baseline for all modals (Escape + focus trap).

## Functional Context

Links:

- Functional file: [../functional/feature-ai-assistant.md](../../functional/feature-ai-assistant.md)

Requirements:

- Every touched async action shows loading, error, and recovery (retry/undo) affordances per CODE_RULES UI/UX rules.
- AI error copy never exposes provider names, model cascade, env-var guidance, or raw HTTP codes.

## Technical Context

Links:

- Technical file: [../technical/billing-contract.md](../../technical/billing-contract.md)
- Technical file: [../technical/frontend-visual-system.md](../../technical/frontend-visual-system.md) (modal backdrop blur scoping)

Technical notes:

- Atomic charge: replace read-modify-write in `ai_tokens.py` `charge()` with a single conditional UPDATE so concurrent calls cannot both consume the same subscription remainder.
- Modal depth CSS currently dead (`[style*="zIndex: ..."]` never matches React serialization) — replace with a `data-modal-depth` attribute set by `Modal.tsx`.
- 23 CSS custom properties are used but undefined; define them as aliases of the live `--ui-*` tokens in one place.

## Scope

In scope:

Backend (trust + correctness):
1. Atomic credit charge (`services/ai_tokens.py` charge/refresh path).
2. Atomic plan-quota increment (`auth/limits.py`), atomic invite-code usage + friendly duplicate-email error (`api/auth.py`).
3. `PackUpdatePayload.polar_product_id` passed through to `update_pack` (`api/ai_tokens.py`).
4. `/files/{id}/content` single-row lookup (`api/routes.py`).
5. Provider resolution from `ai_models` instead of prefix guessing (`api/routes.py`).
6. Category-create error differentiation (`api/routes.py`), news error detail fix (`api/news.py`), generic 500 copy in `api/ai_tokens.py` + `research_paper_service.py`.
7. Lazy plan-expiry downgrade fallback at login.
8. `AnalyzeRequest.source_url` scheme validation.

Frontend (UX + a11y + copy):
9. Timer leak in `ProjectWorkspace.tsx:228`.
10. Upload error/pending state, toast race fix + `aria-live`, sheet-load error+retry (App.tsx, ProjectWorkspace.tsx).
11. Error handling: dashboard toggle/reminder delete, whiteboard saves/cap, profile saves.
12. Confirmations: reminder delete, appeal dismiss, plan-request review, opportunity delete, notifications delete-read.
13. Pending/submit states: plan-request review, admin create-user.
14. Admin dashboard error state + honors top-bar Refresh; audit-log render cap.
15. Modal.tsx: Escape, focus trap, `role="dialog"`/`aria-modal`; migrate AboutView + AddToTrackerModal + 5 App.tsx inline backdrops to `<Modal>`.
16. BuyTokensView: use `pack.polar_product_id`; load-error state with retry.
17. Token balance refresh after metered AI actions (FloatingAssistant, ResearchExpertView).
18. Retry affordances: assistant error bubble, Research Expert analysis error.
19. OutOfTokensModal: reset date + "See usage" link.
20. RecordFormModal Cancel button; template-save `window.prompt` → styled prompt; "cannot be undone" copy fix.
21. Jargon copy fixes: DeepHuntView "Extracting", PillarsShowcase "extraction"/"embedding", AdvisorDossierDrawer "Similarity", `api.ts` raw status.
22. Remove dead `HierarchyView` + helpers from App.tsx.
23. CSS: define 23 missing custom properties as `--ui-*` aliases; `data-modal-depth` replaces dead attribute selectors; delete dead `notifications.css` + `QueryReviewDialog.css`; global `prefers-reduced-motion` guard.

Out of scope (follow-ups, see Completion Notes):

- `subscription.revoked` admin-roles preservation (user-excluded).
- Pagination/virtualization, URL routing, chat streaming/cancel, deadline notification job, soft delete, JWT refresh, self-service password reset, CSV import improvements, mobile breakpoint change, dark mode, Tailwind palette migration, admin list search/pagination, external-call caching, email outreach UI, server-persisted chat history.

## Acceptance Criteria

- Concurrent `charge()` calls deduct exactly their sum; no under-deduction path.
- All touched async buttons disable during flight and show feedback on failure.
- `<Modal>` closes on Escape, traps focus, restores focus on close, exposes dialog semantics; migrated modals keep the AGENTS.md blur-scoping look.
- No `console.error`-only catches in touched handlers.
- Rendered copy in touched files contains no banned jargon (vector/embedding/chunk/extraction/similarity/provider names/raw HTTP codes).
- `npx tsc` (or `npm run build`) passes; guard scripts (`check-provider-call-billing.py`, `check-context-drift.py`) pass.

## Implementation Plan

- Backend fixes + tests in `backend/tests/unit/` (charge atomicity, invite atomicity, provider resolution, error mapping, pack update pass-through).
- Frontend fixes grouped by file; verify with TypeScript build only (no test execution per CODE_RULES).

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- `test_ai_tokens_charge_atomic.py`-adjacent updates: charge under concurrency semantics (sequential simulation of two charges against one balance row).
- Invite code: `max_uses` exhaustion via concurrent-shaped flow returns 400/expired; duplicate email → 400 friendly message.
- Provider resolution: unknown model falls back per `ai_models` lookup, not prefix.
- Pack update API passes `polar_product_id` through.
- (Frontend: no component-test runner in repo — verified via typecheck; noted per CODE_RULES.)

If no unit tests are needed, explain why:

- n/a

## File Size Check

Files expected to be edited:

- backend: `services/ai_tokens.py` (1176 — over grace; only localized edits, no growth), `auth/limits.py`, `api/auth.py`, `api/routes.py`, `api/ai_tokens.py`, `api/news.py`, `services/research_paper_service.py` (1694 — over grace; localized edits only), `api/scholarship_opportunities.py`, plan-expiry/auth login touchpoint.
- frontend: `App.tsx` (1514 — net shrink expected from HierarchyView removal + modal migration), `ProjectWorkspace.tsx`, `DashboardView.tsx`, `CalendarMonthView.tsx`, `AdminView.tsx`, `admin/PlanRequestsTab.tsx`, `admin/UsersTab.tsx`, `news/OpportunityLibrary.tsx`, `FloatingNotifications.tsx`, `sheet/RecordFormModal.tsx`, `sheet/useSheetPage.ts`, `WhiteboardView.tsx`, `ProfileView.tsx`, `BuyTokensView.tsx`, `OutOfTokensModal.tsx`, `FloatingAssistant.tsx`, `ResearchExpertView.tsx`, `Modal.tsx`, `AboutView.tsx`, `news/AddToTrackerModal.tsx`, `lib/api.ts`, `contexts/TokenEconomyContext.tsx`, `styles.css`/`visual-refresh.css` (alias block only), delete `components/notifications.css`, `components/news/QueryReviewDialog.css`.

Line-count risk:

- Medium — most files shrink or stay flat; `ai_tokens.py` and `research_paper_service.py` are already over the 1150 grace limit and receive localized fixes only (splitting them is a follow-up, not this batch's goal).

If any file exceeds 1000 lines, explain why:

- Pre-existing overages documented in `technical/file-size-and-modularity.md`; this batch must not grow them materially.

## Verification Plan

- `npx tsc --noEmit` in `frontend/` (compilation check only).
- `python scripts/check-provider-call-billing.py` and `python scripts/check-context-drift.py` (static guards; not the test suite).
- Manual diff review of all touched files.
- No pytest/npm-test execution unless the user asks (CODE_RULES).

## Completion Notes

Status: Review (implemented on branch `fix/audit-remediation-0217`; tests written but NOT executed per CODE_RULES — user has not asked for a run).

Changed files:

Backend (9 + 5 test files):
- `services/ai_tokens.py` — `_atomic_deduct`: one conditional UPDATE computes the subscription/purchased split in SQL (guard `sub + purch >= tokens`, RETURNING via FROM-snapshot for ledger labels); charge() now rejects whole (OutOfTokens 402, balance untouched) when the buckets can't cover the call; shared `OUT_OF_CREDITS_MESSAGE`. Pre-existing over-grace size grew 1176→1254 (localized fix; split remains a follow-up).
- `auth/limits.py` — `check_and_increment_limit` increment is a guarded conditional UPDATE (atomic limit check; unlimited bypass; giveback semantics preserved).
- `api/auth.py` — invite slot reserved atomically BEFORE account creation; IntegrityError on the insert → rollback, slot returned, friendly 400; login calls `maybe_run_lazy_user_plan_expiry` (per-user expired-plan downgrade persisted; marker-free — a global marker would wrongly skip other users).
- `services/plan_expiry.py` — `downgrade_user_if_expired` + `maybe_run_lazy_user_plan_expiry` reusing `apply_plan_expiry` (admin roles never removed).
- `api/ai_tokens.py` — `PackUpdatePayload.polar_product_id` passed through to `update_pack`; generic 500 copy + server-side log.
- `api/routes.py` — provider resolution reads the `ai_models` catalog first (prefix guess only for uncatalogued ids); `/files/{id}/content` single-row `get_record`; category create/rename catch only `IntegrityError` as duplicate; `AiPayload.message_count` preferred over context parsing.
- `api/news.py` — no more Exception object in `detail`; plain copy + log.
- `services/research_paper_service.py` — generic 500 copy + log (2 sites).
- `api/scholarship_opportunities.py` — `source_url` must be http/https (400 before gates/external call).

Frontend (25 files + 2 deleted):
- `Modal.tsx` — Escape (topmost-only via module stack), focus trap + restore, `role="dialog" aria-modal`, optional `label`, `data-modal-depth`. Additive API.
- `App.tsx` — upload pending/error state; toast timer fix + `aria-live`; dead `HierarchyView`/`DataForm`/`useForm`/`findName` + 5 unused states/fetches removed (1514→1355 lines); 5 inline backdrops → `<Modal scope="body">`; neutral plan-locked phrasing.
- `ProjectWorkspace.tsx` — stray render-body `setInterval` removed; sheet-load error + Retry; template save via styled prompt.
- `DashboardView.tsx` — toggle/delete catch + toast; reminder delete confirm (covers CalendarMonthView trash).
- `AdminView.tsx` — dashboard error + Retry + honors `refreshTrigger`; audit logs loading/error/RENDER_CAP 200; appeal Dismiss confirm; filtered empty-state.
- `admin/PlanRequestsTab.tsx` — approve/reject confirm + per-row pending.
- `admin/UsersTab.tsx`, `admin/InvitesTab.tsx` — loading/error/zero-match states; create-user pending; invite-create feedback + auto-copy.
- `news/OpportunityLibrary.tsx`, `FloatingNotifications.tsx` — delete confirmations.
- `sheet/RecordFormModal.tsx` (Cancel), `sheet/useSheetPage.ts` (undo-aware copy).
- `WhiteboardView.tsx` — save-failure indicator + toast; board-cap alert; load retry capped at 3 with error state.
- `ProfileView.tsx` — identity/avatar/notification saves catch + toast + pending.
- `FloatingAssistant.tsx` — session-limit copy from role limit; `message_count` sent; error-bubble retry; token-economy refresh after metered calls.
- `ResearchExpertView.tsx` — analysis error Retry; token refresh after analyze/retry.
- `BuyTokensView.tsx` — checkout uses `pack.polar_product_id` (positional key fallback only); load-error card with Retry.
- `OutOfTokensModal.tsx` — monthly reset date shown.
- `AboutView.tsx`, `news/AddToTrackerModal.tsx` — migrated to `<Modal>`.
- `lib/api.ts` — no raw HTTP status in download errors; non-string `detail` normalized (no more `[object Object]`).
- `styles.css` / `visual-refresh.css` — `[data-modal-depth="nested"]` replaces dead `[style*=]` selectors; 22 legacy CSS variables defined as `--ui-*` aliases (repairs focus rings, bool pills, quota colors, chart fills); global `prefers-reduced-motion` guard.
- Copy: DeepHuntView "Reading and organizing details"; PillarsShowcase "key contribution summaries" / "feature layers"; AdvisorDossierDrawer "How closely…"; AddToTracker friendly error.
- Deleted: `components/notifications.css`, `components/news/QueryReviewDialog.css` (zero references).

Context/rules: `AGENTS.md` stale legacy-modal list corrected (last inline backdrops migrated here); `technical/frontend-visual-system.md` migration status + Modal a11y contract; `technical/ai-token-economy.md` atomic-deduction semantics; `technical/api-boundaries.md` `message_count` + provider resolution.

Verification completed:

- `npx tsc --noEmit` (frontend): exit 0, zero errors.
- `python -m compileall -q app` + new/edited test files compile: OK.
- `python scripts/check-provider-call-billing.py`: ok. `python scripts/check-context-drift.py`: ok (re-run after context edits).
- Jargon sweep over all added lines: clean (only "in**vite**" substring hits).
- No test execution (CODE_RULES) — pytest/vitest NOT run.

Unit tests added or updated:

- `tests/unit/test_ai_tokens.py` — atomic charge: sequential split totals; over-total rejects and leaves balance+ledger untouched; exact-total drains to zero; zero-balance hard-stop.
- `tests/unit/test_ai_model_permissions.py` — catalog provider beats prefix guess; uncatalogued fallbacks; inactive catalog model blocked.
- `tests/unit/test_ai_tokens_packs.py` — `update_pack` persists `polar_product_id` (snapshot/restore of the column).
- `tests/unit/test_plan_expiry.py` — lazy per-user sweep: downgrade + idempotent; admin roles preserved; unexpired untouched.
- `tests/regression/test_api_auth.py` — exhausted invite → 400 usage-limit; duplicate email → 400 friendly (after slot consumed).
- `tests/unit/test_categories_api.py` (new) — IntegrityError → duplicate 400; other failures propagate.
- `tests/unit/test_scholarship_analyze_request.py` (new) — non-http links 400 before the permission gate; valid link reaches the gate.

Follow-ups:

- USER-EXCLUDED: `subscription.revoked` wiping admin roles (`webhooks.py:397-403`) — deliberately not touched.
- charge() semantics change: a call the balance can't fully cover is now rejected whole AFTER the provider ran (previously clamped/partially charged). Real fix = pre-flight cost ceilings like Deep Hunt for `/ai/research` + Research Expert analyze + Advisor Atlas.
- `message_count` is still client-reported; a persisted per-conversation counter is the real enforcement.
- OutOfTokensModal "See usage" skipped — it mounts outside UsageProvider (needs a small context/provider reorder).
- Deferred audit items for later batches: pagination/virtualization, URL-based routing, chat streaming + AbortSignal cancel, deadline-notification job, soft delete/undo, JWT refresh + short-lived file-download tokens, self-service password reset, CSV import (type picker/preview/re-pick), mobile breakpoint 1450→768, dark mode + Tailwind palette migration, admin list server-side search/pagination, external-call caching/dedupe, email outreach UI, server-persisted chat history, dead `.models-modal-backdrop` rule in about-refresh.css.
- File-size debt unchanged: `research_paper_service.py` 1700, `ai_tokens.py` 1254, `store.py` 1186, `FloatingAssistant.tsx` 1219, `ResearchExpertView.tsx` 1616 still over grace — splits remain open from SCHOLARDOCX-0180/0203/0211.
