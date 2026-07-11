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

- AI chat, research, summarize, and agent plan/execute calls.
- Advisor Atlas internal AI passes (discovery, analysis, vision, summaries).
- Scholarship Hunt **query building** (the AI step). This no longer counts
  toward the Scholarship Hunt daily/monthly **search** limit.

## What Does NOT Move Tokens

- Scholarship Hunt **search** itself (Tavily / web search) keeps its own
  daily/monthly search limits, independent of the AI token balance.

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

## Related

- Design: [planbook/central-ai-token-economy.md](../planbook/central-ai-token-economy.md)
- Technical: [technical/ai-token-economy.md](../technical/ai-token-economy.md)
