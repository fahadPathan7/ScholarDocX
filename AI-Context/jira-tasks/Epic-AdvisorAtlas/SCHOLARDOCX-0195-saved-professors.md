# SCHOLARDOCX-0195: "Save to professors" saved into a screen that did not exist

Status: Completed

Owner: AI Agent

Epic: Epic-AdvisorAtlas

Created: 2026-07-28

## Summary

User asked what "Saved to professors" means, then reported they could not find
where it saved. They were right — the write worked, the destination did not
exist.

`save_to_professors` creates a real `professors` row and links it back to the
candidate. But:

- `HierarchyView` in `App.tsx` — the component containing the Professor form —
  is **defined and never rendered**. Nothing imports it, no nav item reaches
  it.
- No nav entry for professors existed.
- Searching the frontend for professor fields (`research_interests`) returned
  only `App.tsx` (that dead view) and two Advisor Atlas components.

So the only reader of the `professors` table was the Advisor Atlas button that
had written to it. The button reported success and pointed nowhere.

## What was built

**Saved professors, as a mode of Advisor Atlas** (per the user's direction —
first built as a top-level nav item, then moved: "the saved professors should
be inside the advisor atlas", "this should work like as a feature of advisor
atlas"). The hero now carries a Search / Saved professors toggle, reusing the
existing `.atlas-mode-toggle` control rather than a new one.

`ProfessorsView` lists saved advisors grouped by university, with search across
name, title, email, interests and notes; inline edit and delete; a mailto link
when there is an email and an explicit "No email on file" when there is not.
Professors with no university land in an explicit "No university linked" group
rather than being dropped — every professor saved before this task has a null
`university_id`, and hiding them would recreate the original complaint in a new
place.

The save path now also **says where the record went**: the confirm names Saved
professors and what it is for, and the toast reads "Saved — find them under
Saved professors" instead of "Saved to ScholarDocX".

## Backend gaps fixed at the same time

1. **University and program were never linked.** `professors` has
   `university_id` and `program_id`; the save left both null even though the
   run knew the institution and department. `_resolve_university` /
   `_resolve_program` find or create the user's records and link them.
   `universities.country` is NOT NULL and Advisor Atlas does not capture it, so
   it is written as "Unspecified" rather than guessed.
2. **Name-only matching could merge two different people.** Matching is now
   scoped to the institution when it is known (falling back to name-only when
   it is not, rather than creating a duplicate). Same care as the candidate
   dedupe in SCHOLARDOCX-0190, which this path had never had.
3. **A re-save could erase hand-entered fields.** The update passed bare
   values, so any field this run happened not to find overwrote what the user
   had typed with NULL. Now `COALESCE(?, column)` — a re-save refreshes what
   the dossier knows and leaves the rest alone.

## Also fixed: a latent nav bug

The sidebar split workspace items from account items with hardcoded
`slice(0, 8)` / `slice(8)`, and the spacer keyed off `i === 8`. Inserting any
nav item above Profile silently pushed the last workspace item into the account
group — which is exactly what happened on the first attempt here. Both now
derive the boundary from the position of `profile`.

## Technical Context

- `frontend/src/lib/professors.ts` (**new**): `nameById`, `matchesQuery`,
  `groupByUniversity`, `isContactable`, `shouldRefetch`. Pure logic, no runtime
  imports (the `RecordMap` import is type-only), so it is testable in a project
  whose test setup has no renderer.
- `frontend/src/components/ProfessorsView.tsx`, `professors.css` (**new**).
- `AdvisorAtlasView.tsx`: `mode` toggle, `savedRefresh`, renders
  `ProfessorsView`; `confirmSave` copy names the destination.
- `AdvisorDossierDrawer.tsx`: save button tooltip, destination-naming toast.
- `App.tsx`: derived `accountNavStart`.
- `advisor_atlas/repository.py`: `_resolve_university`, `_resolve_program`,
  institution-scoped matching, COALESCE update.

## Scope

In scope: the files above plus
`frontend/src/lib/__tests__/professors.test.ts` (new).

Out of scope:
- Removing the dead `HierarchyView`. Tempting — it is what made this confusing
  — but see Follow-ups: it is also the only UI for four other record types.
- Back-linking a saved professor to the Advisor Atlas dossier they came from.
  Needs a column; worth doing if this area is revisited.

## Testing Note (CODE_RULES)

CODE_RULES requires a new page/tab component to be covered by a test proving it
handles `refreshTrigger`. The decision that effect makes is extracted into
`shouldRefetch` and tested directly (fires on an advancing trigger, not on 0,
absent, or negative — a mount-time fire would double every request).

What is **not** tested is the rendered behaviour: that a refresh leaves the
search box and a half-filled form untouched. This project has no DOM testing
library — `vitest` alone, no `@testing-library/react`, no `jsdom` — so no
component in this repo can be rendered in a test today, and adding that is a
dependency decision for the project owner rather than something to slip in
alongside a feature. Flagging rather than quietly declaring the rule met.

## Verification Plan

- Direct execution of all 14 logic assertions via `node --experimental-strip-
  types`: name lookup, search across every field including sparse records,
  grouping and sort order, unaffiliated professors retained, unknown university
  id degrading to the residue group rather than crashing, contactability, and
  the three `shouldRefetch` cases.
- `npx tsc --noEmit` clean; backend compiles.
- `vitest` could not be executed in this environment (`node_modules` holds the
  macOS rollup binary, not the Linux one) — the assertions were run directly
  against the module instead.
- Tests added, not run: `professors.test.ts`.

## Completion Notes

Changed files: as listed under Technical Context.

Follow-ups:
- **`HierarchyView` is the only UI for universities, programs, applications and
  deadlines** — and it is unreachable. So none of those four can be created by
  hand anywhere in the app today. Professors now have a home; the other four
  still do not. This is a bigger gap than the one reported and deserves its own
  task.
- `App.tsx` still fetches `universities`, `programs` and `professors` on every
  refresh into state nothing reads (they fed `HierarchyView`). Three wasted
  requests per refresh, left alone because the fix belongs with whatever
  resolves the item above.
