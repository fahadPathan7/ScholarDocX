# SCHOLARDOCX-0189: Research Metrics Shows Real Credits + Reusable Research Defaults

Status: Done

Owner: AI Agent

Epic: Epic-AdvisorAtlas

Created: 2026-07-28

## Summary

Two user-requested changes to Advisor Atlas, from the same live dossier
report:

1. **The dossier's Research Metrics panel showed "Est. tokens" (e.g.
   "52,960")** — the word "tokens" must never appear to a user (this app only
   ever says "credits"), and the figure itself was a raw token *estimate*,
   not the real amount actually cut from the user's balance. Fixed: the
   panel now shows "Credits used", computed from the real credits charged
   across every billed call the run made (GLM chat/vision + OpenAlex;
   Tavily is deliberately billed at $0 for Advisor Atlas and contributes
   nothing).
2. **Judge the Professor-mode search form's inputs** (University name,
   Official professor URL, Department/research area, Professor name,
   Intended intake, Degree target, Research interests — all required) and
   reduce redundant re-entry, specifically calling out that interests,
   intake, and degree target are stable across searches. Added an explicit,
   user-managed "Research Defaults" entry point **inside Advisor Atlas
   itself** (the search form has a "Research defaults" row that opens an
   edit modal); the form reads these values directly at submit time — there
   is no separate per-search copy of interests/degree/intake anymore.
   University name, official URL, department, and professor name stay
   required per-search — they inherently differ every time and are the
   whole point of naming one professor to investigate.

   **Correction mid-implementation**: the first version of this put the
   Research Defaults card on the Profile page and kept degree
   target/intake/interests as separate, prefilled fields on the search form
   (a duplicate copy the user could still edit per search without touching
   the saved defaults). The user corrected this: the entry point belongs
   inside Advisor Atlas, not the generic Profile page, and the search form
   should not carry a duplicate set of these fields at all. Reworked to a
   single source of truth (the saved defaults, edited from a button on the
   search form itself) — see Part 2 below and the Correction subsection in
   Technical Context.

## Business Context

Users only ever see "credits" as the unit of AI usage everywhere else in the
app (dashboard, admin, purchases) — a Research Metrics panel saying "tokens"
is jargon leakage that also, separately, understated real accuracy since it
was an estimate rather than the actual ledger deduction.

Re-typing the same interests/degree/intake before every Professor-mode
search is friction with no benefit — those three facts don't change between
searches for a given applicant, unlike the professor/university identity
fields, which are different by definition on every search.

**Important precedent, considered before implementing**: SCHOLARDOCX-0178
removed "Hunt Profile" (Scholarship Hunt's near-identical reusable-fields
concept) because its required setup modal + gate before searching added
friction for a payoff (a client-side fit score) the user judged wasn't worth
it. Flagged this directly to the user before building anything here. The
user's explicit choice for this feature: an **explicit save/manage screen**
(not a silent auto-remembering prefill) on the **backend** (not
localStorage-only) — deliberately still with **no gate**: the search form
works standalone whether or not defaults were ever saved, so it does not
repeat Hunt Profile's actual problem (the required gate), only its
"give values once, reuse them" convenience.

## Functional Context

Links: `AI-Context/functional/feature-advisor-atlas.md`

- **Added FR-9.61**: Research Metrics must show real total credits deducted
  (GLM + metered external calls), labeled "credits", never "tokens".
- **Added FR-9.62**: Interests/degree target/intake are saved once as
  Advisor Atlas research defaults, edited from a "Research defaults" row on
  the Advisor Atlas search form itself (not the Profile page — this belongs
  to the feature that uses it). There is no separate per-search copy: every
  search reads these values directly, and no search is ever gated on
  defaults existing (an empty/incomplete state just surfaces a clear inline
  validation message pointing at the same row). University name/official
  URL/department/professor name remain per-search only.
- **Updated FR-9.3** to reference the new reusable-defaults path.

## Technical Context

Links: `AI-Context/technical/ai-integrations.md`

### Part 1 — Real credits in Research Metrics

