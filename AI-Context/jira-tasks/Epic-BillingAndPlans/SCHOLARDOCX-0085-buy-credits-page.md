# SCHOLARDOCX-0085: Buy AI Credits as a full page

Status: In Progress
Owner: AI Agent

Epic: Epic-BillingAndPlans
Created: 2026-06-27

## Summary

"Buy More AI Credits" currently opens a modal (`BuyTokensModal`), while "View
Subscription Plans" opens a full-page view (`PlanComparisonView`). Make the two
related money actions consistent by converting the buy-credits flow into a
**full-page view** (`BuyTokensView`) that mirrors the plans-page chrome, and make
the two rows on the Profile → *Subscription & Plans* card consistent. Every buy
trigger (the balance widget, the Profile card row, the out-of-tokens modal) now
navigates to this page instead of opening a modal. UI refactor only — no API,
schema, or permission changes.

## Confirmed Decisions

- The buy-credits page is a **hidden view** (`activeTab === "buy-credits"`),
  reached via triggers + a back button — same pattern as `plans`. **No new sidebar
  item.**
- Navigation reuses the existing `scholardocx:navigate` window event
  (`lib/tokenEvents.ts::emitNavigate`), which `App.tsx` already maps to
  `setActiveTab`. No new event bus.
- The page mirrors `PlanComparisonView` chrome (back button + title + subtitle +
  segmented toggle) and card style (`rounded-3xl`, gradients, big amount, CTA).
- The live balance pill (`AiTokenWidget`) gains an `interactive` prop so it can
  render as a non-interactive `<span>` trailing element inside the card's
  action-row button (no nested buttons).
- `OutOfTokensModal` stays a modal (a quick 402 nudge); only its "Buy AI credits"
  CTA reroutes to the page.
- `BuyTokensModal.tsx` is deleted once nothing renders it.

## Functional Context

Links:

- Functional file: [AI-Context/functional/feature-ai-token-economy.md](../../functional/feature-ai-token-economy.md)

## Technical Context

Links:

- Technical file: [AI-Context/technical/ai-token-economy.md](../../technical/ai-token-economy.md)

## Scope

In scope:

- New `frontend/src/components/BuyTokensView.tsx` (page chrome + packs grid + My
  Requests + canPurchasePacks upsell + balance strip).
- `App.tsx`: `buy-credits` render branch; pass `onBuyCredits` to `ProfileView`.
- `contexts/TokenEconomyContext.tsx`: drop `BuyTokensModal`; `openBuyTokens` →
  `emitNavigate("buy-credits")`; out-of-tokens CTA navigates.
- `components/AiTokenWidget.tsx`: `interactive` prop.
- `components/ProfileView.tsx`: `onBuyCredits` prop; "Buy More AI Credits" row
  becomes a `profile-action-row` button consistent with "View Subscription Plans".
- Delete `components/BuyTokensModal.tsx`.

Out of scope:

- Backend (no endpoint, schema, or permission changes).
- The pack request/approve flow itself (unchanged).
- `OutOfTokensModal` remaining a modal.

## Implementation Plan

- frontend/src/components/BuyTokensView.tsx — new (mirror PlanComparisonView;
  reuse packs/request endpoints + logic from BuyTokensModal).
- frontend/src/App.tsx — import + render branch + `onBuyCredits` to ProfileView.
- frontend/src/contexts/TokenEconomyContext.tsx — remove modal, reroute
  `openBuyTokens` + out-of-tokens CTA via `emitNavigate`.
- frontend/src/components/AiTokenWidget.tsx — `interactive` prop (span vs button).
- frontend/src/components/ProfileView.tsx — `onBuyCredits`; consistent action row.
- frontend/src/components/BuyTokensModal.tsx — delete.

## Unit Test Plan

Unit tests needed: No (frontend-only UI refactor; verified by tsc + build + manual).

## Verification Plan

- `cd frontend && npx tsc --noEmit` clean; `npm run build` clean.
- Manual: Profile card rows consistent; "Buy More AI Credits" opens the page (not
  a modal) with Packs/My-Requests toggle, pack cards, balance strip, Request +
  cancel; back returns to Profile. Out-of-tokens modal "Buy AI credits" → page.
  Non-purchasing plan sees the upsell → Choose Plan.
