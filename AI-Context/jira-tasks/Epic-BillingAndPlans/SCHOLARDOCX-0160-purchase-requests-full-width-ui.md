# SCHOLARDOCX-0160: Enhance My Purchase Requests UI to Full Width

Status: Completed
Owner: AI Agent

Epic: Epic-BillingAndPlans
Created: 2026-07-21

## Summary
Refactor the "My Purchase Requests" history section in `BuyTokensView.tsx` from half-width (`max-w-3xl`) to a full-width layout. Enhance the UI aesthetics with modern card/table styling, status badges, price and credit formatting, admin review notes, filtering, and refined empty state visuals.

## Scope
- `frontend/src/components/BuyTokensView.tsx`:
  - Change requests container width from restricted `max-w-3xl` to full width `w-full`.
  - Design a rich, modern UI for request items (token amount badge, price display, status pill, request & review dates, admin feedback block, cancel button for pending requests).
  - Add filter buttons (All, Pending, Approved, Cancelled / Rejected) to easily inspect requests.
  - Enhance empty state visual design with CTA to switch to Packs tab.

## Changed Files
- `frontend/src/components/BuyTokensView.tsx`

## Verification
- `npx tsc --noEmit` passed with 0 errors.
- `npm run build` passed cleanly.

