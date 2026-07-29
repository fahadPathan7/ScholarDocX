# Feature: AI Token Economy

## Summary

AI usage (chat, research, summarize, Advisor Atlas passes, Scholarship Hunt
query building) is metered by a central per-user **AI token balance**, replacing
the older count-based chat/run limits. Role-based can/can't-use permissions stay.

## User-Facing Behavior

- Every user has an **AI token balance** with two buckets:
  - **Subscription tokens**: a monthly allowance set per subscription tier;
    resets each month; unused tokens do not roll over.
  - **Purchased tokens**: bought via Extra Token packs; never expire.
- Subscription tokens are consumed first, then purchased tokens.
- Users can use AI chat, Advisor Atlas, and Scholarship Hunt query building as
  many times as they want **as long as they have tokens**.
- When the balance reaches zero, AI requests are **blocked** with a clear
  "out of tokens" message and a way to request more.
- Users see their balance, monthly cap, usage this month, and reset date.
  "Usage this month" is tracked per billing period (not derived from the allowance),
  so it stays accurate even if the plan or allowance changes mid-period.
- Users can **request** an Extra Token pack (Small / Medium / Large). An admin
  approves the request; on approval the purchased tokens are added. Payment is
  settled outside the app (secure personal workspace; no payment backend).
- **Token-pack purchasing is a premium-tier privilege.** Whether a plan can buy
  packs is controlled per role by `can_purchase_token_packs` (admin-configurable
  in the role-limits editor). Defaults: `pro_user` and `max_user` can purchase;
  `free_user` and `general_user` cannot. A user on a plan that cannot purchase
  still sees the token widget and "Buy tokens" entry, but opening it shows an
  **upgrade upsell** (link to Choose Plan) instead of the pack list; the backend
  also rejects their purchase requests with 403.
- The plan chooser shows "Extra AI tokens purchasable" as a ✓/✗ row per tier,
  driven by the same role limit.
- **Buying packs is a full page, not a modal.** "Buy More AI Credits" opens a
  dedicated page (`BuyTokensView`, the `buy-credits` view) styled consistently with
  the Subscription Plans page — same header/back button and a Packs / My Requests
  toggle — showing the live balance, the pack cards with a Request action, and the
  user's request history. The "Buy More AI Credits" and "View Subscription Plans"
  rows on the Profile → *Subscription & Plans* card are consistent action rows;
  the balance widget, that card row, and the out-of-tokens prompt all navigate to
  the page rather than opening a modal. (See SCHOLARDOCX-0085.)

## What Counts as Token Usage

**Everything the app pays a third party for, on that user's behalf.** There is no
exempt category — see [BD-011](../business/decisions.md). In particular a call is
still billed when it runs in a background task, is a fallback after a failed
attempt, uses a model the provider prices at $0, is auxiliary rather than
user-initiated (routing, query planning, relevance scoring, summarization), or
produced a result that was filtered out and never shown.

- AI chat, research, summarize, and agent plan/execute calls.
- Advisor Atlas internal passes: discovery, analysis, vision, summaries, its web
  searches, and its OpenAlex author lookups.
- Scholarship Hunt: query building, per-result search fees, opportunity
  extraction, and relevance filtering.
- Research Expert: paper embedding (upload and retry), analysis-query embedding,
  and the analysis call itself.
- Web search issued by AI research.

## What Does NOT Move Tokens

- Anything that makes no external call: browsing the static scholarship catalog,
  reading saved records, the Opportunity Library, sticky notes, whiteboards,
  brain games, and all workspace CRUD. These are governed by count-based role
  limits (`total_projects`, `total_sheets`, …), not by credits.
- ~~Scholarship Hunt **search** itself (Tavily / web search) keeps its own
  daily/monthly search limits, independent of the AI token balance.~~
  **SUPERSEDED:** the count-based search limits were removed in Phase 5, and
  Scholarship Hunt search is now billed per raw Brave result (SCHOLARDOCX-0175).

> **SCHOLARDOCX-0204 (fixed):** four of the paths above used to go unbilled —
> the Deep Hunt query planner and relevance filter, the extraction OpenRouter
> fallback, and every Advisor Atlas web search — and all OpenRouter charges
> evaluated to zero. All are now charged. Two user-visible figures legitimately
> increased as a result: the credits reported per Advisor Atlas run, and the
> charge for embedding a long paper. Coverage table:
> [technical/ai-token-economy.md](../technical/ai-token-economy.md#billing-coverage-scholardocx-0204--audited-and-fixed-2026-07-29).

## Admin Behavior

- Configure per-model real pricing (input + output $ per 1M tokens).
- Configure Extra Token packs (token amount + price).
- Set the monthly token allowance per subscription tier.
- Review and approve token pack purchase requests.
- View per-user token usage and manually grant/deduct tokens.

## Permissions

- Model pricing and pack configuration: **super_admin only**.
- Monthly allowances, request approval, usage viewing: admin.
- **Which plans may purchase token packs** (`can_purchase_token_packs`): admin
  toggles it per role in the role-limits editor (default pro/max on, free/general
  off).
- Buying/requesting packs and using AI: any active user with provider access
  and a positive token balance. (Note: Admins do NOT get any AI tokens, unlimited or otherwise, by virtue of being an admin. Admins must have a user role to receive any user-facing features or tokens. Admins only get access to the admin tabs.)

## Role-Limit Wiring Notes

- A user-tier role (`free_user` / `general_user` / `pro_user` / `max_user`) is
  required for every metered feature. An admin role alone resolves to no primary
  role and is refused — admins are not a billing identity.
- Plan expiry downgrades the user to `free_user`. Applied in one place
  (`app/auth/plan_state.py`) for both live requests and background billing, so a
  background run can no longer bill an expired user at their old tier. A
  suspended account resolves to no roles, which stops any queued run.
- A feature with no `role_limits` row is **denied** for every tier, and the
  denial is logged with the missing role/feature. Still ship the
  `DEFAULT_ROLE_LIMITS` entry in the same change as the gate — a missing row is
  now a broken feature rather than a silent giveaway.
- `admin_view_dashboard` is enforced server-side. `admin_manage_role_limits`
  remains a UI-only affordance by design: the endpoint it would gate
  (`GET /admin/limits`) is how the admin UI discovers its own permissions, so
  gating it would blank the whole admin view.

## Related

- Design: [planbook/central-ai-token-economy.md](../planbook/central-ai-token-economy.md)
- Technical: [technical/ai-token-economy.md](../technical/ai-token-economy.md)
- Decision: [BD-011 — the operator never absorbs provider cost](../business/decisions.md)
- Audit: [SCHOLARDOCX-0204](../jira-tasks/Epic-BillingAndPlans/SCHOLARDOCX-0204-billing-leak-audit-unbilled-provider-calls.md)