- `backend/app/services/ai.py`:
  - `charge_tokens()` now returns the `ai_tokens.charge()` result dict (was
    `-> None`), whose `charged` field is the real credits deducted.
  - `charge_external_call()` now returns the `ai_tokens.charge_flat_fee()`
    result dict (was `-> bool`); `None` when no billing context, zero cost,
    or a failed charge (never raises).
  - `chat()` merges `credits_charged` (from `charge_tokens()`'s result) into
    its returned `usage` dict when a charge was raised.
- `backend/app/services/advisor_atlas/analysis.py`:
  - `_record_ai_usage()` gained a `response_usage` parameter; accumulates
    `usage["credits_charged"]` from it. All three `ai_service.chat()` call
    sites (final synthesis, specialist passes, unit mapping) now pass
    `response.get("usage")` through.
  - `analyze_visual_source()`'s direct `charge_tokens()` call (vision path)
    now captures the returned dict and accumulates the same way.
- `backend/app/services/advisor_atlas/service.py`:
  - `_attach_scholarly_record()`'s OpenAlex `charge_external_call()` site
    captures the result and accumulates `usage["credits_charged"]`.
  - `_new_usage()` initializes `"credits_charged": 0`.
  - `research_metrics` dict: replaced `estimated_input_tokens` /
    `estimated_output_tokens` / `estimated_total_tokens` / `token_measurement`
    with a single `credits_used` field sourced from
    `usage.get("credits_charged", 0)`.
- Frontend: `AdvisorDossierDrawer.tsx`'s `ResearchMetrics` — "Est. tokens" ->
  "Credits used", reading `value.credits_used`. `advisorAtlasApi.ts`'s
  `research_metrics` type updated to match (dropped the estimate fields,
  added `credits_used` / `openalex_lookups`).
- Verified directly (not pytest): `charge_tokens()`/`charge_external_call()`
  return `None` with no billing context attached (confirmed against a real
  `AiService(Settings())`); `_record_ai_usage` and
  `analyze_professor_specialists` correctly accumulate `credits_charged`
  across multiple passes with a mocked `ai_service.chat()`; `_new_usage()`
  initializes the new field. Confirmed only one other caller each of
  `charge_tokens()` (`deep_hunt_query_planner.py`, x2) and
  `charge_external_call()` (this same OpenAlex site — no other caller
  exists), and neither used the old return value, so the type change is
  additive.

### Part 2 — Advisor Atlas Research Defaults

- `backend/app/db/models.py`: `LocalProfiles.advisor_profile_json` (Text,
  server_default `'{}'`) — JSON blob `{interests, degree_target,
  intake_term}`, same shape as the per-run `research_profile_json` on
  `AdvisorAtlasRuns`.
- `backend/app/db/connection.py`: `_add_advisor_profile_column()` (`ADD
  COLUMN IF NOT EXISTS`, called from `initialize_database`), matching the
  existing migration-helper pattern.
- `backend/app/services/store.py`: `advisor_profile_json` added to
  `local_profiles`'s writable-fields set in `TABLE_COLUMNS`. No new API
  route — reuses the existing generic `local_profiles` CRUD routes
  (`GET/POST/PATCH /local_profiles`) already used by the Profile page for
  identity/avatar/notifications.
- Frontend:
  - `advisorAtlasApi.ts`: `AdvisorResearchDefaults` type,
    `getAdvisorResearchDefaults()` / `saveAdvisorResearchDefaults()` — thin
    wrappers around `GET/POST/PATCH /local_profiles`, parsing/serializing
    `advisor_profile_json`.
  - New `advisor-atlas/AdvisorResearchDefaultsModal.tsx` — the only new
    component (the edit form: degree target select, intake term input, up
    to 5 interest fields). Uses the canonical `<Modal>` component (per
    AGENTS.md "Modal backdrop blur"), not a copied inline backdrop.
  - `AdvisorAtlasSearchForm.tsx` — rewritten to hold University
    name/Official URL/Department/Professor name as its only per-search form
    state. Interests/degree target/intake term were removed from the form
    entirely and replaced with a single "Research defaults \*" row
    (reusing the existing `.atlas-profile-toggle` row style) showing a
    live summary (`"2 interests · PhD · Fall 2027"` or a not-set-up
    prompt) and opening `AdvisorResearchDefaultsModal` directly — this
    button lives inside Advisor Atlas, not the Profile page. Defaults are
    fetched once on mount into `defaults` state; `onSaved` from the modal
    updates that same state in place, so the very next submit (no reload
    needed) uses the new values. Validation (`submit()`) reads
    `defaults.interests` / `.degree_target` / `.intake_term` directly and,
    when incomplete, tells the user to fix it in Research Defaults rather
    than referencing per-search fields that no longer exist.
- Verified directly (not pytest) against the real database: ran
  `initialize_database()` and confirmed the `advisor_profile_json` column
  exists with the correct type/default; created a throwaway test
  user+`local_profiles` row via `Store.create_record`, round-tripped a
  realistic defaults payload through `create_record`/`list_records`, then
  deleted the test user and row via `cleanup_user_records`. `npx tsc
  --noEmit` clean across the frontend after the rework.

### Correction: entry point moved into Advisor Atlas, duplicate fields removed

First pass put the edit entry point on the Profile page
(`AdvisorResearchDefaultsCard.tsx`) and kept the search form's
interests/degree/intake as separate fields, merely *prefilled* from the
saved defaults — meaning the form still carried a full duplicate copy of
these inputs, and a user could drift the two out of sync per search. The
user corrected both parts: the button belongs inside Advisor Atlas (the
feature that actually uses these values), and the duplicate fields must be
removed from the search form outright, not just prefilled. Fixed by
deleting `AdvisorResearchDefaultsCard.tsx`, removing the addition from
`ProfileView.tsx`, and reworking `AdvisorAtlasSearchForm.tsx` so the saved
defaults are the single source of truth read directly at submit time, with
one "Research defaults" row (living in the search form, i.e. inside Advisor
Atlas) as the only way to view or change them.

## Scope

In scope:
- Backend: `app/services/ai.py`, `app/services/advisor_atlas/analysis.py`,
  `app/services/advisor_atlas/service.py`, `app/db/models.py`,
  `app/db/connection.py`, `app/services/store.py`.
- Frontend: `advisorAtlasApi.ts`, `AdvisorDossierDrawer.tsx`,
  `AdvisorAtlasSearchForm.tsx`, new `AdvisorResearchDefaultsModal.tsx`.
  (`ProfileView.tsx` and `AdvisorResearchDefaultsCard.tsx` were touched then
  reverted/deleted — see Correction subsection in Technical Context.)
- New tests: `backend/tests/unit/test_advisor_atlas_credits.py`,
  `backend/tests/unit/test_advisor_atlas_research_defaults.py`.

Explicitly out of scope (a judgment call made and recorded here, not
implemented differently without further direction):
- Making University name, Official professor URL, Department/research area,
  or Professor name optional or removable in Professor mode. These are
  per-search-necessary by definition — Professor mode's entire purpose is a
  deep dive on one named professor at one named institution, and the
  official URL specifically anchors identity confidently (already the
  documented reason it exists). Loosening these would trade accuracy for a
  friction reduction that the reusable-defaults change already delivers for
  the fields that actually are stable across searches.
- A separate per-search override copy of interests/degree/intake. There is
  exactly one copy of these values (the saved defaults); the search form has
  no independent state for them at all.
- A dedicated new API endpoint for research defaults. The existing generic
  `local_profiles` CRUD routes already cover create/read/update; adding a
  parallel endpoint would be an unrequired abstraction.

## Verification Plan

- Backend: direct script execution (not pytest, per project policy) against
  the real dev/prod-shared Postgres DB, with cleanup — covered above in
  Technical Context for both parts.
- `python -m py_compile` on every changed backend file.
- `cd frontend && npx tsc --noEmit` — clean.
- Unit tests added, not run this session (per project policy):
  `test_advisor_atlas_credits.py`, `test_advisor_atlas_research_defaults.py`.

## Completion Notes

Changed files: see Technical Context above (Parts 1 and 2).

Verification completed: see Verification Plan above.

### Correction: portal event bubbling caused a false validation error

After the placement fix above, the user reported the search form's own
validation error ("Professor search requires university name, official
professor URL...") appearing without ever clicking "Start search". Root
cause: `AdvisorResearchDefaultsModal`'s `<form>` renders via `<Modal>`'s
`createPortal` — physically outside the search form in the DOM, but still a
descendant of it in the *React tree* (it's rendered from JSX nested inside
`AdvisorAtlasSearchForm`'s own `<form>`). React's synthetic event system
propagates across portal boundaries according to the React tree, not the DOM
tree, so submitting the modal (clicking "Save defaults") also bubbled a
`submit` event up to the outer search form's `onSubmit`, running its
validation and showing its error box. Fixed with `event.stopPropagation()`
in `AdvisorResearchDefaultsModal`'s `handleSubmit`, alongside the existing
`preventDefault()`.

Follow-ups:
- No visual/browser check was done for the new "Research defaults" row and
  modal (no login credentials available for live UI testing in this
  session, consistent with prior tickets in this project) — `tsc --noEmit`
  and the backend round-trip are the verification that exists; a manual
  click-through is recommended before considering this fully done
  end-to-end.
- General note for future features: prefer putting a feature's own settings
  entry point inside that feature, not the generic Profile page, unless the
  setting is genuinely account-wide (identity, notifications, password).
