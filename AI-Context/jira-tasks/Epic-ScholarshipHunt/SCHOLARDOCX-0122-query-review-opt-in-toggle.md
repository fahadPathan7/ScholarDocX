# SCHOLARDOCX-0122: Query-Review Dialog Becomes An Opt-In Toggle (OD-2)

Status: Done

Owner: AI Agent

Epic: Epic-ScholarshipHunt

Created: 2026-07-03

## Summary

Demote the mandatory beta query-review dialog (FR-8.24) to an opt-in,
default-off local toggle, since structured extraction (SCHOLARDOCX-0120) is
now the quality-control surface instead of manual query QA before every
search.

## Business Context

Links:

- Business file: [decisions.md](../../business/decisions.md) (BD-010, OD-2)

Business value:

Removes friction from most searches per the planbook's diagnosis ("high
interaction cost... friction with no payoff for most searches").

## Functional Context

Links:

- Functional file: [feature-scholarship-news.md](../../functional/feature-scholarship-news.md)

Requirements:

- FR-8.24 (updated): dialog controlled by a local, default-off "Review query
  before search" toggle; when off, the generated/fallback query is
  auto-approved and the dialog does not appear.

## Technical Context

Links:

- Technical file: [api-boundaries.md](../../technical/api-boundaries.md)

Technical notes:

- No backend change: `/news/query-preview` → `/news/search` call sequence
  and billing (FR-8.26) are unchanged either way; only whether the frontend
  pauses for user approval changes.
- `frontend/src/components/news/QueryReviewDialog.tsx`: when the toggle is
  off, the caller in `ScholarshipNewsView.tsx` calls `/news/query-preview`,
  then immediately calls `/news/search` with the returned query as both
  initial and approved query (mirrors what "approve unchanged" already does
  today), without rendering the dialog.
- Toggle state is a local UI preference (not a new backend setting) — persist
  the same way other local Scholarship Hunt UI state persists today.

## Scope

In scope:

- The default-off toggle and the auto-approve path when it's off.
- Toggle remains available (on) for users who want to keep reviewing/editing
  queries.

Out of scope:

- Any change to query generation, OpenRouter fallback, or feedback storage
  (FR-8.25–8.30 unchanged).

## Acceptance Criteria

- With the toggle off (default), starting a search does not show the
  review dialog and completes with the generated/fallback query.
- With the toggle on, existing FR-8.24–8.30 behavior is unchanged (dialog
  appears, edit/approve/confirm flow works as before).
- Quota/token charging behavior is identical in both modes (one
  `can_use_scholarship_hunt` charge, unchanged `/news/query-preview` +
  `/news/search` sequence).

## Implementation Plan

- Add the toggle to `ScholarshipNewsView.tsx`'s search controls, default off.
- Branch the search-trigger handler: toggle on → existing dialog flow;
  toggle off → call query-preview then immediately search with the same
  query, skipping the dialog render.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- Frontend: search-trigger handler test asserting the dialog is not
  rendered when the toggle is off and that the approved query passed to
  `/news/search` equals the query-preview response.

If no unit tests are needed, explain why:

- N/A

## File Size Check

Files expected to be edited:

- `frontend/src/components/ScholarshipNewsView.tsx`
- `frontend/src/components/news/QueryReviewDialog.tsx`

Line-count risk:

- Low.

If any file exceeds 1000 lines, explain why.

- N/A

## Verification Plan

- `cd frontend && npm run build`
- Manual: with the toggle off, run a search and confirm no dialog appears
  and results return; turn the toggle on and confirm the dialog reappears
  with the existing edit/approve flow intact.

## Completion Notes

Changed files:

- `frontend/src/components/ScholarshipNewsView.tsx` — `reviewQueryBeforeSearch`
  state (default off, persisted to `localStorage`), toolbar checkbox, and
  branching in `handleApplyFilters`/`handleRefineCustomPrompt`: when off,
  `previewNewsQuery` still runs (so billing/feedback storage is unchanged)
  but the result is passed straight to `fetchNews` instead of opening
  `QueryReviewDialog`.

Verification completed:

- `cd frontend && npm run build`: passed.
- Live authenticated browser check: with the toggle left at its default
  (off), submitting a Master's-level search went straight to 12 live
  results with no dialog interruption — the toolbar correctly showed the
  unchecked "Review query before search" checkbox throughout. Existing
  `/news/query-preview` → `/news/search` call sequence and billing were
  unaffected (confirmed via backend request log — exactly one query-preview
  call followed by the search).

Unit tests added or updated:

- No new frontend unit tests were added; this is a UI branching change in
  an already-complex, untested component (`ScholarshipNewsView.tsx` has no
  existing `*.test.tsx`), verified via the live browser run above instead.
  Toggle-on (dialog still appears) was not re-verified this session since
  that code path is unchanged from the pre-existing, already-shipped
  `QueryReviewDialog` flow.

Follow-ups:

- None.
