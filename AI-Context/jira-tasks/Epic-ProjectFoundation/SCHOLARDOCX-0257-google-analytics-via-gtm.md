# SCHOLARDOCX-0257: Google Analytics via Google Tag Manager

Status: Done

Owner: AI Agent

Epic: Epic-ProjectFoundation

Created: 2026-11-12

## Summary

Add Google Tag Manager container `GTM-P5SJXF45` (GA4 is configured inside the
container) to the frontend.

## Business Context

Links:

- Business file: N/A

Business value:

- Usage analytics for product decisions.

Owner approval (2026-11-12): analytics approved (AGENTS.md / CLAUDE.md require
it). Public pages (/, /login, /register) are tracked without a prompt; pages
inside the signed-in app are tracked only after the user allows it, asked once
per user.

## Functional Context

Requirements:

- Analytics must never receive credentials or user content.
- Signed-in users are asked once (Allow / No thanks); the choice is remembered
  per user and the prompt never reappears on later pages or visits.

## Technical Context

Links:

- Technical file: AI-Context/technical/security-privacy.md

Technical notes:

- Google sign-in returns to `/auth-complete?token=...`; the full-screen sheet
  opens `/sheet/fullscreen?projectId=...&pageId=...`. A default GTM/GA page view
  records the full URL, so the tag would have sent login tokens to Google.
- `lib/analytics.ts` loads GTM only on a URL with no query string, no hash,
  and not under `/auth-complete`; it loads lazily on the first such URL
  (after the OAuth hand-off has navigated to `/dashboard`). SPA navigations
  push `spa_page_view` with a sanitized `page_location` (origin + path).
- In-app consent: `AnalyticsConsentBanner` (rendered in the signed-in shell)
  reads the user's saved choice (`scholardocx_analytics_consent_<userId>` in
  localStorage, with an in-memory fallback when storage is blocked) and calls
  `setAppAnalyticsConsent`. Non-public paths load/track only when granted;
  Consent Mode defaults to analytics granted / ads denied and is updated to
  denied inside the app without consent.
- Production builds only (`import.meta.env.PROD`) so local development does
  not pollute data. `VITE_GTM_ID` overrides the container id; an empty value
  disables analytics.
- The pasted snippet omitted the `gtm.start` / `gtm.js` dataLayer event the
  standard GTM loader pushes; without it, GTM's page-load triggers do not fire.
  It is pushed alongside `gtag('js', new Date())`.

## Scope

In scope:

- frontend/src/lib/analytics.ts, frontend/src/main.tsx, context docs.

Out of scope:

- GA4 / trigger configuration inside the GTM container (done in GTM).

## Acceptance Criteria

- `/auth-complete?token=x` never loads GTM; a later in-app page does.
- No GTM request in development builds.

## Implementation Plan

- As in technical notes.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- `lib/__tests__/analytics.test.ts`: URL safety rule and sanitized location.

## File Size Check

Files expected to be edited:

- main.tsx (small), new analytics.ts.

Line-count risk:

- Low

## Verification Plan

- vitest; tsc; production build check that the GTM id is present.

## Completion Notes

Changed files:

- frontend/src/lib/analytics.ts (new), frontend/src/main.tsx,
  frontend/src/components/AnalyticsConsentBanner.tsx (new),
  frontend/src/components/analytics-consent.css (new), frontend/src/App.tsx,
  frontend/src/lib/__tests__/analytics.test.ts (new),
  AI-Context/technical/security-privacy.md, AI-Context/technical/stack-and-runtime.md

Verification completed:

- tsc passes; analytics.test.ts 10/10 (URL safety, sanitized location,
  public pages tracked, in-app gated until allowed, decline after a public
  load, asked once per user); production build contains the container id.

Unit tests added or updated:

- analytics.test.ts

Follow-ups:

- Landing StatsBand copy "0 Data shared with third parties": owner to review
  the wording now that page-view analytics exist.
- Configure GA4 in the GTM container to use `spa_page_view` (or History
  Change) for in-app page views.
