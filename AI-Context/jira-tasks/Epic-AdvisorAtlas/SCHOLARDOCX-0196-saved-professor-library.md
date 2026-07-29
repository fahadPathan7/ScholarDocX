# SCHOLARDOCX-0196: Saved professors as a library — click through to the dossier, capped at 100

Status: Completed

Owner: AI Agent

Epic: Epic-AdvisorAtlas

Created: 2026-07-28

## Summary

Follows SCHOLARDOCX-0195, which gave saved professors a home. The user then
scoped what that home should be: *"saved to professors is just a library of
professors and clicking these should open the dossier modal. nothing more or
less. and remove the add professor button here. improve ui. there should be
maximum 100 as saved here."*

The first version was a mini-CRUD — add, edit, delete, forms. That was the
wrong shape: the dossier is the record, this is the shelf. Rebuilt as
`AdvisorSavedProfessors`, replacing `ProfessorsView` (deleted, along with
`professors.css`).

## What it is now

- **A library.** No create form, no edit form. The card carries name, title,
  programme, research summary (clamped to four lines) and links.
- **Every card opens its dossier.** The whole card is the click target, with
  keyboard support; the remove button stops propagation so it does not open
  the dossier behind its own confirm dialog.
- **Remove stays**, because a capped collection the user curates needs a way
  to make room.
- **Capacity is visible** — `12/100`, turning amber past 90%.

### The link that made this possible

The foreign key runs candidate → professor (`saved_professor_id`), so a
professor row cannot find its dossier and the frontend cannot derive it. New
`GET /advisor-atlas/saved-professors` returns each professor joined to the
**most recent** candidate pointing at them, plus university and programme
names — one request instead of the three generic CRUD list calls the previous
version made.

A professor whose originating run has since been deleted has no candidate. The
card renders unclickable with "Dossier no longer available" rather than
appearing broken.

## The cap

`MAX_SAVED_PROFESSORS = 100`, a hard reject rather than FIFO eviction. That is
the call CODE_RULES makes for curated collections (Opportunity Library,
Research Expert saved analyses): silently deleting a professor the user
deliberately kept would be worse than refusing the 101st. Documented in the
Admin **Info tab → Save & Storage Caps** as the rule requires.

Two details worth keeping:

- **The cap applies to adding, not to re-saving.** Re-saving a professor
  already in the library refreshes them and keeps working at the cap;
  refusing that would strand the user's most useful action.
- **`SavedProfessorLimitReached` is its own exception type**, so the API can
  answer 409 ("the collection is full") rather than 400 ("your request was
  malformed"). The request was fine.

## Removing keeps the dossier honest

`remove_saved_professor` clears `saved_professor_id` on any candidate pointing
at the professor before deleting the row. Without that the dossier's Save
button would stay disabled on "Saved to professors" against a record that no
longer exists.

## Technical Context

- `advisor_atlas/repository.py`: `SavedProfessorLimitReached`,
  `count_saved_professors`, `list_saved_professors`, `remove_saved_professor`;
  `save_to_professors` takes `max_saved` and enforces it on the insert branch
  only.
- `api/advisor_atlas.py`: `MAX_SAVED_PROFESSORS`, `GET /saved-professors`,
  `DELETE /saved-professors/{id}`, 409 mapping on save.
- `advisor-atlas/AdvisorSavedProfessors.tsx`, `advisor-atlas-saved.css`
  (**new**); `ProfessorsView.tsx` and `professors.css` (**deleted**).
- `AdvisorAtlasView.tsx`: renders the library, passes `setCandidateId` as
  `onOpenDossier`; the dossier's `onChanged` now refreshes both the run and the
  library, since it can be opened from either side.
- `advisorAtlasApi.ts`: `SavedProfessor`, `SavedProfessorLibrary`,
  `listSavedProfessors`, `removeSavedProfessor`.
- `admin/InfoTab.tsx`: the cap row.
- `lib/professors.ts`: kept `matchesQuery`, `groupByUniversity`,
  `shouldRefetch`; removed `nameById` and `isContactable`, which the rebuild
  left unused.

## Layout revision (same session)

First pass looked wrong in place — reported as "ui does not look good". Five
causes, all layout rather than styling:

1. **No width ceiling.** Header, search field and group rules stretched the
   full width of a desktop window while the cards stayed card-sized, so the
   page read as unstyled chrome around one small object. Now capped at 1180px
   and centred.
2. **`auto-fill` marooned the single card.** It reserves empty tracks, so one
   card sat in a 300px column with dead space beside it. `auto-fit` collapses
   the empties.
3. **A heading announcing an absence.** "No university linked" was the first
   thing on the page, as a full-width rule. Group headings now appear only
   when there is more than one group — with one group they separate nothing —
   and the affiliation moved onto the card as a pill, where it belongs to the
   professor rather than to a bar across the page.
4. **No identity anchor.** Cards were pure text. Added the same initials mark
   the dossier header uses, so a card and the panel it opens read as one
   thing.
5. **The capacity box outweighed its importance.** A large bordered block for
   "1/100"; now a small pill that only turns amber near the ceiling.

Group headings, when shown, use a rule that stops at the label rather than
cutting the page in half.

## Scope

In scope: the files above and `lib/__tests__/professors.test.ts`.

Out of scope:
- Re-saving from the library (there is no "refresh" action here — open the
  dossier and use its own Refresh evidence).
- Sorting or filtering beyond free-text search and the university grouping.

## Verification Plan

- Direct execution of all 11 logic assertions via `node --experimental-strip-
  types`: search across every field and on sparse records, grouping and sort
  order, unaffiliated professors retained, unknown university id degrading to
  the residue group, and the four `shouldRefetch` cases.
- `npx tsc --noEmit` clean; backend compiles; `MAX_SAVED_PROFESSORS` and the
  exception import resolve.
- Tests updated, not run (`vitest` cannot execute in this environment — the
  checked-in `node_modules` holds the macOS rollup binary).

## Completion Notes

Changed files: as listed under Technical Context.

Carried forward from SCHOLARDOCX-0195, still open:
- `HierarchyView` remains the only (unreachable) UI for universities,
  programs, applications and deadlines. Professors no longer need it; those
  four still have no home.
- `App.tsx` still fetches `universities`, `programs` and `professors` into
  state nothing reads.
- No DOM testing library, so no component in this repo can have its rendered
  behaviour tested.
