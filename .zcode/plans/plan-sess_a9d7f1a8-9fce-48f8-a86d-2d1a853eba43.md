## Plan: Admin panel performance — pagination + dashboard query batching

**Jira:** Create `SCHOLARDOCX-0147` in `Epic-AuthAndRBAC` as step 1 (per AGENTS.md "no work without Jira").

### Part A — Backend: offset pagination for 6 list endpoints

Establish a shared pagination response shape used by all admin lists:
```python
{ "items": [...], "total": int, "page": int, "page_size": int, "total_pages": int }
```

**1. `backend/app/api/admin.py`** — add `page: int = 1, page_size: int = 50` query params (FastAPI `Query(ge=1)` / `Query(ge=1, le=200)`) to these 6 GET routes; pass through to the service:
- `/users`, `/plan-requests`, `/password-reset-requests`, `/invite-requests`, `/suspension-appeals`, `/invites`

**2. `backend/app/services/admin.py`** — update the 6 `list_*` methods to accept `page`/`page_size` and add:
- A `COUNT(*)` query for `total`
- `LIMIT :page_size OFFSET :offset` (`offset = (page-1)*page_size`) on the existing SELECT
- Return the `{items, total, page, page_size, total_pages}` envelope (ceil total/page_size)
- Keep existing `request_type`/`status` filters working alongside pagination

### Part B — Backend: batch the 23 dashboard queries

**`backend/app/services/admin.py` → `get_dashboard_stats()`** — collapse the sequential `_get_count` calls into as few round-trips as possible:
- Group the simple `COUNT(*)` over different tables into **one multi-row query** using `UNION ALL` with a label column (one query → 10 counts), or a single query with sub-selects.
- The 5 `pending_*` counts and 4 `tavily_*`/`ai_token` counts similarly collapse into 1-2 grouped queries each (e.g. one `SELECT status, COUNT(*) FROM ... GROUP BY status` replaces the 5 pending counts where feasible).
- Keep the 2 `LIMIT 5` recent-activity queries and the 10-day usage grouping as-is (already bounded/grouped).
- Same response shape — no frontend change needed for the dashboard.

Net: ~23 round-trips → ~3-5. This alone should cut dashboard latency substantially.

### Part C — Frontend: consume paginated responses

**3. `frontend/src/components/admin/UsersTab.tsx`** (1070 lines, biggest):
- Replace `GET /admin/users?t={ts}` with `GET /admin/users?page=1&page_size=50` (drop the cache-bust `?t=`).
- Store `{items, total, page, total_pages}` in state; move role/plan/status/search filters to **server-side** query params so the server filters before paginating (keep the existing filter UI, wire it to refetch with params).
- Add a pagination control (Prev / Page X of N / Next) below the table.
- Update the mutate handlers (toggle-status, roles, revoke, create, notify) to refetch the current page only.

**4. The other 5 tabs** — same pattern, lighter touch:
- `frontend/src/components/admin/PlanRequestsTab.tsx` — paginate; keep the `request_type` and add status filter server-side.
- `frontend/src/components/admin/PasswordResetRequestsTab.tsx` — paginate; send `?status=` server-side (stop sending `all`).
- `frontend/src/components/admin/InviteRequestsTab.tsx` — paginate.
- `frontend/src/components/admin/TokenPurchaseRequestsTab.tsx` — paginate (`/ai-tokens/admin/purchase-requests` — needs the same backend treatment; I'll add pagination to that endpoint in `ai_tokens.py` too).
- `frontend/src/components/InvitesTab.tsx` — paginate.

**5. Shared pagination UI** — add a small reusable `Pagination` component (`frontend/src/components/admin/Pagination.tsx`) to avoid duplicating Prev/Next logic across 6 tabs. Each tab renders it and calls back with the new page.

### Part D — Tests + context

- Backend: add unit tests for pagination on `list_users` (page 1, page 2, last page, page beyond range, total_pages math) and for the batched dashboard (same counts returned, fewer queries). Update existing admin tests that assume a bare array to read `.items`.
- Frontend: no test runner; manual verification noted honestly in the Jira task.
- Update `AI-Context/technical/api-boundaries.md` with the new pagination contract for admin endpoints.
- Update `AI-Context/technical/project-structure.md` if I add the `Pagination` component.

### Decisions baked in
- Offset pagination (`page`/`page_size`, default 50, max 200) per your choice.
- Default `page_size=50` balances payload vs. scrolling.
- Server-side search/filter for UsersTab (largest); other tabs keep client-side filtering within a page where simple, to limit rework — the server still paginates the base query.

### File-size check
- `admin.py` service (~1008 lines) is near the 1000 limit. The batching *reduces* line count there. Pagination additions (~6 methods × ~6 lines) keep it under 1100 — within the temporary grace. If it crosses 1150, I'll split `list_*` methods into a separate module before finishing.
- `UsersTab.tsx` (1070 lines) — pagination adds a modest amount; server-side filtering *replaces* some client-side `useMemo`, netting roughly even. Will monitor; split if it crosses 1150.
- All other files well under limits.

### Out of scope (follow-ups)
- `POST /admin/notifications/send` per-recipient INSERT loop (write-side, separate concern).
- `audit-logs` is already `LIMIT 100`; leaving as-is (could add pagination later).
- Tabs that load bounded config data (RoleLimits, Settings, Info, ModelPricing, TokenPacks) — already cheap, no change.

### Verification
- `npm run build` (frontend, no TS errors).
- `pytest backend/tests` — existing admin tests updated to read `.items`; new pagination tests green.
- Manual: open Admin → dashboard loads fast; each list tab paginates; filters work; mutating an item refreshes only the current page.