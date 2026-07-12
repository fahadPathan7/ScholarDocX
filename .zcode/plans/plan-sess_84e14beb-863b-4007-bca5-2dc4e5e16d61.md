# Plan: Enhance Rate Limiting + Admin "Info" Tab

## Context found during exploration
- Only **4 IP-based rate limits** exist today, all inline in `backend/app/api/auth.py` (login, register, invite-request, forgot-password), with no shared helper and no locking.
- **Latent bug:** `/auth/register` prunes + checks its bucket but **never appends** an attempt → the limit never triggers. Will be fixed by the refactor.
- **No rate limits** on expensive endpoints: `contact-admin`, AI chat/research/summarize, scholarship deep-hunt runs, advisor-atlas runs, news search/query-preview.
- Admin permission system: `admin_*` keys live as `role_limits` rows; a new permission must be added to **4** places (`canonical_features` set, `admin_permission_defaults`, `SEED_SQL`, `DEFAULT_ROLE_LIMITS`) or it gets deleted on startup.
- Admin tab pattern in `AdminView.tsx`: push `{ id, label, icon }` into `tabs[]` gated by `adminPermissions["..."]`, then render conditionally. `Info` icon is already imported (line 22).

---

## Part A — Backend: shared rate-limit module (refactor)

**New file: `backend/app/auth/rate_limit.py`**
- Central in-memory registry: `RATE_LIMIT_RULES` dict mapping `rule_key → {max, window, scope, label, method, path}`.
- A module-global `RateLimiter` with a `threading.Lock` (fixes a latent race in the current sync-threadpool code) exposing:
  - `check(rule_key, identity)` → raises `HTTPException(429)` if exceeded; does NOT record.
  - `record(rule_key, identity)` → appends a timestamp.
  - `check_and_record(rule_key, identity)` → check + record in one atomic step (for endpoints that count every hit).
  - `catalog()` → returns the `RATE_LIMIT_RULES` metadata for the Info endpoint.
- Identity resolution helper: `client_ip_from_request(request)` → returns `request.client.host or "unknown"`.

**Refactor `backend/app/api/auth.py`:**
- Replace the 4 inline `defaultdict` + prune + check blocks with calls into the new module.
- Preserve existing behavior semantics:
  - `login`: `check()` first, then `record()` **only on failed credentials** (unchanged).
  - `register`: switch to `check_and_record()` on every hit — **this fixes the latent bug** where it never recorded.
  - `invite-request`: `check()` first, `record()` on success (unchanged).
  - `forgot-password`: `check()` first, `record()` before DB lookup, silent generic response on exceed (unchanged — preserves the anti-enumeration property).
- Remove the now-unused module globals (`_login_attempts`, constants, etc.) — moved into the module.

## Part B — Backend: extend rate limits to unprotected endpoints

Add rules to `RATE_LIMIT_RULES` and wire `check_and_record()` into handlers. Authenticated endpoints key on **user id** (more accurate than IP for a local multi-user instance); unauthenticated endpoints key on **IP**.

| Rule key | Endpoint | Limit | Window | Scope |
|---|---|---|---|---|
| `auth_contact_admin` | `POST /auth/contact-admin` | 3 | 30 min | IP |
| `ai_chat` | `POST /ai/chat` | 20 | 1 min | user |
| `ai_research` | `POST /ai/research` | 10 | 1 min | user |
| `ai_summarize` | `POST /ai/summarize` | 10 | 1 min | user |
| `scholarship_deep_hunt_run` | `POST /scholarship-deep-hunt/runs` | 5 | 10 min | user |
| `advisor_atlas_run` | `POST /advisor-atlas/runs` | 5 | 10 min | user |
| `news_search` | `POST /news/search` | 10 | 1 min | user |
| `news_query_preview` | `POST /news/query-preview` | 20 | 1 min | user |

Each handler gets `request: Request` added to its signature (where missing) and one `check_and_record(rule_key, identity)` call at the top, before any token/DB work. These sit *in front of* the existing plan-tier quota checks (token budget, `can_use_scholarship_hunt`, etc.) — fast-fail before spending.

## Part C — Backend: new `admin_view_info` permission + Info endpoint

