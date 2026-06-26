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
- Users can **request** an Extra Token pack (Small / Medium / Large). An admin
  approves the request; on approval the purchased tokens are added. Payment is
  settled outside the app (local-first; no payment backend).

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
- Buying/requesting packs and using AI: any active user with provider access
  and a positive token balance. (Note: Admins do NOT get any AI tokens, unlimited or otherwise, by virtue of being an admin. Admins must have a user role to receive any user-facing features or tokens. Admins only get access to the admin tabs.)

## Related

- Design: [planbook/central-ai-token-economy.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/planbook/central-ai-token-economy.md)
- Technical: [technical/ai-token-economy.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/ai-token-economy.md)
