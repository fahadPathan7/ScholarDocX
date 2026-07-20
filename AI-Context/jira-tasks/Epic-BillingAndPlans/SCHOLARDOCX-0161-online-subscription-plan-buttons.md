# SCHOLARDOCX-0161: Redirect Online Subscribed Users to Portal & Disable Free Downgrade

Status: Completed
Owner: AI Agent

Epic: Epic-BillingAndPlans
Created: 2026-07-21

## Summary
In `PlanComparisonView.tsx`, when a user has an active online subscription (`user.polar_subscription_id`), disable manual plan change/downgrade for the Free plan option ("Downgrade Disabled") and redirect paid plan options (Basic, Pro, Max) to the online subscription management portal (`/auth/plans/portal`).

## Scope
- `frontend/src/components/PlanComparisonView.tsx`:
  - Detect `isOnlineSubscribed = Boolean(user?.polar_subscription_id)`.
  - Disable CTA button for `free_user` when online subscribed.
  - Set paid plan CTA buttons (Basic, Pro, Max) to trigger `handleManageOnlineSubscription()` redirect when online subscribed.

## Changed Files
- `frontend/src/components/PlanComparisonView.tsx`

## Verification
- `npx tsc --noEmit` passed with 0 errors.
- `npm run build` passed cleanly.