Add the `admin_view_info` permission (a "view"-style permission matching `admin_view_dashboard` / `admin_view_audit_logs`), **enabled by default for both `general_admin` and `super_admin`**, across all 4 seed sources:
1. `backend/app/db/connection.py` → `canonical_features` set (critical) **and** `admin_permission_defaults` list.
2. `backend/app/db/schema.py` → `SEED_SQL` VALUES block.
3. `backend/app/services/admin.py` → `DEFAULT_ROLE_LIMITS` for both admin roles.
4. Frontend label catalog (Part D).

**New endpoint in `backend/app/api/admin.py`:**
```python
@router.get("/info/rate-limits")
def get_rate_limit_info(current_user: dict = Depends(get_current_user),
                        admin_service: AdminService = Depends(get_admin_service)):
    require_feature("admin_view_info", current_user, admin_service.db)
    return rate_limiter.catalog()
```
Returns a list of `{ rule_key, label, method, path, max_requests, window_seconds, window_label, scope }`.

## Part D — Frontend: Info tab

1. **`backend/app/api/admin.py`** (already above) — new endpoint.
2. **New file `frontend/src/components/admin/InfoTab.tsx`** — fetches `GET /admin/info/rate-limits`, renders a read-only table (Endpoint, Method, Limit, Window, Scope). Uses existing `api` client and `admin.css` classes (`.admin-*`, `glass-panel`). Read-only per the decision.
3. **`frontend/src/components/AdminView.tsx`:**
   - Add `admin_view_info: true` to the optimistic `adminPermissions` defaults (line ~683).
   - Add `if (adminPermissions["admin_view_info"]) tabs.push({ id: "info", label: "Info", icon: Info });` (Info icon already imported).
   - Add `{activeTab === "info" && adminPermissions["admin_view_info"] && <InfoTab />}` to the conditional render block.
   - Add `import { InfoTab } from "./admin/InfoTab";`.
4. **`frontend/src/components/admin/RoleLimitsTab.tsx`** — add an "Info" group to `adminFeatureGroups` with `{ key: "admin_view_info", label: "Can View Info", description: "..." }` so admins can toggle it.
5. **`frontend/src/lib/accessErrors.ts`** — optional friendly label for `admin_view_info` in `FEATURE_LABELS` (small touch).

## Part E — Tests, Jira, Context (mandatory AI-DLC)

1. **Jira task file:** create `AI-Context/jira-tasks/Epic-AuthAndRBAC/SCHOLARDOCX-0137-rate-limit-enhancement-and-admin-info-tab.md` (Epic AuthAndRBAC).
2. **Unit tests** `backend/tests/test_rate_limit.py`:
   - `check()` raises 429 at threshold, passes below.
   - `record()` appends; window pruning expires old timestamps.
   - `check_and_record()` is atomic (hits threshold after N+1 calls).
   - Different identities have independent buckets.
   - `register` now records (regression test for the fixed bug) via an auth-route test if feasible, else a module-level test.
   - `catalog()` returns all rule metadata.
3. **Context updates** (per AGENTS.md mandatory rule):
   - `AI-Context/technical/api-boundaries.md` — document the new `/admin/info/rate-limits` endpoint and the extended rate limits.
   - `AI-Context/technical/security-privacy.md` — note the rate-limit coverage expansion and the register-bug fix.

## Files touched (summary)
**Backend (new):** `app/auth/rate_limit.py`, `tests/test_rate_limit.py`
**Backend (edit):** `app/api/auth.py`, `app/api/admin.py`, `app/api/routes.py`, `app/api/advisor_atlas.py`, `app/api/scholarship_deep_hunt.py`, `app/api/news.py`, `app/db/connection.py`, `app/db/schema.py`, `app/services/admin.py`
**Frontend (new):** `src/components/admin/InfoTab.tsx`
**Frontend (edit):** `src/components/AdminView.tsx`, `src/components/admin/RoleLimitsTab.tsx`, `src/lib/accessErrors.ts`
**Context (new/edit):** Jira task, `api-boundaries.md`, `security-privacy.md`

## Verification
- Run `pytest backend/tests/test_rate_limit.py` and existing `backend/tests/` auth/admin suites.
- `cd frontend && npm run build` to typecheck the new tab.
- Manual: log in as super_admin → Info tab visible → table lists all rate limits; toggle `admin_view_info` off for general_admin in Role Limits → that role no longer sees the tab.