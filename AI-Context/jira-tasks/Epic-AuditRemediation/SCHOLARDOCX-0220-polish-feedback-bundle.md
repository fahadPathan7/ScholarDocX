# SCHOLARDOCX-0220: Polish + feedback bundle (audit batch 4)

Status: Review

Owner: AI Agent

Epic: Epic-AuditRemediation

Created: 2026-11-01

## Summary

Small-to-medium audit findings that improve day-to-day feedback loops: copy/export
for AI outputs, a path from "out of credits" to usage detail, purchase outcomes
that announce themselves, plan cancellation properly clearing, block/suspend
permissions separated, and a per-user TTL cache that stops re-paying for identical
external searches.

## Business Context

Links:

- Business file: [../business/decisions.md](../../business/decisions.md) (BD-011)

Business value:

- Users can take their AI work with them (copy, export) and understand their credit spend.
- Purchases/approvals no longer require polling the Buy page to notice success.
- Operator saves money on repeat identical searches (Deep Hunt re-runs, watchlists).

## Functional Context

Links:

- Functional file: [../functional/feature-ai-token-economy.md](../../functional/feature-ai-token-economy.md)

Requirements:

- Copy + Markdown export on assistant answers and saved analyses.
- OutOfTokensModal offers "See usage".
- Credit grants (webhook purchase, admin approval) create a `billing` notification.
- `subscription.uncanceled` clears the cancel-at-period-end flag.

## Technical Context

Links:

- Technical file: [../technical/billing-and-payments.md](../../technical/billing-and-payments.md) (webhook follow-ups list)
- Technical file: [../technical/billing-contract.md](../../technical/billing-contract.md)

Technical notes:

- Cache correctness rule: a cached result is NOT a provider call, so it must NOT charge. The charge stays inside the provider-calling function; the cache wraps outside it.
- Notifications rows mirror the admin announcement INSERT shape (user_id, title, body, notification_type='general', preference_key='billing'), gated by `is_notification_enabled`.
- `admin_block_user` seeds with the same default as `admin_suspend_user` (backward compatible); a feature with no role_limits row is denied, so ship the seed in the same change.

## Scope

In scope:

Frontend:
1. Copy button per assistant message (raw markdown); export current chat session as a .md download; export/copy for Research Expert analysis output.
2. OutOfTokensModal "See usage" — App-level UsageModal mount opened via a small custom-event helper (mirroring `lib/tokenEvents.ts`); no provider restructuring.
3. BuyTokensView refetches packs/requests/balance on window focus.
4. AdvisorAtlasView: shortlist toggle + reloadActive get try/catch + toast.
5. Dead CSS removal (`.deep-hunt-locked` in deep-hunt.css, `.models-modal-backdrop` in about-refresh.css) after grep proves unused.

Backend:
6. `order.created` grant + admin purchase-request approval insert a billing notification (respecting prefs).
7. `subscription.uncanceled` routed: clear `polar_cancel_at_period_end`.
8. Separate `admin_block_user` role-limit key gating `toggle_user_block` (seed default = current suspend value).
9. Per-user 15-min TTL cache for Brave searches and Tavily searches keyed on normalized query+params; cache hit returns without provider call or charge.

Out of scope:

- past_due/dunning (needs product decision), refunds, admin list pagination, streaming, persisted chat history, mobile breakpoint, dark mode.

## Acceptance Criteria

- Copy/export buttons present and jargon-free; downloads produce valid .md.
- "See usage" opens the usage detail from the out-of-credits modal.
- A webhook credit grant produces one notification row for the buyer; an approval produces one for the requester.
- `uncanceled` payload clears the flag and preserves roles.
- Blocking uses `admin_block_user`; suspend still uses `admin_suspend_user`; fresh installs seed both.
- Second identical search within TTL makes no provider call and no charge; different query or expired TTL does.

## Implementation Plan

- Two parallel agents (backend / frontend), disjoint files; then verification + commits.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- Grant notification on order.created + on approval (webhook handler level + service level), pref-disabled → none.
- uncanceled clears flag, roles untouched.
- toggle_user_block denied without admin_block_user, allowed with (mirror existing suspend tests).
- Cache: second identical call hits cache (provider fn called once, charge once); distinct query misses; TTL expiry misses.

## File Size Check

Files expected to be edited:

- backend: `api/webhooks.py`, `services/ai_tokens.py` (localized), `services/admin.py` + `api/admin.py` (localized), `services/brave_search_service.py`, `services/ai.py` (localized), tests.
- frontend: `FloatingAssistant.tsx`, `ResearchExpertView.tsx`, `OutOfTokensModal.tsx`, `UsageModal.tsx` (props only if needed), `App.tsx`, new `lib/usageEvents.ts`, `BuyTokensView.tsx`, `AdvisorAtlasView.tsx`, `news/deep-hunt.css`, `about-refresh.css`.

Line-count risk:

- Medium — several files are over/near the grace cap; localized additions only.

## Verification Plan

- `npx tsc --noEmit`; `python -m compileall -q app`; both guard scripts; jargon scan.

## Completion Notes

Changed files:

Backend:
- `services/ai_tokens.py` — `notify_credits_granted` (best-effort billing notification, pref-gated, never raises); called after the commit in `resolve_purchase_request` approval so its rollback can never wipe the grant.
- `api/webhooks.py` — `subscription.uncanceled` routed (clears `polar_cancel_at_period_end`, restores renewal fields, roles untouched, 500-on-missing-user for retry); `order.created` grant now notifies the buyer.
- `services/admin.py` — `admin_block_user` seeded for both admin roles (same default suspend had; idempotent `_seed_role_limits` backfills existing installs).
- `api/admin.py` — `toggle_user_block` gated on its own key.
- `services/search_cache.py` (new) — bounded 15-min per-user TTL cache; wired into Deep Hunt's Brave passes and `/ai/research`'s Tavily call with the billing rule enforced: cache hit = no provider call = no charge.

Frontend:
- `FloatingAssistant.tsx` + `ResearchExpertView.tsx` (+ styles) — copy button on assistant messages, chat-export and analysis "Download .md" (from the agent's partial run, reviewed).
- `lib/usageEvents.ts` (new) + `App.tsx` + `OutOfTokensModal.tsx` — "See usage" opens an app-level UsageModal via the tokenEvents-style bus.
- `BuyTokensView.tsx` — debounced refetch of packs/requests/balance on window focus/visibility.
- `AdvisorAtlasView.tsx` — shortlist + reloadActive error handling.
- `admin/RoleLimitsTab.tsx` — "Can Block Users" entry.
- Dead CSS removed: `.deep-hunt-locked` (deep-hunt.css), `.models-modal-backdrop` + its keyframes (about-refresh.css) — grep-verified zero references.

Verification completed:

- `npx tsc --noEmit` exit 0; `python -m compileall -q app` OK; `check-provider-call-billing.py` + `check-context-drift.py` ok; copy scan clean. No test execution (CODE_RULES).

Unit tests added or updated:

- `tests/unit/test_webhooks.py` — order grant creates the exact billing notification; uncanceled clears flag/renews/roles-untouched; uncanceled user-not-found → 500.
- `tests/unit/test_polish_bundle_0220.py` (new) — notify helper (enabled/disabled pref/never-raises); block endpoint uses its own permission key; seed presence for both roles; cache roundtrip, user isolation, param sensitivity, TTL expiry, bounded eviction.

Follow-ups:

- past_due/dunning and refund handling still need product decisions (out of scope by design).
- The 0220 implementation agents hit the account usage limit mid-run; the frontend agent's partial work (copy/export/See usage) was reviewed and kept, the rest was completed manually in-session.
